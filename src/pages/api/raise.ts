/**
 * GET  /api/raise?postId=  -> { total, mine, signedIn }
 * POST /api/raise { postId, delta } -> upsert the caller's raises (cap 50), bump posts.raises_count and post_stats.
 * DELETE /api/raise { postId } -> take back all of the caller's raises on that article.
 * Writers cannot raise their own articles. Competition upvotes count each account once (src/lib/programme.ts).
 * Never purges the page cache (D-007).
 */
import type { APIRoute } from 'astro';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, posts, postStats, raises } from '../../lib/db';
import { todayUTC } from '../../lib/content';

export const prerender = false;
const MAX = 50;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store' } });

async function total(postId: string): Promise<number> {
  const d = db();
  if (postId.startsWith('editorial:')) {
    const [{ n }] = await d.select({ n: sql<number>`coalesce(sum(${raises.count}), 0)` }).from(raises).where(eq(raises.postId, postId));
    return Number(n);
  }
  const p = await d.query.posts.findFirst({ where: eq(posts.id, postId), columns: { raisesCount: true } });
  return p?.raisesCount ?? 0;
}

export const GET: APIRoute = async ({ url, locals }) => {
  const postId = url.searchParams.get('postId') ?? '';
  if (!postId) return json({ error: 'postId required' }, 400);
  const t = await total(postId);
  let mine = 0;
  if (locals.user) {
    const r = await db().query.raises.findFirst({ where: and(eq(raises.userId, locals.user.id), eq(raises.postId, postId)) });
    mine = r?.count ?? 0;
  }
  return json({ total: t, mine, signedIn: !!locals.user });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Sign in to raise.' }, 401);
  const parsed = z.object({ postId: z.string().min(3).max(120), delta: z.number().int().min(1).max(10_000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid' }, 400);
  const { postId } = parsed.data;
  const delta = Math.min(MAX, parsed.data.delta);
  const d = db();
  if (!postId.startsWith('editorial:')) {
    const p = await d.query.posts.findFirst({ where: eq(posts.id, postId), columns: { status: true, authorId: true } });
    if (!p || p.status !== 'published') return json({ error: 'Post not found.' }, 404);
    if (p.authorId === user.id) return json({ error: 'You cannot raise your own article.' }, 403);
  }
  const existing = await d.query.raises.findFirst({ where: and(eq(raises.userId, user.id), eq(raises.postId, postId)) });
  const before = existing?.count ?? 0;
  const after = Math.min(MAX, before + delta);
  const applied = after - before;
  if (applied > 0) {
    await d.insert(raises).values({ userId: user.id, postId, count: after, updatedAt: new Date() }).onConflictDoUpdate({ target: [raises.userId, raises.postId], set: { count: after, updatedAt: new Date() } });
    if (!postId.startsWith('editorial:')) await d.update(posts).set({ raisesCount: sql`${posts.raisesCount} + ${applied}` }).where(eq(posts.id, postId));
    await d.insert(postStats).values({ postId, day: todayUTC(), raises: applied }).onConflictDoUpdate({ target: [postStats.postId, postStats.day], set: { raises: sql`${postStats.raises} + ${applied}` } });
  }
  return json({ total: await total(postId), mine: after });
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Sign in first.' }, 401);
  const parsed = z.object({ postId: z.string().min(3).max(120) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid' }, 400);
  const { postId } = parsed.data;
  const d = db();
  const existing = await d.query.raises.findFirst({ where: and(eq(raises.userId, user.id), eq(raises.postId, postId)) });
  if (existing && existing.count > 0) {
    await d.delete(raises).where(and(eq(raises.userId, user.id), eq(raises.postId, postId)));
    if (!postId.startsWith('editorial:')) await d.update(posts).set({ raisesCount: sql`max(0, ${posts.raisesCount} - ${existing.count})` }).where(eq(posts.id, postId));
  }
  return json({ total: await total(postId), mine: 0 });
};
