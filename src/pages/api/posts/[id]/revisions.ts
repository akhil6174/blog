/**
 * GET /api/posts/<id>/revisions : the article's saved versions (newest first, up to 20), for the editor's History panel.
 * GET /api/posts/<id>/revisions?rev=<n> : one version's title and Tiptap document, to restore it.
 * Owner or admin only; never public.
 */
import type { APIRoute } from 'astro';
import { and, desc, eq } from 'drizzle-orm';
import { db, postRevisions, posts } from '../../../../lib/db';
import { hasRole } from '../../../../lib/auth';
import { renderDoc } from '../../../../lib/content';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

export const GET: APIRoute = async ({ params, locals, url }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Sign in' }, 401);
  const d = db();
  const p = await d.query.posts.findFirst({ where: eq(posts.id, params.id!), columns: { id: true, authorId: true } });
  if (!p || (p.authorId !== user.id && !hasRole(user, 'admin'))) return json({ error: 'Not found' }, 404);

  const rev = Number(url.searchParams.get('rev'));
  if (rev) {
    const r = await d.query.postRevisions.findFirst({ where: and(eq(postRevisions.postId, p.id), eq(postRevisions.id, rev)) });
    if (!r) return json({ error: 'Version not found' }, 404);
    return json({ id: r.id, title: r.title, savedAt: r.savedAt.toISOString(), bodyJson: JSON.parse(r.bodyJson) });
  }
  const rows = await d.select().from(postRevisions).where(eq(postRevisions.postId, p.id)).orderBy(desc(postRevisions.id)).limit(20);
  return json({
    revisions: rows.map((r) => {
      let words = 0;
      try {
        words = renderDoc(JSON.parse(r.bodyJson)).words;
      } catch {
        /* old or broken row */
      }
      return { id: r.id, title: r.title, savedAt: r.savedAt.toISOString(), words };
    }),
  });
};
