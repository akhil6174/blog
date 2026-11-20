/**
 * Numbers for a writer's dashboard on /me (D-041): all-time totals, this month, and the last 12 months of views,
 * upvotes (raises), comments and articles published. Read from post_stats (one row per article per day), so it
 * costs a few D1 reads and no writes. Months follow India time.
 */
import { and, gte, inArray, sql } from 'drizzle-orm';
import { db, postStats } from './db';
import { chunked } from './db/chunk';

import { lastMonths, monthKey, monthShort } from './months';
export { lastMonths, monthKey, monthShort };

export type Series = { label: string; key: string; value: number }[];
export type WriterStats = {
  totals: { articles: number; views: number; upvotes: number; comments: number };
  thisMonth: { articles: number; views: number; upvotes: number; comments: number };
  months: { views: Series; upvotes: Series; comments: Series; articles: Series };
};

type PostLite = { id: string; kind: string; slug: string; status: string; publishedAt: Date | null };

/** Stats for the given posts (the writer's own). Editorial articles are counted under "editorial:<slug>". */
export async function writerStats(posts: PostLite[], now = new Date()): Promise<WriterStats> {
  const published = posts.filter((p) => p.status === 'published' && p.publishedAt);
  const ids = published.map((p) => (p.kind === 'editorial' ? `editorial:${p.slug}` : p.id));
  const months = lastMonths(12, now);
  const d = db();
  const all = await chunked(ids, (part) => d.select({ views: sql<number>`coalesce(sum(${postStats.views}), 0)`, raises: sql<number>`coalesce(sum(${postStats.raises}), 0)`, comments: sql<number>`coalesce(sum(${postStats.comments}), 0)` }).from(postStats).where(inArray(postStats.postId, part)));
  const byMonth = await chunked(ids, (part) =>
    d
      .select({ month: sql<string>`substr(${postStats.day}, 1, 7)`, views: sql<number>`sum(${postStats.views})`, raises: sql<number>`sum(${postStats.raises})`, comments: sql<number>`sum(${postStats.comments})` })
      .from(postStats)
      .where(and(inArray(postStats.postId, part), gte(postStats.day, `${months[0]}-01`)))
      .groupBy(sql`substr(${postStats.day}, 1, 7)`),
  );
  const acc = new Map<string, { views: number; raises: number; comments: number }>();
  for (const r of byMonth) {
    const cur = acc.get(r.month) ?? { views: 0, raises: 0, comments: 0 };
    acc.set(r.month, { views: cur.views + Number(r.views), raises: cur.raises + Number(r.raises), comments: cur.comments + Number(r.comments) });
  }
  const articlesBy = new Map<string, number>();
  for (const p of published) articlesBy.set(monthKey(p.publishedAt!), (articlesBy.get(monthKey(p.publishedAt!)) ?? 0) + 1);
  const series = (pick: (m: string) => number): Series => months.map((key) => ({ key, label: monthShort(key), value: pick(key) }));
  const cur = months[months.length - 1];
  const sum = (k: 'views' | 'raises' | 'comments') => all.reduce((n, r) => n + Number(r[k]), 0);
  return {
    totals: { articles: published.length, views: sum('views'), upvotes: sum('raises'), comments: sum('comments') },
    thisMonth: { articles: articlesBy.get(cur) ?? 0, views: acc.get(cur)?.views ?? 0, upvotes: acc.get(cur)?.raises ?? 0, comments: acc.get(cur)?.comments ?? 0 },
    months: {
      views: series((m) => acc.get(m)?.views ?? 0),
      upvotes: series((m) => acc.get(m)?.raises ?? 0),
      comments: series((m) => acc.get(m)?.comments ?? 0),
      articles: series((m) => articlesBy.get(m) ?? 0),
    },
  };
}
