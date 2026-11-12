/**
 * Post helpers shared by pages: publishing rules, sorting, reading time, tags, related posts.
 * Drafts are visible in `npm run dev` and excluded from production builds.
 */
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;
export type Author = CollectionEntry<'authors'>;

export const POSTS_PER_PAGE = 10;

export async function getPublishedPosts(): Promise<Post[]> {
  const all = await getCollection('posts', ({ data }) => (import.meta.env.PROD ? !data.draft : true));
  return all.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export async function getAuthor(post: Post): Promise<Author> {
  const author = await getEntry(post.data.author);
  if (!author) throw new Error(`Unknown author "${post.data.author.id}" in post "${post.id}"`);
  return author;
}

export function readingMinutes(body: string | undefined): number {
  const words = (body ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function wordCount(body: string | undefined): number {
  return (body ?? '').trim().split(/\s+/).filter(Boolean).length;
}

export function tagSlug(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export type TagSummary = { tag: string; slug: string; count: number };

/** Tags with at least `min` posts. Tag pages are hidden below the threshold (SEO: no thin pages). */
export function tagSummaries(posts: Post[], min = 1): TagSummary[] {
  const counts = new Map<string, TagSummary>();
  for (const p of posts) {
    for (const tag of p.data.tags) {
      const slug = tagSlug(tag);
      const cur = counts.get(slug) ?? { tag, slug, count: 0 };
      cur.count += 1;
      counts.set(slug, cur);
    }
  }
  return [...counts.values()].filter((t) => t.count >= min).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Posts sharing the most tags with `post`, newest first on ties. */
export function relatedPosts(post: Post, all: Post[], limit = 3): Post[] {
  const mine = new Set(post.data.tags.map(tagSlug));
  return all
    .filter((p) => p.id !== post.id)
    .map((p) => ({ p, score: p.data.tags.filter((t) => mine.has(tagSlug(t))).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.p.data.pubDate.valueOf() - a.p.data.pubDate.valueOf())
    .slice(0, limit)
    .map((x) => x.p);
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function postUrl(post: Post): string {
  return `/blog/${post.id}/`;
}
