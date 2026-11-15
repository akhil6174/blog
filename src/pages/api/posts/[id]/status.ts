import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, posts } from '../../../../lib/db';
import { hasRole } from '../../../../lib/auth';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return Response.json({ error: 'Sign in' }, { status: 401 });
  const p = await db().query.posts.findFirst({ where: eq(posts.id, params.id!), columns: { id: true, status: true, authorId: true, rejectReason: true, slug: true } });
  if (!p || (p.authorId !== user.id && !hasRole(user, 'admin'))) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ id: p.id, status: p.status, rejectReason: p.rejectReason, slug: p.slug }, { headers: { 'cache-control': 'no-store' } });
};
