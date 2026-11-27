/**
 * POST /api/me/notices { noticeId, body } : a recipient replies to a notice from the admin (D-050). Only people who
 * received the notice can reply; the admins are notified.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { NoticeError, replyAsRecipient } from '../../../lib/notices';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store' } });
const Body = z.object({ noticeId: z.number().int().positive(), body: z.string().trim().min(2, 'Write a reply.').max(2000) });

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Please sign in.' }, 401);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, 400);
  try {
    await replyAsRecipient(parsed.data.noticeId, locals.user.id, parsed.data.body);
    return json({ message: 'Reply sent.' });
  } catch (e) {
    if (e instanceof NoticeError) return json({ error: e.message }, e.message.includes('not available') ? 404 : 429);
    throw e;
  }
};
