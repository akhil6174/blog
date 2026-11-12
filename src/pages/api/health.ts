/**
 * GET /api/health
 * On-demand route (runs in the Worker). Reports which bindings are reachable.
 * Used after every deploy and by the Phase 0 "done when" check.
 *
 * Bindings are read with `import { env } from 'cloudflare:workers'` (Astro 6+ removed `locals.runtime.env`).
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async () => {
  const checks: Record<string, boolean | string> = {};

  try {
    const row = await env.DB.prepare('select 1 as ok').first<{ ok: number }>();
    checks.d1 = row?.ok === 1;
  } catch (e) {
    checks.d1 = `error: ${(e as Error).message}`;
  }

  try {
    await env.CACHE.get('health:ping');
    checks.kv = true;
  } catch (e) {
    checks.kv = `error: ${(e as Error).message}`;
  }

  // R2 (MEDIA) is deferred to Phase 3; its check is re-added together with the binding (see D-013).

  checks.ai = Boolean(env.AI);
  checks.workflow = Boolean(env.MODERATION);

  const ok = Object.values(checks).every((v) => v === true);

  return Response.json(
    {
      ok,
      time: new Date().toISOString(),
      aiModel: env.AI_MODEL_DEFAULT,
      checks,
    },
    { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } },
  );
};
