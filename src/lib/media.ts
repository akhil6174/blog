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

export const IMPORT_MAX_BYTES = 8_000_000; // remote originals; the browser compresses them before upload

/** Like sniffImage, but also accepts GIF for imports (the browser converts it to WebP before upload). */
export function sniffImportable(buf: ArrayBuffer): MediaType | 'image/gif' | null {
  const t = sniffImage(buf);
  if (t) return t;
  const b = new Uint8Array(buf.slice(0, 6));
  return String.fromCharCode(...b) === 'GIF87a' || String.fromCharCode(...b) === 'GIF89a' ? 'image/gif' : null;
}

/**
 * Validate an image address before the server fetches it. Only plain http(s) on the default ports, no credentials,
 * no bare IP addresses or local names. (The Worker's global_fetch_strictly_public flag additionally blocks
 * any private or internal destination, including after redirects.)
 */
export function checkImportUrl(raw: string): { url: URL } | { error: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { error: 'That is not a valid web address.' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'Only http(s) image addresses can be imported.' };
  if (u.username || u.password) return { error: 'Addresses with a username or password are not allowed.' };
  if (u.port && u.port !== '443' && u.port !== '80') return { error: 'Only standard web ports are allowed.' };
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.')) return { error: 'That address is not public.' };
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith('[') || h.includes(':')) return { error: "Use the image's web address, not an IP address." };
  return { url: u };
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
