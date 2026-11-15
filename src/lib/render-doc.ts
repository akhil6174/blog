/**
 * Tiptap JSON -> HTML and plain text, with no DOM dependency (runs inside Workers).
 * Supports exactly the node and mark set the Editor island enables. Unknown nodes render their children.
 * Output is still passed through sanitize-html in content.ts, so this renderer only needs to be correct, not defensive.
 */

type Mark = { type: string; attrs?: Record<string, unknown> };
type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: Mark[] };

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function attr(v: unknown): string {
  return esc(String(v ?? ''));
}

function safeUrl(u: unknown): string {
  const s = String(u ?? '').trim();
  return /^(https?:\/\/|mailto:|\/)/i.test(s) ? s : '';
}

function renderText(n: Node): string {
  let out = esc(n.text ?? '');
  for (const m of n.marks ?? []) {
    switch (m.type) {
      case 'bold':
        out = `<strong>${out}</strong>`;
        break;
      case 'italic':
        out = `<em>${out}</em>`;
        break;
      case 'strike':
        out = `<s>${out}</s>`;
        break;
      case 'code':
        out = `<code>${out}</code>`;
        break;
      case 'link': {
        const href = safeUrl(m.attrs?.href);
        if (href) out = `<a href="${attr(href)}" rel="ugc nofollow noopener" target="_blank">${out}</a>`;
        break;
      }
      default:
        break;
    }
  }
  return out;
}

function children(n: Node): string {
  return (n.content ?? []).map(renderNode).join('');
}

export function renderNode(n: Node): string {
  switch (n.type) {
    case 'doc':
      return children(n);
    case 'text':
      return renderText(n);
    case 'paragraph': {
      const inner = children(n);
      return inner ? `<p>${inner}</p>` : '';
    }
    case 'heading': {
      const lvl = Math.min(4, Math.max(2, Number(n.attrs?.level ?? 2)));
      const inner = children(n);
      const id = slugId(plainText(n));
      return `<h${lvl} id="${attr(id)}">${inner}</h${lvl}>`;
    }
    case 'bulletList':
      return `<ul>${children(n)}</ul>`;
    case 'orderedList': {
      const start = Number(n.attrs?.start ?? 1);
      return start > 1 ? `<ol start="${start}">${children(n)}</ol>` : `<ol>${children(n)}</ol>`;
    }
    case 'listItem':
      return `<li>${children(n)}</li>`;
    case 'blockquote':
      return `<blockquote>${children(n)}</blockquote>`;
    case 'codeBlock': {
      const lang = String(n.attrs?.language ?? '').replace(/[^a-z0-9+#-]/gi, '');
      const code = (n.content ?? []).map((c) => esc(c.text ?? '')).join('');
      return `<pre><code${lang ? ` class="language-${lang}"` : ''}>${code}</code></pre>`;
    }
    case 'horizontalRule':
      return '<hr>';
    case 'hardBreak':
      return '<br>';
    case 'image': {
      const src = safeUrl(n.attrs?.src);
      if (!src) return '';
      const alt = attr(n.attrs?.alt);
      const title = n.attrs?.title ? ` title="${attr(n.attrs.title)}"` : '';
      return `<figure><img src="${attr(src)}" alt="${alt}"${title} loading="lazy">${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure>`;
    }
    case 'youtube': {
      const src = String(n.attrs?.src ?? '');
      const id = youtubeId(src);
      if (!id) return '';
      return `<div data-youtube-video><iframe src="https://www.youtube-nocookie.com/embed/${attr(id)}" width="680" height="383" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" frameborder="0" title="YouTube video"></iframe></div>`;
    }
    default:
      return children(n);
  }
}

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    if (u.hostname.endsWith('youtube.com') || u.hostname.endsWith('youtube-nocookie.com')) {
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || null;
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
      return u.searchParams.get('v');
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function plainText(n: Node): string {
  if (n.type === 'text') return n.text ?? '';
  if (n.type === 'hardBreak') return '\n';
  const inner = (n.content ?? []).map(plainText).join(n.type === 'doc' ? '\n\n' : '');
  return ['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock'].includes(n.type) ? `${inner}\n` : inner;
}

export function slugId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

export function headings(n: Node): { depth: number; text: string; slug: string }[] {
  const out: { depth: number; text: string; slug: string }[] = [];
  const walk = (x: Node) => {
    if (x.type === 'heading') {
      const t = plainText(x).trim();
      out.push({ depth: Number(x.attrs?.level ?? 2), text: t, slug: slugId(t) });
    }
    for (const c of x.content ?? []) walk(c);
  };
  walk(n);
  return out;
}

export type { Node as TiptapNode };
