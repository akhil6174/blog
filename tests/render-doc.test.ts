import { describe, expect, it } from 'vitest';
import { headings, plainText, renderNode, youtubeId } from '../src/lib/render-doc';

const doc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Why Workers?' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Bold ' }, { type: 'text', text: 'link', marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://example.com' } }] }, { type: 'text', text: ' <script>' }] },
    { type: 'codeBlock', attrs: { language: 'bash' }, content: [{ type: 'text', text: 'npm i && echo "<b>"' }] },
    { type: 'image', attrs: { src: 'javascript:alert(1)', alt: 'x' } },
    { type: 'youtube', attrs: { src: 'https://www.youtube.com/watch?v=abc123DEF45' } },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }] },
  ],
};

describe('render-doc', () => {
  it('renders safe HTML with ugc links and escaped text', () => {
    const html = renderNode(doc as never);
    expect(html).toContain('<h2 id="why-workers">Why Workers?</h2>');
    expect(html).toContain('<a href="https://example.com" rel="ugc nofollow noopener" target="_blank"><strong>link</strong></a>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<pre><code class="language-bash">npm i &amp;&amp; echo &quot;&lt;b&gt;&quot;</code></pre>');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('youtube-nocookie.com/embed/abc123DEF45');
    expect(html).toContain('<ul><li><p>one</p></li></ul>');
  });
  it('extracts plain text and headings', () => {
    const text = plainText(doc as never);
    expect(text).toContain('Why Workers?');
    expect(text).toContain('Bold link');
    expect(headings(doc as never)).toEqual([{ depth: 2, text: 'Why Workers?', slug: 'why-workers' }]);
  });
  it('parses YouTube ids', () => {
    expect(youtubeId('https://youtu.be/abc')).toBe('abc');
    expect(youtubeId('https://www.youtube.com/shorts/xyz')).toBe('xyz');
    expect(youtubeId('https://evil.com/watch?v=1')).toBeNull();
  });
  it('renders underline, highlight and tables', () => {
    const d = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'u', marks: [{ type: 'underline' }] }, { type: 'text', text: 'm', marks: [{ type: 'highlight' }] }] },
        { type: 'table', content: [
          { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Plan' }] }] }, { type: 'tableHeader', attrs: { colspan: 2 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Limit' }] }] }] },
          { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Free' }] }] }, { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '100k' }] }] }] },
        ] },
      ],
    };
    const html = renderNode(d as never);
    expect(html).toContain('<p><u>u</u><mark>m</mark></p>');
    expect(html).toContain('<table><tbody><tr><th><p>Plan</p></th><th colspan="2"><p>Limit</p></th></tr><tr><td><p>Free</p></td><td><p>100k</p></td></tr></tbody></table>');
    expect(plainText(d as never)).toContain('Free 100k');
  });
});
