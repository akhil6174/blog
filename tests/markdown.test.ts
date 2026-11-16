import { describe, expect, it } from 'vitest';
import { editorialFile, escapeText, toMarkdown } from '../src/lib/markdown';

const t = (text: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...content: object[]) => ({ type: 'paragraph', content });
const doc = (...content: object[]) => ({ type: 'doc', content }) as never;

describe('toMarkdown', () => {
  it('converts headings, marks and links', () => {
    const md = toMarkdown(doc(
      { type: 'heading', attrs: { level: 2 }, content: [t('Why Workers')] },
      p(t('Plain, '), t('bold', [{ type: 'bold' }]), t(' and '), t('italic', [{ type: 'italic' }]), t(' and '), t('struck', [{ type: 'strike' }]), t('.')),
      p(t('A '), t('link', [{ type: 'link', attrs: { href: 'https://example.com/a b' } }]), t(' and '), t('npm i', [{ type: 'code' }]), t(' and '), t('u', [{ type: 'underline' }]), t(' and '), t('hi', [{ type: 'highlight' }])),
    ));
    expect(md).toBe('## Why Workers\n\nPlain, **bold** and *italic* and ~~struck~~.\n\nA [link](https://example.com/a%20b) and `npm i` and <u>u</u> and <mark>hi</mark>\n');
  });
  it('escapes text that would become Markdown or HTML', () => {
    expect(escapeText('a*b_c [x](y) <script> `t` | ~')).toBe('a\\*b\\_c \\[x\\](y) \\<script\\> \\`t\\` \\| \\~');
    expect(toMarkdown(doc(p(t('# not a heading'))))).toBe('\\# not a heading\n');
    expect(toMarkdown(doc(p(t('1. not a list'))))).toBe('\\1. not a list\n');
    expect(toMarkdown(doc(p(t('- not a list'))))).toBe('\\- not a list\n');
  });
  it('keeps spaces outside emphasis', () => {
    expect(toMarkdown(doc(p(t('a'), t(' bold ', [{ type: 'bold' }]), t('b'))))).toBe('a **bold** b\n');
  });
  it('converts lists, nested lists, quotes, code, rules, images, tables, YouTube', () => {
    const md = toMarkdown(doc(
      { type: 'bulletList', content: [
        { type: 'listItem', content: [p(t('one')), { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('nested'))] }] }] },
        { type: 'listItem', content: [p(t('two'))] },
      ] },
      { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p(t('three'))] }, { type: 'listItem', content: [p(t('four'))] }] },
      { type: 'blockquote', content: [p(t('quoted')), p(t('second'))] },
      { type: 'codeBlock', attrs: { language: 'bash' }, content: [t('echo "*not emphasis*"')] },
      { type: 'horizontalRule' },
      { type: 'image', attrs: { src: '/media/abc123def456.webp', alt: 'A [chart]' } },
      { type: 'image', attrs: { src: 'javascript:alert(1)', alt: 'x' } },
      { type: 'table', content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', content: [p(t('Plan'))] }, { type: 'tableHeader', content: [p(t('Limit'))] }] },
        { type: 'tableRow', content: [{ type: 'tableCell', content: [p(t('Free'))] }, { type: 'tableCell', content: [p(t('a|b'))] }] },
      ] },
      { type: 'youtube', attrs: { src: 'https://youtu.be/abc123' } },
    ));
    expect(md).toContain('- one\n\n   - nested\n- two');
    expect(md).toContain('3. three\n4. four');
    expect(md).toContain('> quoted\n>\n> second');
    expect(md).toContain('```bash\necho "*not emphasis*"\n```');
    expect(md).toContain('\n---\n');
    expect(md).toContain('![A chart](/media/abc123def456.webp)');
    expect(md).not.toContain('javascript:');
    expect(md).toContain('| Plan | Limit |\n| --- | --- |\n| Free | a\\|b |');
    expect(md).toContain('youtube-nocookie.com/embed/abc123');
  });
});

describe('editorialFile', () => {
  it('writes YAML-safe front matter', () => {
    const f = editorialFile({
      title: 'Astro: "free" hosting #1', description: 'A summary with: colons, "quotes" and a #hash that YAML must not misread at all.', pubDate: new Date('2026-11-16T10:00:00Z'),
      tags: ['astro', 'cloud: hosting'], author: 'akhil', category: 'cloud-and-hosting', seoTitle: 'Astro hosting', coverUrl: '/media/abc123def456.webp', coverAlt: 'Cover',
    }, doc(p(t('Body'))));
    expect(f).toBe([
      '---',
      'title: "Astro: \\"free\\" hosting #1"',
      'description: "A summary with: colons, \\"quotes\\" and a #hash that YAML must not misread at all."',
      'pubDate: 2026-11-16',
      'tags: ["astro", "cloud: hosting"]',
      'author: akhil',
      'category: "cloud-and-hosting"',
      'seoTitle: "Astro hosting"',
      'coverUrl: "/media/abc123def456.webp"',
      'coverAlt: "Cover"',
      '# Written in the TrutiAI editor. Edit it there: changes here are overwritten on the next publish.',
      '---',
      '',
      'Body',
      '',
    ].join('\n'));
  });
});
