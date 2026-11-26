/**
 * POST /api/admin/articles (admin only, via middleware; audited) (D-048):
 *  suggest { id, text }  : sends the writer "Suggestion from Akhilendra on “<title>”" with the full text and an edit link.
 *  delete  { id, reason }: moves the article to the trash (restorable from /admin), clears it from the site and
 *                          notifies the writer with the reason.
 * Approve, request changes, reject and unpublish stay in /api/admin/action.
 */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { audit } from '../../../lib/audit';
import { purgePostCaches } from '../../../lib/cache';
import { db, posts, user } from '../../../lib/db';
import { NOTICE_SENDER, sendNotice } from '../../../lib/notices';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store' } });

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suggest'), id: z.string().min(1).max(40), text: z.string().trim().min(10, 'Write at least 10 characters.').max(4000) }),
  z.object({ action: z.literal('delete'), id: z.string().min(1).max(40), reason: z.string().trim().min(10, 'Tell the writer why (at least 10 characters).').max(2000) }),
]);

const short = (t: string) => (t.length > 70 ? `${t.slice(0, 67)}…` : t);

export const POST: APIRoute = async ({ request, locals }) => {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, 400);
  const b = parsed.data;
  const d = db();
  const p = await d.query.posts.findFirst({ where: eq(posts.id, b.id) });
  if (!p) return json({ error: 'Article not found.' }, 404);
  const me = locals.user!;

  if (b.action === 'suggest') {
    if (p.authorId === me.id) return json({ error: 'This is your own article.' }, 400);
    const r = await sendNotice({
      title: `Suggestion on “${short(p.title)}”`,
      body: b.text,
      link: `/write/?id=${p.id}`,
      userIds: [p.authorId],
      audienceLabel: 'Writer',
      notifyTitle: `Suggestion from ${NOTICE_SENDER} on “${short(p.title)}”`,
      postId: p.id,
      kind: 'suggestion',
    });
    await audit(me.id, 'article:suggest', p.id, null);
    return json({ message: 'Suggestion sent. The writer sees it in their notifications.', noticeId: r.id });
  }

  if (p.status === 'trashed') return json({ error: 'This article is already deleted.' }, 400);
  if (p.kind === 'editorial') return json({ error: 'Editorial articles are deleted from the editor.' }, 400);
  await d.update(posts).set({ status: 'trashed', indexAllowed: false, adsAllowed: false, rejectReason: b.reason, updatedAt: new Date() }).where(eq(posts.id, p.id));
  const author = await d.query.user.findFirst({ where: eq(user.id, p.authorId), columns: { handle: true } });
  await purgePostCaches(p.slug, author?.handle);
  if (p.authorId !== me.id) {
    await sendNotice({
      title: `Your article “${short(p.title)}” was removed`,
      body: `Your article “${p.title}” has been removed from TrutiAI by the editor.\n\nReason:\n${b.reason}\n\nIf you think this is a mistake, reply by email to akhilendrad@trutiai.in.`,
      link: null,
      userIds: [p.authorId],
      audienceLabel: 'Writer',
      notifyTitle: `${NOTICE_SENDER} removed your article “${short(p.title)}”`,
      postId: p.id,
      kind: 'removal',
    });
  }
  await audit(me.id, 'article:delete', p.id, b.reason.slice(0, 200));
  return json({ message: 'Article deleted and the writer notified. You can restore it from the Trash on the dashboard.' });
};
