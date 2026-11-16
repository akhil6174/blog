/**
 * Live preview: renders with the SAME function the server uses when the article is saved (render-doc.ts)
 * and the same article CSS, so what you see here is what readers see.
 */
import { useMemo } from 'preact/hooks';
import type { JSONContent } from '@tiptap/core';
import { renderNode } from '../../lib/render-doc';

type Props = { title: string; subtitle: string; authorName: string; minutes: number; tags: string[]; coverImage: string; coverAlt: string; doc: JSONContent };

export default function Preview({ title, subtitle, authorName, minutes, tags, coverImage, coverAlt, doc }: Props) {
  const html = useMemo(() => renderNode(doc as never), [doc]);
  const date = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  return (
    <article class="mx-auto max-w-measure" aria-label="Preview">
      <p class="font-sans text-xs font-semibold uppercase tracking-wide text-accent">Community{tags.slice(0, 3).map((t) => <span key={t}><span class="text-muted"> · </span>{t}</span>)}</p>
      <h1 class="mt-3 font-sans text-3xl font-bold leading-tight tracking-tight md:text-4xl">{title || 'Untitled article'}</h1>
      {subtitle && <p class="mt-3 font-serif text-xl text-muted">{subtitle}</p>}
      <p class="mt-6 font-sans text-sm text-muted"><span class="font-medium text-ink">{authorName}</span> · {date} · {minutes} min read</p>
      {coverImage && <img src={coverImage} alt={coverAlt} class="mt-8 w-full rounded-lg border border-line" referrerpolicy="no-referrer" />}
      <div class="prose prose-article mt-8" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
