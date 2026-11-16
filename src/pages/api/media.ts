/**
 * POST /api/media?kind=cover|body  (body: the image bytes)
 * Signed-in writers only. Validates the real file type and size, enforces a daily limit, stores the file in KV
 * and returns its public path. Compression and cropping already happened in the browser (no image work here,
 * so the Worker stays far below its CPU limit).
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { hasRole } from '../../lib/auth';
import { newId, todayUTC } from '../../lib/content';
import { EXT, MEDIA_DAILY_LIMIT, MEDIA_MAX_BYTES, sniffImage } from '../../lib/media';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

export const POST: APIRoute = async ({ request, url, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Please sign in.' }, 401);
  if (!hasRole(user, 'writer')) return json({ error: 'Your account cannot upload images yet.' }, 403);

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MEDIA_MAX_BYTES) return json({ error: 'Image is too large (max 2 MB after compression).' }, 413);
  const buf = await request.arrayBuffer();
  if (buf.byteLength === 0) return json({ error: 'Empty file.' }, 400);
  if (buf.byteLength > MEDIA_MAX_BYTES) return json({ error: 'Image is too large (max 2 MB after compression).' }, 413);
  const type = sniffImage(buf);
  if (!type) return json({ error: 'Only JPG, PNG and WebP images are accepted.' }, 415);

  const admin = hasRole(user, 'admin');
  const countKey = `media-count:${user.id}:${todayUTC()}`;
  const used = Number((await env.CACHE.get(countKey)) ?? 0);
  if (!admin && used >= MEDIA_DAILY_LIMIT) return json({ error: `Upload limit reached (${MEDIA_DAILY_LIMIT} images per day).` }, 429);

  const kind = url.searchParams.get('kind') === 'cover' ? 'cover' : 'body';
  const id = newId();
  await env.CACHE.put(`media:${id}`, buf, { metadata: { type, size: buf.byteLength, owner: user.id, kind, at: Date.now() } });
  if (!admin) await env.CACHE.put(countKey, String(used + 1), { expirationTtl: 2 * 86400 });

  return json({ id, url: `/media/${id}.${EXT[type]}`, size: buf.byteLength, type });
};
