/**
 * DELETE /api/me : self-service account deletion (privacy policy promise).
 * Unpublishes the user's posts, then deletes the user row (sessions/accounts cascade).
 */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, posts, user as userTable } from '../../lib/db';
import { purgePostCaches } from '../../lib/cache';

export const prerender = false;

export const DELETE: APIRoute = async ({ locals }) => {
  const u = locals.user;
  if (!u) return Response.json({ error: 'Sign in' }, { status: 401 });
  const d = db();
  const mine = await d.select({ id: posts.id, slug: posts.slug }).from(posts).where(eq(posts.authorId, u.id));
  await d.update(posts).set({ status: 'unpublished', indexAllowed: false, adsAllowed: false }).where(eq(posts.authorId, u.id));
  await d.delete(userTable).where(eq(userTable.id, u.id));
  for (const p of mine) await purgePostCaches(p.slug);
  return Response.json({ ok: true }, { headers: { 'set-cookie': 'trutiai.session_token=; Max-Age=0; Path=/' } });
};
