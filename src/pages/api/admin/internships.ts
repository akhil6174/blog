/**
 * POST /api/admin/internships : intern codes (admin only, via middleware). Every success is audited.
 *   create { name, email, note }  -> new unique code; the intern can write (now, or on first sign-in)
 *   edit   { code, name, note }
 *   certificate { code, sent }     -> mark the certificate emailed (or undo)
 *   delete { code }                -> only when no article uses it
 */
import type { APIRoute } from 'astro';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, internCodes, posts } from '../../../lib/db';
import { audit } from '../../../lib/audit';
import { letWrite, newCode } from '../../../lib/internship';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store' } });

const Code = z.string().trim().toUpperCase().regex(/^INT-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), name: z.string().trim().min(2, 'Enter the intern\u2019s name.').max(80), email: z.string().trim().toLowerCase().email('Enter the Google email they will sign in with.'), note: z.string().trim().max(500).default('') }),
  z.object({ action: z.literal('edit'), code: Code, name: z.string().trim().min(2).max(80), note: z.string().trim().max(500).default('') }),
  z.object({ action: z.literal('certificate'), code: Code, sent: z.boolean() }),
  z.object({ action: z.literal('delete'), code: Code }),
]);

export const POST: APIRoute = async ({ request, locals }) => {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, 400);
  const b = parsed.data;
  const d = db();
  let message = 'Done.';
  let target = 'code' in b ? b.code : null;
  switch (b.action) {
    case 'create': {
      const existing = await d.query.internCodes.findFirst({ where: eq(internCodes.email, b.email) });
      if (existing) return json({ error: `${b.email} already has code ${existing.code}.` }, 400);
      let code = newCode();
      while (await d.query.internCodes.findFirst({ where: eq(internCodes.code, code) })) code = newCode();
      await d.insert(internCodes).values({ code, name: b.name, email: b.email, note: b.note || null });
      const when = await letWrite(b.email);
      target = code;
      message = `Code ${code} created for ${b.name}. ${when === 'now' ? 'They can write now.' : 'They can write as soon as they sign in with that email.'} Send them the code.`;
      break;
    }
    case 'edit':
      await d.update(internCodes).set({ name: b.name, note: b.note || null }).where(eq(internCodes.code, b.code));
      message = 'Saved.';
      break;
    case 'certificate':
      await d.update(internCodes).set({ certificateSentAt: b.sent ? new Date() : null }).where(eq(internCodes.code, b.code));
      message = b.sent ? 'Marked: certificate sent.' : 'Certificate mark removed.';
      break;
    case 'delete': {
      const [{ n }] = await d.select({ n: sql<number>`count(*)` }).from(posts).where(eq(posts.internCode, b.code));
      if (Number(n) > 0) return json({ error: 'Articles already use this code, so it cannot be deleted.' }, 400);
      await d.delete(internCodes).where(eq(internCodes.code, b.code));
      message = 'Code deleted.';
      break;
    }
  }
  await audit(locals.user!.id, `internship:${b.action}`, target, b.action === 'create' ? `${b.name} <${b.email}>` : null);
  return json({ message });
};
