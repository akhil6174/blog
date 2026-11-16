/**
 * Browser-side image processing: decode, resize, crop and compress to WebP (JPEG where the browser cannot
 * encode WebP), then upload. Keeps every image small and keeps image work off the Worker.
 */
export const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
export const MAX_INPUT_BYTES = 20_000_000;
export const COVER_W = 1200;
export const COVER_H = 630;
export const BODY_MAX_W = 1600;

export function checkFile(file: File): string | null {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return 'Choose a JPG, PNG, WebP or GIF image.';
  if (file.size > MAX_INPUT_BYTES) return 'That file is over 20 MB. Choose a smaller image.';
  return null;
}

export async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error('This image could not be read. Try another file.');
  }
}

function toBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b && b.type === 'image/webp') return resolve(b);
      // Browsers without WebP encoding fall back to JPEG.
      canvas.toBlob((j) => (j ? resolve(j) : reject(new Error('Could not compress the image.'))), 'image/jpeg', quality);
    }, 'image/webp', quality);
  });
}

/** Scale down to maxW (never up) and compress. */
export async function resizeForBody(bmp: ImageBitmap, maxW = BODY_MAX_W): Promise<Blob> {
  const scale = Math.min(1, maxW / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return toBlob(c);
}

export type Crop = { zoom: number; x: number; y: number }; // x, y: pan offset in output pixels

/** Geometry shared by the live preview and the final render, so what you see is what is saved. */
export function coverGeometry(bmp: { width: number; height: number }, crop: Crop, outW = COVER_W, outH = COVER_H) {
  const base = Math.max(outW / bmp.width, outH / bmp.height);
  const s = base * crop.zoom;
  const w = bmp.width * s;
  const h = bmp.height * s;
  const maxX = (w - outW) / 2;
  const maxY = (h - outH) / 2;
  const x = Math.max(-maxX, Math.min(maxX, crop.x));
  const y = Math.max(-maxY, Math.min(maxY, crop.y));
  return { dx: (outW - w) / 2 + x, dy: (outH - h) / 2 + y, w, h, x, y };
}

export function drawCover(canvas: HTMLCanvasElement, bmp: ImageBitmap, crop: Crop): void {
  canvas.width = COVER_W;
  canvas.height = COVER_H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, COVER_W, COVER_H);
  const g = coverGeometry(bmp, crop);
  ctx.drawImage(bmp, g.dx, g.dy, g.w, g.h);
}

export async function renderCover(bmp: ImageBitmap, crop: Crop): Promise<Blob> {
  const c = document.createElement('canvas');
  drawCover(c, bmp, crop);
  return toBlob(c, 0.86);
}

export async function upload(blob: Blob, kind: 'cover' | 'body'): Promise<string> {
  const res = await fetch(`/api/media?kind=${kind}`, { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? `Upload failed (${res.status}).`);
  return data.url;
}

export function formatBytes(n: number): string {
  return n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;
}

/** Fetch a public image through our server (no hotlinking) and return it as a File for the normal crop/compress path. */
export async function importFromUrl(raw: string): Promise<File> {
  const url = raw.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('Paste a full image address starting with https://');
  const res = await fetch(`/api/media/import?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Import failed (${res.status}).`);
  }
  const blob = await res.blob();
  const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'image').slice(0, 80) || 'image';
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}
