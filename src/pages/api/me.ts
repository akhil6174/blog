/**
 * PATCH  /api/me { name, bio, website } : edit the public profile shown on /writer/<handle>/.
 * DELETE /api/me : self-service account deletion (privacy policy promise).
 * Unpublishes the user's posts, then deletes the user row (sessions/accounts cascade).
 */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, posts, user as userTable } from '../../lib/db';
import { purgePaths, purgePostCaches } from '../../lib/cache';

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

const Profile = z.object({
  name: z.string().trim().min(2, 'Name needs at least 2 characters').max(60),
  bio: z.string().trim().max(300).default(''),
  website: z.union([z.literal(''), z.string().trim().max(200).regex(/^https:\/\/[^\s]+$/, 'Website must start with https://')]).default(''),
});

export const PATCH: APIRoute = async ({ request, locals }) => {
  const u = locals.user;
  if (!u) return Response.json({ error: 'Sign in' }, { status: 401 });
  const parsed = Profile.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid profile.' }, { status: 400 });
  const { name, bio, website } = parsed.data;
  await db().update(userTable).set({ name, bio: bio || null, website: website || null, updatedAt: new Date() }).where(eq(userTable.id, u.id));
  const handle = (await db().query.user.findFirst({ where: eq(userTable.id, u.id), columns: { handle: true } }))?.handle;
  if (handle) await purgePaths([`/writer/${handle}/`]).catch(() => {});
  return Response.json({ ok: true, message: 'Profile saved.' }, { headers: { 'cache-control': 'no-store' } });
};
