/**
 * GET /api/media/import?url=<image address>
 * Fetches a public image for a signed-in writer and returns its bytes, so the browser can crop and compress it and
 * upload a copy (no hotlinking: the image keeps working if the original site changes, and readers are not tracked
 * by it). Nothing is stored here; storage happens through POST /api/media after compression.
 *
 * Safety: validated address (checkImportUrl), public destinations only (global_fetch_strictly_public), at most
 * 3 redirects, 10 s timeout, 8 MB cap enforced while streaming, real file type checked from the first bytes.
 */
import type { APIRoute } from 'astro';
import { hasRole } from '../../../lib/auth';
import { checkImportUrl, IMPORT_MAX_BYTES, sniffImportable } from '../../../lib/media';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

export const GET: APIRoute = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Please sign in.' }, 401);
  if (!hasRole(user, 'writer')) return json({ error: 'Your account cannot add images yet.' }, 403);

  const checked = checkImportUrl(url.searchParams.get('url') ?? '');
  if ('error' in checked) return json({ error: checked.error }, 400);

  let target = checked.url;
  let res: Response | null = null;
  try {
    for (let hop = 0; hop < 4; hop++) {
      res = await fetch(target.toString(), {
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
        headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1', 'user-agent': 'TrutiAI-image-import/1.0' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        if (hop === 3) return json({ error: 'That address redirects too many times.' }, 400);
        const next = checkImportUrl(new URL(res.headers.get('location')!, target).toString());
        if ('error' in next) return json({ error: `The image redirects to an address that is not allowed. ${next.error}` }, 400);
        target = next.url;
        continue;
      }
      break;
    }
  } catch (e) {
    const timeout = (e as Error).name === 'TimeoutError';
    return json({ error: timeout ? 'The image site took too long to answer.' : 'The image could not be reached. Check the address, or download it and upload the file.' }, 502);
  }
  if (!res || !res.ok) return json({ error: `The image site answered ${res?.status ?? 'nothing'}. Check the address, or upload the file instead.` }, 502);

  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > IMPORT_MAX_BYTES) return json({ error: 'That image is larger than 8 MB.' }, 413);

  // Read with a hard cap, whatever the server claimed.
  const reader = res.body?.getReader();
  if (!reader) return json({ error: 'The image site sent nothing.' }, 502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > IMPORT_MAX_BYTES) {
      await reader.cancel();
      return json({ error: 'That image is larger than 8 MB.' }, 413);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  const type = sniffImportable(buf.buffer);
  if (!type) return json({ error: 'That address is not a JPG, PNG, WebP or GIF image (it may be a web page).' }, 415);

  return new Response(buf, { headers: { 'content-type': type, 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'x-content-type-options': 'nosniff', 'x-source-url': target.toString() } });
};
