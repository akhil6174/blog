/**
 * Article search shared by /articles (explore page) and /api/search (the header's live search).
 * Editorial articles come from the content collection; community articles from D1, only while `community_open`.
 * Matches title, summary, text, tags and writer name; filters by category, tags and writer; sorts by newest,
 * most upvoted (one per account) or most viewed.
 */
import { getCollection } from 'astro:content';
import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { db, posts, postStats, postTags, raises, tags as tagTable, user } from './db';
import { getSettingBool } from './db/settings';
import { chunked } from './db/chunk';
import { readingMinutes, tagSlug } from './posts';

export type ArticleCard = { id: string; url: string; title: string; description: string; cover: string | null; coverAlt: string; authorName: string; authorImage: string | null; authorUrl: string | null; category: string | null; tags: { slug: string; name: string }[]; date: Date; minutes: number; upvotes: number; views: number };
export type ArticleQuery = { q?: string; category?: string; tags?: string[]; author?: string; sort?: string };

export async function findArticles(opts: ArticleQuery): Promise<ArticleCard[]> {
  const q = (opts.q ?? '').trim().slice(0, 80);
  const category = opts.category ?? '';
  const wantTags = opts.tags ?? [];
  const author = (opts.author ?? '').trim().slice(0, 60);
  const sort = opts.sort ?? 'new';
  const lower = q.toLowerCase();
  const has = (s: string | null | undefined) => !!s && s.toLowerCase().includes(lower);

  // ---- Editorial (content collection) ----
  const authorsCol = new Map((await getCollection('authors')).map((a) => [a.id, a.data]));
  const editorialAll = await getCollection('posts', ({ data }) => !data.draft);
  const edIds = editorialAll.map((p) => `editorial:${p.id}`);
  const d = db();
  const edRaises = await chunked(edIds, (part) => d.select({ id: raises.postId, n: sql<number>`count(*)` }).from(raises).where(inArray(raises.postId, part)).groupBy(raises.postId));
  const edViews = await chunked(edIds, (part) => d.select({ id: postStats.postId, n: sql<number>`sum(${postStats.views})` }).from(postStats).where(inArray(postStats.postId, part)).groupBy(postStats.postId));
  const er = new Map(edRaises.map((r) => [r.id, Number(r.n)]));
  const ev = new Map(edViews.map((r) => [r.id, Number(r.n)]));

  const editorial: ArticleCard[] = editorialAll
    .map((p) => {
      const a = authorsCol.get(p.data.author.id);
      return {
        id: `editorial:${p.id}`, url: `/blog/${p.id}/`, title: p.data.title, description: p.data.description,
        cover: p.data.cover?.src ?? p.data.coverUrl ?? null, coverAlt: p.data.coverAlt ?? '',
        authorName: a?.name ?? 'TrutiAI', authorImage: a?.avatar.src ?? null, authorUrl: a ? `/author/${a.handle}/` : null,
        category: p.data.category ?? null, tags: p.data.tags.map((t) => ({ slug: tagSlug(t), name: t })),
        date: p.data.pubDate, minutes: readingMinutes(p.body), upvotes: er.get(`editorial:${p.id}`) ?? 0, views: ev.get(`editorial:${p.id}`) ?? 0,
        body: p.body ?? '',
      };
    })
    .filter((c) => (!q || has(c.title) || has(c.description) || has(c.body) || has(c.authorName) || c.tags.some((t) => has(t.name)))
      && (!category || c.category === category)
      && wantTags.every((t) => c.tags.some((x) => x.slug === t))
      && (!author || c.authorName.toLowerCase().includes(author.toLowerCase())))
    .map(({ body: _b, ...c }) => c);

  // ---- Community (D1), only when the community is open ----
  let community: ArticleCard[] = [];
  if (await getSettingBool('community_open')) {
    const where = [eq(posts.status, 'published'), eq(posts.kind, 'community')];
    if (category) where.push(eq(posts.category, category));
    if (q) {
      const pat = `%${q.replace(/[%_]/g, '')}%`;
      // Subqueries instead of id lists: D1 caps bound values per statement.
      const tagHits = d.select({ id: postTags.postId }).from(postTags).innerJoin(tagTable, eq(tagTable.slug, postTags.tagSlug)).where(like(tagTable.name, pat));
      const ors = [like(posts.title, pat), like(posts.description, pat), like(posts.bodyText, pat), like(user.name, pat), inArray(posts.id, tagHits)];
      where.push(or(...ors)!);
    }
    if (author) where.push(like(user.name, `%${author.replace(/[%_]/g, '')}%`));
    for (const t of wantTags) where.push(inArray(posts.id, d.select({ id: postTags.postId }).from(postTags).where(eq(postTags.tagSlug, t))));
    const rows = await d
      .select({ id: posts.id, slug: posts.slug, title: posts.title, description: posts.description, cover: posts.coverImage, coverAlt: posts.coverAlt, category: posts.category, publishedAt: posts.publishedAt, minutes: posts.readingMinutes, raises: posts.raisesCount, views: posts.viewsCount, authorName: user.name, authorImage: user.image, authorHandle: user.handle })
      .from(posts)
      .innerJoin(user, eq(user.id, posts.authorId))
      .where(and(...where))
      .orderBy(desc(posts.publishedAt))
      .limit(500);
    const voters = await chunked(rows.map((r) => r.id), (part) => d.select({ id: raises.postId, n: sql<number>`count(*)` }).from(raises).where(inArray(raises.postId, part)).groupBy(raises.postId));
    const vm = new Map(voters.map((v) => [v.id, Number(v.n)]));
    const tagRows = await chunked(rows.map((r) => r.id), (part) => d.select({ postId: postTags.postId, slug: tagTable.slug, name: tagTable.name }).from(postTags).innerJoin(tagTable, eq(tagTable.slug, postTags.tagSlug)).where(inArray(postTags.postId, part)));
    community = rows.map((r) => ({
      id: r.id, url: `/p/${r.slug}/`, title: r.title, description: r.description ?? '', cover: r.cover, coverAlt: r.coverAlt ?? '',
      authorName: r.authorName, authorImage: r.authorImage, authorUrl: r.authorHandle ? `/writer/${r.authorHandle}/` : null,
      category: r.category, tags: tagRows.filter((t) => t.postId === r.id).map((t) => ({ slug: t.slug, name: t.name })),
      date: r.publishedAt ?? new Date(0), minutes: r.minutes, upvotes: vm.get(r.id) ?? 0, views: r.views,
    }));
  }

  return [...editorial, ...community].sort((a, b) =>
    sort === 'upvoted' ? b.upvotes - a.upvotes || b.date.valueOf() - a.date.valueOf()
    : sort === 'viewed' ? b.views - a.views || b.date.valueOf() - a.date.valueOf()
    : b.date.valueOf() - a.date.valueOf());
}
