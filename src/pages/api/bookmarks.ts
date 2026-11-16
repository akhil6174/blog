/**
 * GET  /api/bookmarks?postId=  -> { saved, signedIn }
 * POST /api/bookmarks { postId } -> toggles the bookmark, returns { saved }
 * postId is a community post id or "editorial:<slug>". Saved articles are listed on /me/saved/.
 */
import type { APIRoute } from 'astro';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { bookmarks, db } from '../../lib/db';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store' } });

export const GET: APIRoute = async ({ url, locals }) => {
  const postId = url.searchParams.get('postId') ?? '';
  if (!locals.user) return json({ saved: false, signedIn: false });
  const row = postId ? await db().query.bookmarks.findFirst({ where: and(eq(bookmarks.userId, locals.user.id), eq(bookmarks.postId, postId)) }) : null;
  return json({ saved: !!row, signedIn: true });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Sign in to save articles.' }, 401);
  const parsed = z.object({ postId: z.string().min(3).max(120) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid' }, 400);
  const d = db();
  const where = and(eq(bookmarks.userId, user.id), eq(bookmarks.postId, parsed.data.postId));
  if (await d.query.bookmarks.findFirst({ where })) {
    await d.delete(bookmarks).where(where);
    return json({ saved: false });
  }
  const [{ n }] = await d.select({ n: sql<number>`count(*)` }).from(bookmarks).where(eq(bookmarks.userId, user.id));
  if (Number(n) >= 500) return json({ error: 'You can save up to 500 articles. Remove some first.' }, 429);
  await d.insert(bookmarks).values({ userId: user.id, postId: parsed.data.postId }).onConflictDoNothing();
  return json({ saved: true });
};
