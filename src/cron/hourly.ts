/**
 * Hourly cron (free). Writes are batched here so request handlers never write to KV (CLAUDE.md rule 3).
 *  1. Top 10 lists (today, this month, this year) from post_stats -> KV "top:<window>" as JSON.
 *  2. Purge the community listing/sitemap caches so new posts appear even if a purge was missed.
 *  3. Delete drafts untouched for 180 days with no title.
 *  4. Empty the trash: articles trashed more than 30 days ago (revisions and tags cascade).
 */
import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { db, posts, postStats } from '../lib/db';
import { purgePaths } from '../lib/cache';

export type TopEntry = { postId: string; views: number; raises: number; comments: number; score: number; slug?: string; title?: string; editorial?: string };

function since(window: 'today' | 'month' | 'year', now: Date): string {
  const d = new Date(now);
  if (window === 'today') return d.toISOString().slice(0, 10);
  if (window === 'month') return `${d.toISOString().slice(0, 7)}-01`;
  return `${d.getUTCFullYear()}-01-01`;
}

export async function computeTop(window: 'today' | 'month' | 'year', now = new Date(), limit = 10): Promise<TopEntry[]> {
  const d = db();
  const rows = await d
    .select({
      postId: postStats.postId,
      views: sql<number>`sum(${postStats.views})`,
      raises: sql<number>`sum(${postStats.raises})`,
      comments: sql<number>`sum(${postStats.comments})`,
    })
    .from(postStats)
    .where(gte(postStats.day, since(window, now)))
    .groupBy(postStats.postId)
    .orderBy(desc(sql`sum(${postStats.views}) + 5 * sum(${postStats.raises}) + 10 * sum(${postStats.comments})`))
    .limit(limit * 2);

  const scored: TopEntry[] = rows.map((r) => ({ postId: r.postId, views: Number(r.views), raises: Number(r.raises), comments: Number(r.comments), score: Number(r.views) + 5 * Number(r.raises) + 10 * Number(r.comments) }));
  const communityIds = scored.filter((s) => !s.postId.startsWith('editorial:')).map((s) => s.postId);
  if (communityIds.length) {
    const live = await d.select({ id: posts.id, slug: posts.slug, title: posts.title }).from(posts).where(and(inArray(posts.id, communityIds), eq(posts.status, 'published')));
    const map = new Map(live.map((p) => [p.id, p]));
    for (const s of scored) {
      const p = map.get(s.postId);
      if (p) {
        s.slug = p.slug;
        s.title = p.title;
      }
    }
  }
  for (const s of scored) if (s.postId.startsWith('editorial:')) s.editorial = s.postId.slice('editorial:'.length);
  // Drop community posts that are no longer published.
  return scored.filter((s) => s.editorial || s.slug).slice(0, limit);
}

export async function runHourly(now = new Date()): Promise<void> {
  for (const w of ['today', 'month', 'year'] as const) {
    const list = await computeTop(w, now);
    await env.CACHE.put(`top:${w}`, JSON.stringify({ at: now.toISOString(), list }), { expirationTtl: 3 * 3600 });
  }
  await purgePaths(['/community/', '/sitemap-community.xml', '/top/']);

  const cutoff = new Date(now.getTime() - 180 * 24 * 3600 * 1000);
  await db().delete(posts).where(and(eq(posts.status, 'draft'), eq(posts.title, 'Untitled draft'), lt(posts.updatedAt, cutoff), isNull(posts.submittedAt)));

  const trashCutoff = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  await db().delete(posts).where(and(eq(posts.status, 'trashed'), lt(posts.updatedAt, trashCutoff)));
}
