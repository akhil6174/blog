/**
 * Editor (Tiptap JSON) -> Markdown for editorial posts committed to src/content/posts/ (D-029).
 * Covers exactly the editor's node and mark set; text is escaped so it cannot turn into Markdown syntax.
 * Underline, highlight and YouTube use inline HTML (Astro Markdown allows it). Pure and unit-tested.
 */
import { youtubeId, type TiptapNode } from './render-doc';

type Mark = { type: string; attrs?: Record<string, unknown> };

/** Escape characters that Markdown or inline HTML would interpret. */
export function escapeText(s: string): string {
  return s.replace(/([\\`*_[\]<>|~])/g, '\\$1');
}

/** Escape a line start that would become a heading, list, quote or rule. */
function escapeLineStart(s: string): string {
  return s.replace(/^(\s*)(#{1,6}\s|[-+*]\s|\d+[.)]\s|>|={3,}|-{3,})/, (_m, sp: string, tok: string) => `${sp}\\${tok}`);
}

function safeUrl(u: unknown): string {
  const s = String(u ?? '').trim();
  return /^(https?:\/\/|mailto:|\/)/i.test(s) ? s.replace(/[()\s]/g, (c) => encodeURIComponent(c)) : '';
}

function inline(nodes: TiptapNode[] = []): string {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'hardBreak') {
      out += '  \n';
      continue;
    }
    if (n.type !== 'text') {
      out += inline(n.content);
      continue;
    }
    const marks = (n.marks ?? []) as Mark[];
    const isCode = marks.some((m) => m.type === 'code');
    let t = isCode ? n.text ?? '' : escapeText(n.text ?? '');
    if (isCode) {
      const ticks = t.includes('`') ? '``' : '`';
      t = `${ticks}${ticks.length > 1 ? ' ' : ''}${t}${ticks.length > 1 ? ' ' : ''}${ticks}`;
    }
    // Keep surrounding spaces outside emphasis markers (Markdown requires it).
    const lead = isCode ? '' : t.match(/^\s*/)![0];
    const trail = isCode ? '' : t.match(/\s*$/)![0];
    let core = isCode ? t : t.trim();
    if (!core) {
      out += t;
      continue;
    }
    for (const m of marks) {
      if (m.type === 'bold') core = `**${core}**`;
      else if (m.type === 'italic') core = `*${core}*`;
      else if (m.type === 'strike') core = `~~${core}~~`;
      else if (m.type === 'underline') core = `<u>${core}</u>`;
      else if (m.type === 'highlight') core = `<mark>${core}</mark>`;
    }
    const link = marks.find((m) => m.type === 'link');
    const href = link ? safeUrl(link.attrs?.href) : '';
    if (href) core = `[${core}](${href})`;
    out += `${lead}${core}${trail}`;
  }
  return out;
}

function cellText(n: TiptapNode): string {
  // inline() already escapes '|', so it is not escaped again here.
  return (n.content ?? []).map((p) => inline(p.content)).join(' ').replace(/\s*\n\s*/g, ' ').trim();
}

function block(n: TiptapNode, depth = 0): string {
  const pad = '   '.repeat(depth);
  switch (n.type) {
    case 'paragraph': {
      const text = inline(n.content);
      return text.trim() ? escapeLineStart(text) : '';
    }
    case 'heading': {
      const lvl = Math.min(4, Math.max(2, Number(n.attrs?.level ?? 2)));
      return `${'#'.repeat(lvl)} ${inline(n.content).replace(/\n/g, ' ').trim()}`;
    }
    case 'bulletList':
    case 'orderedList': {
      const start = Number(n.attrs?.start ?? 1);
      return (n.content ?? [])
        .map((li, i) => {
          const marker = n.type === 'orderedList' ? `${start + i}.` : '-';
          const parts = (li.content ?? []).map((c) => block(c, depth + 1)).filter(Boolean);
          const [first = '', ...rest] = parts;
          const firstLine = first.replace(/^\s+/, '');
          const restText = rest.map((r) => r.split('\n').map((l) => (l ? `${pad}   ${l.replace(/^\s+/, '')}` : l)).join('\n')).join('\n\n');
          return `${pad}${marker} ${firstLine}${restText ? `\n\n${restText}` : ''}`;
        })
        .join('\n');
    }
    case 'blockquote':
      return (n.content ?? []).map((c) => block(c)).filter(Boolean).join('\n\n').split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');
    case 'codeBlock': {
      const lang = String(n.attrs?.language ?? '').replace(/[^a-z0-9+#-]/gi, '');
      const code = (n.content ?? []).map((c) => c.text ?? '').join('');
      const fence = code.includes('```') ? '````' : '```';
      return `${fence}${lang}\n${code}\n${fence}`;
    }
    case 'horizontalRule':
      return '---';
    case 'image': {
      const src = safeUrl(n.attrs?.src);
      if (!src) return '';
      const alt = String(n.attrs?.alt ?? '').replace(/[[\]\n]/g, ' ').replace(/\s+/g, ' ').trim();
      return `![${alt}](${src})`;
    }
    case 'youtube': {
      const id = youtubeId(String(n.attrs?.src ?? ''));
      return id ? `<iframe src="https://www.youtube-nocookie.com/embed/${id}" width="680" height="383" title="YouTube video" allowfullscreen loading="lazy"></iframe>` : '';
    }
    case 'table': {
      const rows = (n.content ?? []).map((r) => (r.content ?? []).map(cellText));
      if (!rows.length) return '';
      const cols = Math.max(...rows.map((r) => r.length));
      const norm = rows.map((r) => [...r, ...Array(cols - r.length).fill('')]);
      const line = (r: string[]) => `| ${r.join(' | ')} |`;
      return [line(norm[0]), line(Array(cols).fill('---')), ...norm.slice(1).map(line)].join('\n');
    }
    default:
      return (n.content ?? []).map((c) => block(c, depth)).filter(Boolean).join('\n\n');
  }
}

export function toMarkdown(doc: TiptapNode): string {
  return `${(doc.content ?? []).map((n) => block(n)).filter((b) => b.trim()).join('\n\n')}\n`;
}

export type EditorialMeta = {
  title: string;
  description: string;
  pubDate: Date;
  updatedDate?: Date | null;
  tags: string[];
  author: string;
  category?: string | null;
  seoTitle?: string | null;
  coverUrl?: string | null;
  coverAlt?: string | null;
  /** Optional technical details (src/lib/tech.ts). */
  tech?: { difficulty?: string; stack?: string; versions?: string; testedOn?: string; repoUrl?: string; lastVerified?: string };
};

const yaml = (v: string) => JSON.stringify(v); // JSON strings are valid YAML scalars
// Calendar day in India time (the site's audience), so an article published at 1 am IST is not dated the day before.
const day = (d: Date) => new Date(d.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);

export function frontmatter(m: EditorialMeta): string {
  const lines = [
    '---',
    `title: ${yaml(m.title)}`,
    `description: ${yaml(m.description)}`,
    `pubDate: ${day(m.pubDate)}`,
    ...(m.updatedDate ? [`updatedDate: ${day(m.updatedDate)}`] : []),
    `tags: [${m.tags.map(yaml).join(', ')}]`,
    `author: ${m.author}`,
    ...(m.category ? [`category: ${yaml(m.category)}`] : []),
    ...(m.seoTitle ? [`seoTitle: ${yaml(m.seoTitle)}`] : []),
    ...(m.coverUrl ? [`coverUrl: ${yaml(m.coverUrl)}`, `coverAlt: ${yaml(m.coverAlt ?? '')}`] : []),
    ...(['difficulty', 'stack', 'versions', 'testedOn', 'repoUrl', 'lastVerified'] as const).filter((k) => m.tech?.[k]).map((k) => `${k}: ${yaml(m.tech![k]!)}`),
    '# Written in the TrutiAI editor. Edit it there: changes here are overwritten on the next publish.',
    '---',
    '',
    '',
  ];
  return lines.join('\n');
}

export function editorialFile(m: EditorialMeta, doc: TiptapNode): string {
  return frontmatter(m) + toMarkdown(doc);
}
