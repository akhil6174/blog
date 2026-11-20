/**
 * Where uploaded images live (D-037). New uploads go to R2 (bucket `tech-blog-media`, binding MEDIA, key = image id).
 * Images uploaded before R2 was switched on are still in KV (`media:<id>`); reads fall back to KV, so every old
 * link keeps working until the admin's "Copy old images to R2" button (copyKvToR2) has copied them over. If the R2 binding is missing (local runs
 * without it), uploads go to KV as before.
 */
import { env } from 'cloudflare:workers';
import type { MediaType } from './media';

type Meta = { type: MediaType; size: number; owner: string; kind: string; at: number };
const r2 = () => (env as unknown as { MEDIA?: R2Bucket }).MEDIA;

export function storageName(): 'r2' | 'kv' {
  return r2() ? 'r2' : 'kv';
}

export async function putMedia(id: string, buf: ArrayBuffer, meta: Meta): Promise<void> {
  const bucket = r2();
  if (bucket) {
    await bucket.put(id, buf, {
      httpMetadata: { contentType: meta.type, cacheControl: 'public, max-age=31536000, immutable' },
      customMetadata: { owner: meta.owner, kind: meta.kind, at: String(meta.at), size: String(meta.size) },
    });
    return;
  }
  await env.CACHE.put(`media:${id}`, buf, { metadata: meta });
}

export async function getMedia(id: string): Promise<{ body: ArrayBuffer | ReadableStream; type: string } | null> {
  const bucket = r2();
  if (bucket) {
    const obj = await bucket.get(id);
    if (obj) return { body: obj.body, type: obj.httpMetadata?.contentType ?? 'image/webp' };
  }
  const { value, metadata } = await env.CACHE.getWithMetadata<{ type: MediaType }>(`media:${id}`, 'arrayBuffer');
  return value ? { body: value, type: metadata?.type ?? 'image/webp' } : null;
}

/**
 * Copy up to `limit` images from KV to R2, continuing from `cursor`. Runs inside the Worker (admin action), so it
 * needs no command line. Images already in R2 are skipped; nothing is deleted from KV (it stays as a fallback).
 * About 3 storage calls per image, well inside the Worker's per-request limit at 20 images per batch.
 */
export async function copyKvToR2(cursor: string | null, limit = 20): Promise<{ copied: number; skipped: number; cursor: string | null; done: boolean }> {
  const bucket = r2();
  if (!bucket) throw new Error('R2 is not connected (MEDIA binding missing).');
  const page = await env.CACHE.list<{ type?: MediaType }>({ prefix: 'media:', limit, cursor: cursor ?? undefined });
  let copied = 0;
  let skipped = 0;
  for (const k of page.keys) {
    const id = k.name.slice('media:'.length);
    if (await bucket.head(id)) {
      skipped++;
      continue;
    }
    const { value, metadata } = await env.CACHE.getWithMetadata<{ type?: MediaType; owner?: string; kind?: string; at?: number }>(k.name, 'arrayBuffer');
    if (!value) continue;
    await bucket.put(id, value, {
      httpMetadata: { contentType: metadata?.type ?? 'image/webp', cacheControl: 'public, max-age=31536000, immutable' },
      customMetadata: { owner: metadata?.owner ?? '', kind: metadata?.kind ?? '', at: String(metadata?.at ?? ''), size: String(value.byteLength), from: 'kv' },
    });
    copied++;
  }
  return { copied, skipped, cursor: page.list_complete ? null : page.cursor, done: page.list_complete };
}
