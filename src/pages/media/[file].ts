/**
 * GET /media/<id>.<ext> : serves an uploaded image from R2 (falling back to KV for images uploaded before R2),
 * cached at the edge for a year (files never change; a new upload gets a new id). After the first request per
 * data centre, storage and the Worker CPU are not touched.
 */
import type { APIRoute } from 'astro';
import { MEDIA_PATH } from '../../lib/media';
import { getMedia } from '../../lib/media-store';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const m = `/media/${params.file ?? ''}`.match(MEDIA_PATH);
  if (!m) return new Response('Not found', { status: 404 });
  const cache = caches.default;
  const key = new Request(new URL(request.url).toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;

  const file = await getMedia(m[1]);
  if (!file) return new Response('Not found', { status: 404, headers: { 'cache-control': 'public, max-age=60' } });
  const res = new Response(file.body, {
    headers: {
      'content-type': file.type,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  });
  await cache.put(key, res.clone());
  return res;
};
