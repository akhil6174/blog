/**
 * POST /api/admin/messages { title, body, link?, groups: ('ambassadors'|'interns')[], keys: string[] } : send a
 * notice to all ambassadors and/or all interns and/or chosen people (admin only, via middleware; audited).
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { audit } from '../../../lib/audit';
import { audience, NoticeError, sendNotice } from '../../../lib/notices';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store' } });

const Body = z.object({
  title: z.string().trim().min(3, 'Write a short title (at least 3 characters).').max(120),
  body: z.string().trim().min(5, 'Write the message.').max(4000),
  link: z.string().trim().max(300).optional().transform((v) => v || null).refine((v) => v === null || /^(https:\/\/|\/)[^\s]*$/.test(v), 'The link must start with https:// or /'),
  groups: z.array(z.enum(['ambassadors', 'interns'])).max(2).default([]),
  keys: z.array(z.string().max(200)).max(2000).default([]),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, 400);
  const b = parsed.data;
  const { ambassadors, interns } = await audience();
  const everyone = [...ambassadors, ...interns];
  const chosen = new Map<string, (typeof everyone)[number]>();
  if (b.groups.includes('ambassadors')) for (const r of ambassadors) chosen.set(r.key, r);
  if (b.groups.includes('interns')) for (const r of interns) chosen.set(r.key, r);
  const picked = new Set(b.keys);
  for (const r of everyone) if (picked.has(r.key)) chosen.set(r.key, r);
  const list = [...chosen.values()];
  const withAccount = list.filter((r) => r.userId);
  const labelParts = [
    b.groups.includes('ambassadors') && `All campus ambassadors (${ambassadors.length})`,
    b.groups.includes('interns') && `All interns (${interns.length})`,
    b.keys.length && `${b.keys.length} chosen`,
  ].filter(Boolean);
  try {
    const r = await sendNotice({ title: b.title, body: b.body, link: b.link, userIds: withAccount.map((x) => x.userId!), audienceLabel: labelParts.join(' + ') || 'Chosen people' });
    const skipped = list.length - withAccount.length;
    await audit(locals.user!.id, 'notice:send', String(r.id), `${r.sent} recipients`);
    return json({ message: `Sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}.${skipped ? ` ${skipped} ${skipped === 1 ? 'intern has' : 'interns have'} not signed in yet and did not get it.` : ''}`, id: r.id, sent: r.sent, skipped });
  } catch (e) {
    if (e instanceof NoticeError) return json({ error: e.message }, 400);
    throw e;
  }
};
