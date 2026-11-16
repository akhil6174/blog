/**
 * Editorial publishing (D-029): admin articles from the editor are committed as Markdown to
 * src/content/posts/<slug>.md. The push triggers Workers Builds, and about two to three minutes later the article
 * is a normal static page at /blog/<slug>/ (home, topics, RSS, sitemap, search, share image all included).
 */
import { and, eq, isNotNull, lte } from 'drizzle-orm';
import { db, posts, postTags } from './db';
import { getSettingInt } from './db/settings';
import { CATEGORIES, SITE } from './site';
import { editorialFile } from './markdown';
import { parseTech } from './tech';
import { deleteFile, isDryRun, putFile } from './github';
import type { TiptapNode } from './render-doc';

export const EDITOR_MARKER = '# Written in the TrutiAI editor.';
export const postPath = (slug: string) => `src/content/posts/${slug}.md`;

type Post = typeof posts.$inferSelect;

/** Same rules the content collection enforces at build time, so a publish can never break the build. */
export async function editorialProblems(p: Post, tags: string[]): Promise<string[]> {
  const out: string[] = [];
  const minWords = await getSettingInt('min_words');
  if (p.title.trim().length < 10 || p.title.trim().length > 90) out.push('Title must be 10 to 90 characters.');
  const d = (p.description ?? '').trim();
  if (d.length < 50 || d.length > 160) out.push('Summary must be 50 to 160 characters.');
  if (tags.length < 1 || tags.length > 5) out.push('Use 1 to 5 tags.');
  if (tags.some((t) => t.length < 2)) out.push('Each tag needs at least 2 characters.');
  if (!CATEGORIES.some((c) => c.slug === p.category)) out.push('Choose a category.');
  if (p.wordCount < minWords) out.push(`Write at least ${minWords} words (now ${p.wordCount}).`);
  if (p.coverImage && !p.coverAlt) out.push('Describe the cover image (alt text).');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug)) out.push('The URL may only contain lowercase letters, numbers and hyphens.');
  return out;
}

async function tagNames(postId: string): Promise<string[]> {
  return (await db().select({ slug: postTags.tagSlug }).from(postTags).where(eq(postTags.postId, postId))).map((r) => r.slug);
}

export type PublishResult = { ok: true; url: string; commitUrl: string | null; dryRun: boolean; markdown?: string } | { ok: false; errors: string[] };

export async function publishEditorial(postId: string, now = new Date()): Promise<PublishResult> {
  const d = db();
  const p = await d.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!p) return { ok: false, errors: ['Article not found.'] };
  const tags = await tagNames(postId);
  const problems = await editorialProblems(p, tags);
  if (problems.length) return { ok: false, errors: problems };

  const first = !p.publishedAt;
  const pubDate = p.publishedAt ?? now;
  const md = editorialFile(
    {
      title: p.title.trim(),
      description: (p.description ?? '').trim(),
      pubDate,
      updatedDate: first ? null : now,
      tags,
      author: SITE.author.handle,
      category: p.category,
      seoTitle: p.seoTitle,
      coverUrl: p.coverImage,
      coverAlt: p.coverAlt,
      tech: parseTech(p.techMeta),
    },
    JSON.parse(p.bodyJson) as TiptapNode,
  );
  const res = await putFile(postPath(p.slug), md, `${first ? 'Publish' : 'Update'}: ${p.title.trim()}`, { mustOwnMarker: EDITOR_MARKER });
  if (!res.ok) return { ok: false, errors: [res.error] };

  await d.update(posts).set({ kind: 'editorial', status: 'published', publishedAt: pubDate, scheduledAt: null, indexAllowed: true, rejectReason: null, updatedAt: now }).where(eq(posts.id, postId));
  return { ok: true, url: `/blog/${p.slug}/`, commitUrl: res.commitUrl, dryRun: res.dryRun, ...(isDryRun() ? { markdown: md } : {}) };
}

export async function scheduleEditorial(postId: string, at: Date): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const d = db();
  const p = await d.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!p) return { ok: false, errors: ['Article not found.'] };
  if (p.publishedAt) return { ok: false, errors: ['This article is already published.'] };
  if (at.getTime() < Date.now() + 5 * 60_000) return { ok: false, errors: ['Pick a time at least 5 minutes from now.'] };
  const problems = await editorialProblems(p, await tagNames(postId));
  if (problems.length) return { ok: false, errors: problems };
  await d.update(posts).set({ kind: 'editorial', status: 'scheduled', scheduledAt: at, updatedAt: new Date() }).where(eq(posts.id, postId));
  return { ok: true };
}

export async function unscheduleEditorial(postId: string): Promise<void> {
  await db().update(posts).set({ status: 'draft', scheduledAt: null, updatedAt: new Date() }).where(and(eq(posts.id, postId), eq(posts.status, 'scheduled')));
}

export async function unpublishEditorial(postId: string): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const d = db();
  const p = await d.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!p) return { ok: false, errors: ['Article not found.'] };
  const res = await deleteFile(postPath(p.slug), `Unpublish: ${p.title.trim()}`);
  if (!res.ok) return { ok: false, errors: [res.error] };
  // Keep publishedAt so the URL stays reserved and locked; status shows it is offline.
  await d.update(posts).set({ status: 'unpublished', updatedAt: new Date() }).where(eq(posts.id, postId));
  return { ok: true };
}

/** Called by the cron every 15 minutes. */
export async function publishDueEditorials(now = new Date()): Promise<{ published: string[]; failed: { id: string; errors: string[] }[] }> {
  const due = await db()
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.kind, 'editorial'), eq(posts.status, 'scheduled'), isNotNull(posts.scheduledAt), lte(posts.scheduledAt, now)));
  const published: string[] = [];
  const failed: { id: string; errors: string[] }[] = [];
  for (const { id } of due) {
    const r = await publishEditorial(id, now);
    if (r.ok) published.push(id);
    else {
      failed.push({ id, errors: r.errors });
      await db().update(posts).set({ status: 'draft', scheduledAt: null, rejectReason: `Scheduled publish failed: ${r.errors.join(' ')}` }).where(eq(posts.id, id));
    }
  }
  return { published, failed };
}
