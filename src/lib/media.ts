/**
 * Uploaded images (D-023). Files are compressed in the browser, validated here, and stored in KV
 * (`CACHE` namespace, key `media:<id>`) until R2 is enabled. Served at /media/<id>.<ext> with long edge caching.
 */
export const MEDIA_MAX_BYTES = 2_000_000; // after browser compression images are usually 60-400 KB
export const MEDIA_DAILY_LIMIT = 40; // per writer; admins are not limited

export type MediaType = 'image/webp' | 'image/jpeg' | 'image/png';
export const EXT: Record<MediaType, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Identify the real file type from its first bytes; never trust the declared content type. */
export function sniffImage(buf: ArrayBuffer): MediaType | null {
  const b = new Uint8Array(buf.slice(0, 12));
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  const riff = String.fromCharCode(b[0], b[1], b[2], b[3]);
  const webp = String.fromCharCode(b[8], b[9], b[10], b[11]);
  if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';
  return null;
}

export const MEDIA_PATH = /^\/media\/([a-z0-9]{12,32})\.(webp|jpg|png)$/;

export function isImageSrc(src: string | null | undefined): boolean {
  if (!src) return false;
  if (MEDIA_PATH.test(src)) return true;
  try {
    const u = new URL(src);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
