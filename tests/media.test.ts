import { describe, expect, it } from 'vitest';
import { checkImportUrl, isImageSrc, sniffImage, sniffImportable } from '../src/lib/media';

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(12).fill(0)]).buffer;

describe('checkImportUrl', () => {
  const ok = (u: string) => 'url' in checkImportUrl(u);
  it('accepts normal public image addresses', () => {
    expect(ok('https://trutiai.in/og-default.png')).toBe(true);
    expect(ok('http://images.example.com/a/b.jpg?w=1200')).toBe(true);
    expect(ok('https://cdn.example.com:443/x.webp')).toBe(true);
  });
  it('rejects local, private-looking and odd addresses', () => {
    for (const u of [
      'ftp://example.com/a.png', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url',
      'http://localhost/a.png', 'http://app.localhost/a.png', 'http://printer.local/a.png', 'http://intranet/a.png',
      'http://127.0.0.1/a.png', 'http://169.254.169.254/latest', 'http://10.0.0.1/a.png', 'http://[::1]/a.png',
      'https://user:pass@example.com/a.png', 'https://example.com:8080/a.png', 'http://metadata.internal/a',
    ]) expect(ok(u), u).toBe(false);
  });
});

describe('file type sniffing', () => {
  it('recognises real image headers only', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff))).toBe('image/jpeg');
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47))).toBe('image/png');
    expect(sniffImage(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ').buffer)).toBe('image/webp');
    expect(sniffImage(new TextEncoder().encode('<html><body>hi</body></html>').buffer)).toBeNull();
    expect(sniffImage(new TextEncoder().encode('GIF89a......').buffer)).toBeNull();
    expect(sniffImportable(new TextEncoder().encode('GIF89a......').buffer)).toBe('image/gif');
  });
  it('isImageSrc accepts uploads and http(s) only', () => {
    expect(isImageSrc('/media/abcdef1234567890.webp')).toBe(true);
    expect(isImageSrc('https://x.com/a.png')).toBe(true);
    expect(isImageSrc('/media/../etc.webp')).toBe(false);
    expect(isImageSrc('data:image/png;base64,AAA')).toBe(false);
  });
});
