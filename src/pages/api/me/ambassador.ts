/**
 * POST /api/me/ambassador { code } : a student redeems the ambassador code the editor sent them and becomes their
 * college's Campus Ambassador (src/lib/ambassadors.ts).
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { AmbassadorError, redeemCode } from '../../../lib/ambassadors';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store' } });

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Please sign in.' }, 401);
  const parsed = z.object({ code: z.string().min(4).max(30) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Enter your ambassador code.' }, 400);
  try {
    const r = await redeemCode(locals.user.id, parsed.data.code);
    // A reader just became a writer: drop Better Auth's 5-minute cached session copy so the new role applies now.
    const headers = new Headers({ 'cache-control': 'no-store' });
    for (const name of ['trutiai.session_data', '__Secure-trutiai.session_data']) headers.append('set-cookie', `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${name.startsWith('__Secure') ? '; Secure' : ''}`);
    return Response.json({ message: `You are now the Campus Ambassador for ${r.college}.` }, { headers });
  } catch (e) {
    if (e instanceof AmbassadorError) return json({ error: e.message }, 400);
    throw e;
  }
};
