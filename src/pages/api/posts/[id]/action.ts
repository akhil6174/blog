/**
 * POST /api/posts/<id>/action { action } : the writer's own article actions from My articles.
 *  - withdraw: take a submission back while it waits for an editor (back to draft, keeps the feedback).
 *  - trash:    move a draft, declined or withdrawn article to the trash (purged after 30 days).
 *  - restore:  bring an article back from the trash as a draft.
 * Published articles are not trashed here (unpublishing is an editor decision).
 */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, posts } from '../../../../lib/db';
import { hasRole } from '../../../../lib/auth';
import { audit } from '../../../../lib/audit';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

const ALLOWED: Record<string, string[]> = {
  withdraw: ['pending_review', 'changes_requested'],
  trash: ['draft', 'rejected', 'changes_requested', 'unpublished'],
  restore: ['trashed'],
};

export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Sign in' }, 401);
  const parsed = z.object({ action: z.enum(['withdraw', 'trash', 'restore']) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid request.' }, 400);
  const { action } = parsed.data;
  const d = db();
  const p = await d.query.posts.findFirst({ where: eq(posts.id, params.id!), columns: { id: true, authorId: true, status: true, title: true } });
  if (!p || (p.authorId !== user.id && !hasRole(user, 'admin'))) return json({ error: 'Not found' }, 404);
  if (!ALLOWED[action].includes(p.status)) return json({ error: `You cannot ${action} an article that is ${p.status.replace('_', ' ')}.` }, 409);

  const status = action === 'trash' ? 'trashed' : 'draft';
  await d.update(posts).set({ status, scheduledAt: null, updatedAt: new Date() }).where(eq(posts.id, p.id));
  if (p.authorId !== user.id) await audit(user.id, `post_${action}`, p.id, p.title);
  const message = { withdraw: 'Withdrawn. It is a draft again.', trash: 'Moved to the trash. It is deleted for good after 30 days.', restore: 'Restored as a draft.' }[action];
  return json({ ok: true, status, message });
};
