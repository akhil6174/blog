/**
 * Server-side helpers for community content: slugs, Tiptap JSON -> safe HTML, plain text, hashing, link counting.
 * Rendering happens ONCE on save (D-005) and the result is stored in posts.body_html.
 * The renderer is DOM-free (src/lib/render-doc.ts) because Workers have no DOM; the editor island keeps its own extension list.
 */
import sanitizeHtml from 'sanitize-html';
import { plainText, renderNode, type TiptapNode } from './render-doc';

export type TiptapDoc = { type: 'doc'; content?: unknown[] };

export function isTiptapDoc(x: unknown): x is TiptapDoc {
  return !!x && typeof x === 'object' && (x as { type?: string }).type === 'doc';
}

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: ['u', 'mark', 'p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'strong', 'em', 's', 'a', 'img', 'hr', 'br', 'iframe', 'span', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div'],
  allowedAttributes: {
    h2: ['id'], h3: ['id'], h4: ['id'],
    a: ['href', 'rel', 'target', 'title'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    code: ['class'],
    span: ['class'],
    pre: ['class'],
    iframe: ['src', 'width', 'height', 'allowfullscreen', 'allow', 'frameborder', 'title'],
    div: ['data-youtube-video'],
  },
  allowedSchemes: ['https', 'http', 'mailto'],
  allowedIframeHostnames: ['www.youtube-nocookie.com', 'www.youtube.com'],
  transformTags: {
    a: (tag, attribs) => ({ tagName: tag, attribs: { ...attribs, rel: 'ugc nofollow noopener', target: '_blank' } }),
    img: (tag, attribs) => ({ tagName: tag, attribs: { ...attribs, loading: 'lazy' } }),
  },
};

export function renderDoc(doc: TiptapDoc): { html: string; text: string; words: number } {
  const raw = renderNode(doc as TiptapNode);
  const html = sanitizeHtml(raw, SANITIZE);
  const text = plainText(doc as TiptapNode).replace(/\n{3,}/g, '\n\n').trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  return { html, text, words };
}

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 72) || 'post'
  );
}

export function externalLinks(html: string, ownHost: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    try {
      const h = new URL(m[1]).hostname;
      if (h !== ownHost && !h.endsWith(`.${ownHost}`)) out.push(m[1]);
    } catch {
      /* ignore */
    }
  }
  return out;
}

export async function contentHash(text: string): Promise<string> {
  const norm = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 220));
}

export function excerpt(text: string, max = 155): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

export function todayUTC(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
