import { describe, expect, it } from 'vitest';
import { buildPortfolioHtml, crc32, makeZip, onColour, PORTFOLIO_TEMPLATES, resolvePalette, safeUrl } from '../src/lib/portfolio';
import { SAMPLE_RESUME } from '../src/lib/resume';

describe('portfolio builder', () => {
  it('has at least 10 templates with unique ids and full palettes', () => {
    expect(PORTFOLIO_TEMPLATES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(PORTFOLIO_TEMPLATES.map((t) => t.id)).size).toBe(PORTFOLIO_TEMPLATES.length);
    for (const t of PORTFOLIO_TEMPLATES) for (const v of Object.values(t.palette)) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('builds a complete page for every template', () => {
    for (const t of PORTFOLIO_TEMPLATES) {
      const html = buildPortfolioHtml(SAMPLE_RESUME, { template: t.id });
      expect(html.startsWith('<!doctype html>')).toBe(true);
      expect(html).toContain(`<title>${SAMPLE_RESUME.name}`);
      expect(html).toContain('id="projects"');
      expect(html).toContain(`--bg:${t.palette.bg}`);
      expect(html).not.toContain('undefined');
    }
  });

  it('applies custom colours and ignores invalid ones', () => {
    const p = resolvePalette('minimal', { bg: '#123456', accent: 'red', text: '#zzzzzz' as string });
    expect(p.bg).toBe('#123456');
    expect(p.accent).toBe(PORTFOLIO_TEMPLATES.find((t) => t.id === 'minimal')!.palette.accent);
    const html = buildPortfolioHtml(SAMPLE_RESUME, { template: 'neon', colors: { heroBg: '#00ff00', accent: '#ffff00' } });
    expect(html).toContain('--hero:#00ff00');
    expect(html).toContain('--on-a:#111111'); // dark text on a yellow button
    expect(onColour('#1d4ed8')).toBe('#ffffff');
  });

  it('escapes text and drops unsafe links', () => {
    const html = buildPortfolioHtml({ ...SAMPLE_RESUME, name: '<script>alert(1)</script>', links: [{ label: 'x', url: 'javascript:alert(1)' }, { label: 'GitHub', url: 'github.com/me' }] }, { template: 'dark', photo: 'data:text/html,<b>' });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="https://github.com/me"');
    expect(html).not.toContain('data:text/html');
    expect(safeUrl('mailto:a@b.co')).toBe('mailto:a@b.co');
    expect(safeUrl('data:text/html,x')).toBeNull();
  });

  it('can turn the TrutiAI credit off', () => {
    expect(buildPortfolioHtml(SAMPLE_RESUME, { template: 'minimal' })).toContain('TrutiAI portfolio builder</a>');
    expect(buildPortfolioHtml(SAMPLE_RESUME, { template: 'minimal', credit: false })).not.toContain('TrutiAI portfolio builder</a>');
  });

  it('makes a valid zip with the right file names and checksums', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const zip = makeZip([{ name: 'index.html', text: '<p>hi</p>' }, { name: 'README.md', text: '# x' }]);
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(2);
    const cd = v.getUint32(end + 16, true);
    expect(v.getUint32(cd, true)).toBe(0x02014b50);
    const nameLen = v.getUint16(cd + 28, true);
    expect(new TextDecoder().decode(zip.slice(cd + 46, cd + 46 + nameLen))).toBe('index.html');
    expect(v.getUint32(cd + 16, true)).toBe(crc32(new TextEncoder().encode('<p>hi</p>')));
  });
});
