/**
 * Read helpers for community pages.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, posts, postTags, tags, user } from './db';

export type PublicPost = typeof posts.$inferSelect & { author: { id: string; name: string; handle: string | null; image: string | null; bio: string | null }; tags: { slug: string; name: string }[] };

export async function listPublished(opts: { limit: number; offset?: number; tag?: string; authorId?: string; category?: string }): Promise<PublicPost[]> {
  const d = db();
  const where = [eq(posts.status, 'published'), eq(posts.kind, 'community')];
  if (opts.authorId) where.push(eq(posts.authorId, opts.authorId));
  if (opts.category) where.push(eq(posts.category, opts.category));
  // Subquery, not an id list: D1 caps bound values per statement, and a tag can have hundreds of posts.
  if (opts.tag) where.push(inArray(posts.id, d.select({ id: postTags.postId }).from(postTags).where(eq(postTags.tagSlug, opts.tag))));
  const rows = await d.select().from(posts).where(and(...where)).orderBy(desc(posts.featured), desc(posts.publishedAt)).limit(opts.limit).offset(opts.offset ?? 0);
  return hydrate(rows);
}

export async function countPublished(authorId?: string): Promise<number> {
  const where = authorId ? and(eq(posts.status, 'published'), eq(posts.kind, 'community'), eq(posts.authorId, authorId)) : and(eq(posts.status, 'published'), eq(posts.kind, 'community'));
  const [{ n }] = await db().select({ n: sql<number>`count(*)` }).from(posts).where(where);
  return Number(n);
}

export async function getPublishedBySlug(slug: string): Promise<PublicPost | null> {
  const row = await db().query.posts.findFirst({ where: and(eq(posts.slug, slug), eq(posts.kind, 'community')) });
  if (!row) return null;
  const [p] = await hydrate([row]);
  return p;
}

export async function relatedCommunity(post: PublicPost, limit = 3): Promise<PublicPost[]> {
  if (post.tags.length === 0) return [];
  const d = db();
  const ids = await d
    .select({ id: postTags.postId, n: sql<number>`count(*)` })
    .from(postTags)
    .where(inArray(postTags.tagSlug, post.tags.map((t) => t.slug)))
    .groupBy(postTags.postId)
    .orderBy(desc(sql`count(*)`))
    .limit(limit + 1);
  const candidates = ids.map((x) => x.id).filter((id) => id !== post.id).slice(0, limit);
  if (!candidates.length) return [];
  const rows = await d.select().from(posts).where(and(inArray(posts.id, candidates), eq(posts.status, 'published'), eq(posts.kind, 'community')));
  return hydrate(rows);
}

async function hydrate(rows: (typeof posts.$inferSelect)[]): Promise<PublicPost[]> {
  if (rows.length === 0) return [];
  const d = db();
  const authorIds = [...new Set(rows.map((r) => r.authorId))];
  const authors = await d.select({ id: user.id, name: user.name, handle: user.handle, image: user.image, bio: user.bio }).from(user).where(inArray(user.id, authorIds));
  const am = new Map(authors.map((a) => [a.id, a]));
  const tagRows = await d
    .select({ postId: postTags.postId, slug: tags.slug, name: tags.name })
    .from(postTags)
    .innerJoin(tags, eq(tags.slug, postTags.tagSlug))
    .where(inArray(postTags.postId, rows.map((r) => r.id)));
  const tm = new Map<string, { slug: string; name: string }[]>();
  for (const t of tagRows) tm.set(t.postId, [...(tm.get(t.postId) ?? []), { slug: t.slug, name: t.name }]);
  return rows.map((r) => ({ ...r, author: am.get(r.authorId) ?? { id: r.authorId, name: 'Former member', handle: null, image: null, bio: null }, tags: tm.get(r.id) ?? [] }));
}

export async function getWriter(handle: string) {
  return db().query.user.findFirst({ where: eq(user.handle, handle), columns: { id: true, name: true, handle: true, image: true, bio: true, website: true, github: true, linkedin: true, college: true, interests: true, createdAt: true, role: true, bannedAt: true } });
}
