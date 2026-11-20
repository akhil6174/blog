/**
 * /api/me/dsa : the signed-in student's DSA sheet (src/lib/dsa.ts). Signed-out calls get 401 (the island then keeps progress on the device).
 * GET  -> { progress }
 * POST { action: 'set', id, solved?, revise? } | { action: 'merge', items }
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { DsaError, getProgress, mergeProgress, setProgress } from '../../../lib/dsa';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store' } });

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Sign in to sync your progress.' }, 401);
  const id = locals.user!.id;
  return json({ progress: await getProgress(id) });
};

const Id = z.string().min(1).max(100);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set'), id: Id, solved: z.boolean().optional(), revise: z.boolean().optional() }),
  z.object({ action: z.literal('merge'), items: z.array(z.object({ id: Id, solvedAt: z.number().nullable(), revise: z.boolean() })).max(400) }),
]);

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Sign in to sync your progress.' }, 401);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid request.' }, 400);
  const b = parsed.data;
  const uid = locals.user!.id;
  try {
    if (b.action === 'set') return json({ item: await setProgress(uid, b.id, { solved: b.solved, revise: b.revise }) });
    return json({ added: await mergeProgress(uid, b.items) });
  } catch (e) {
    if (e instanceof DsaError) return json({ error: e.message }, 400);
    throw e;
  }
};
