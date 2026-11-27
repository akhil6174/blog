/**
 * POST /api/admin/message-reply { noticeId, userId, body } : the admin answers one recipient's replies to a notice
 * (admin only, via middleware; audited) (D-050). The recipient is notified.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { audit } from '../../../lib/audit';
import { NoticeError, replyAsAdmin } from '../../../lib/notices';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store' } });
const Body = z.object({ noticeId: z.number().int().positive(), userId: z.string().min(1).max(64), body: z.string().trim().min(2, 'Write a reply.').max(4000) });

export const POST: APIRoute = async ({ request, locals }) => {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, 400);
  const b = parsed.data;
  try {
    await replyAsAdmin(b.noticeId, b.userId, b.body);
    await audit(locals.user!.id, 'notice:reply', String(b.noticeId), b.userId);
    return json({ message: 'Reply sent. They will see it in their notifications.' });
  } catch (e) {
    if (e instanceof NoticeError) return json({ error: e.message }, 400);
    throw e;
  }
};
