/**
 * POST /api/admin/ambassadors : colleges and campus ambassadors (admin only, via middleware). Every success is
 * audited. Actions: add_colleges { text }, assign { id, email }, remove { id }, certificate { id, sent },
 * delete { id }, create_code { id } (one-time code the student enters on /me).
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { audit } from '../../../lib/audit';
import { addColleges, AmbassadorError, assignAmbassador, createCode, deleteCollege, removeAmbassador, setCertificate } from '../../../lib/ambassadors';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store' } });

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add_colleges'), text: z.string().max(200_000) }),
  z.object({ action: z.literal('assign'), id: z.number().int(), email: z.string().trim().toLowerCase().email('Enter the Google email they signed in with.') }),
  z.object({ action: z.literal('remove'), id: z.number().int() }),
  z.object({ action: z.literal('certificate'), id: z.number().int(), sent: z.boolean() }),
  z.object({ action: z.literal('delete'), id: z.number().int() }),
  z.object({ action: z.literal('create_code'), id: z.number().int() }),
]);

export const POST: APIRoute = async ({ request, locals }) => {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, 400);
  const b = parsed.data;
  try {
    let message = 'Done.';
    let detail: string | null = null;
    let code: string | undefined;
    if (b.action === 'add_colleges') {
      const r = await addColleges(b.text);
      message = `${r.added} ${r.added === 1 ? 'college' : 'colleges'} added${r.skipped ? `, ${r.skipped} already in the list` : ''}.`;
      detail = `${r.added} added`;
    } else if (b.action === 'assign') {
      const r = await assignAmbassador(b.id, b.email);
      message = `${r.name} is now the ambassador for ${r.college}. Their badge is live.`;
      detail = `${b.email} -> ${r.college}`;
    } else if (b.action === 'remove') {
      await removeAmbassador(b.id);
      message = 'Ambassador removed. The college is open again.';
    } else if (b.action === 'certificate') {
      await setCertificate(b.id, b.sent);
      message = b.sent ? 'Marked: certificate sent.' : 'Certificate mark removed.';
    } else if (b.action === 'create_code') {
      code = await createCode(b.id);
      message = `Code created: ${code}. Send it to the student; they enter it on their dashboard (trutiai.in/me/).`;
    } else {
      await deleteCollege(b.id);
      message = 'College deleted.';
    }
    await audit(locals.user!.id, `ambassador:${b.action}`, 'id' in b ? String(b.id) : null, detail);
    return json({ message, ...(code ? { code } : {}) });
  } catch (e) {
    if (e instanceof AmbassadorError) return json({ error: e.message }, 400);
    throw e;
  }
};
