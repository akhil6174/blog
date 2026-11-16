/**
 * POST /api/posts : create or update the signed-in user's draft; with submit=true, validate fully,
 * store status='submitted' and start the moderation Workflow.
 * Writers can only touch their own posts. Published posts can be edited: the edit goes back through moderation.
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, posts, postRevisions, postTags, tags } from '../../lib/db';
import { getSettingInt } from '../../lib/db/settings';
import { hasRole } from '../../lib/auth';
import { contentHash, excerpt, isTiptapDoc, newId, readingMinutes, renderDoc, slugify } from '../../lib/content';
import { tagSlug } from '../../lib/posts';
import { verifyTurnstile } from '../../lib/turnstile';

export const prerender = false;

const Body = z.object({
  id: z.string().min(8).max(32).optional(),
  title: z.string().max(90),
  subtitle: z.string().max(140).optional().default(''),
  description: z.string().max(160).optional().default(''),
  tags: z.array(z.string().min(2).max(30)).max(5).default([]),
  coverImage: z.string().url().max(500).nullable().optional(),
  coverAlt: z.string().max(200).nullable().optional(),
  bodyJson: z.unknown(),
  submit: z.boolean().default(false),
  /** true for background autosaves: writes only the post row (plus tags if they changed, revision at most every 5 min). */
  autosave: z.boolean().default(false),
  turnstileToken: z.string().optional().default(''),
});

const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Please sign in.' }, 401);
  if (!hasRole(user, 'writer')) return json({ error: 'Your account cannot publish yet.' }, 403);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid data: ' + parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ') }, 400);
  const b = parsed.data;
  if (!isTiptapDoc(b.bodyJson)) return json({ error: 'Invalid document.' }, 400);

  const d = db();
  const nowDate = new Date();

  // Load or create the post, enforcing ownership.
  let post = b.id ? await d.query.posts.findFirst({ where: eq(posts.id, b.id) }) : undefined;
  if (b.id && !post) return json({ error: 'Post not found.' }, 404);
  if (post && post.authorId !== user.id && !hasRole(user, 'admin')) return json({ error: 'Not your post.' }, 403);
  if (post && ['checking', 'submitted'].includes(post.status)) return json({ error: 'This post is being checked; wait for the result before editing.' }, 409);

  const { html, text, words } = renderDoc(b.bodyJson);
  const title = b.title.trim() || 'Untitled draft';
  const description = b.description.trim() || excerpt(text);

  if (b.submit) {
    const problems: string[] = [];
    const minWords = await getSettingInt('min_words');
    if (title.length < 10) problems.push('title too short');
    if (b.description.trim().length < 50) problems.push('summary too short');
    if (b.tags.length < 1) problems.push('add a tag');
    if (words < minWords) problems.push(`at least ${minWords} words`);
    if (b.coverImage && !b.coverAlt) problems.push('cover alt text');
    if (problems.length) return json({ error: `Fix before submitting: ${problems.join(', ')}.` }, 400);

    const ok = await verifyTurnstile(b.turnstileToken, request.headers.get('cf-connecting-ip'));
    if (!ok) return json({ error: 'The bot check failed. Reload and try again.' }, 400);

    // Daily posting limit (rules step 1 also re-checks; this gives the writer an early message).
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [{ n }] = await d
      .select({ n: sql<number>`count(*)` })
      .from(posts)
      .where(and(eq(posts.authorId, user.id), gte(posts.submittedAt, since)));
    const accountAgeH = (Date.now() - new Date(user.createdAt).getTime()) / 3600_000;
    const limit = hasRole(user, 'trusted') ? await getSettingInt('posts_per_day_trusted') : accountAgeH < 24 ? await getSettingInt('posts_per_day_new') : await getSettingInt('posts_per_day');
    if (Number(n) >= limit && !hasRole(user, 'admin')) return json({ error: `You can submit ${limit} post${limit === 1 ? '' : 's'} per day. Try again tomorrow.` }, 429);
  }

  // Slug: set on first save, kept stable afterwards (SEO); de-duplicate.
  let slug = post?.slug;
  if (!slug) {
    const base = slugify(title);
    slug = base;
    for (let i = 2; i < 50; i++) {
      const clash = await d.query.posts.findFirst({ where: eq(posts.slug, slug), columns: { id: true } });
      if (!clash) break;
      slug = `${base}-${i}`;
    }
  }

  const id = post?.id ?? newId();
  const status = b.submit ? 'submitted' : post && post.status !== 'draft' && post.status !== 'rejected' ? post.status : 'draft';
  const values = {
    id,
    authorId: post?.authorId ?? user.id,
    slug,
    title,
    subtitle: b.subtitle.trim() || null,
    description,
    bodyJson: JSON.stringify(b.bodyJson),
    bodyHtml: html,
    bodyText: text,
    coverImage: b.coverImage ?? null,
    coverAlt: b.coverAlt ?? null,
    status: status as typeof posts.$inferInsert.status,
    wordCount: words,
    readingMinutes: readingMinutes(words),
    contentHash: await contentHash(text),
    rejectReason: b.submit ? null : post?.rejectReason ?? null,
    submittedAt: b.submit ? nowDate : post?.submittedAt ?? null,
    updatedAt: nowDate,
  };

  if (post) {
    await d.update(posts).set(values).where(eq(posts.id, id));
  } else {
    await d.insert(posts).values(values);
  }

  // Revision history (keep the last 20 per post). Autosaves add one at most every 5 minutes (D1 write budget).
  const last = post ? await d.query.postRevisions.findFirst({ where: eq(postRevisions.postId, id), orderBy: desc(postRevisions.savedAt), columns: { savedAt: true } }) : undefined;
  const revisionDue = !b.autosave || !last || Date.now() - new Date(last.savedAt).getTime() > 5 * 60_000;
  if (revisionDue) {
    await d.insert(postRevisions).values({ postId: id, bodyJson: values.bodyJson, title });
    await d.run(sql`delete from post_revisions where post_id = ${id} and id not in (select id from post_revisions where post_id = ${id} order by id desc limit 20)`);
  }

  // Tags: rewrite only when the set changed.
  const wantedMap = new Map<string, string>();
  for (const t of b.tags) {
    const slug2 = tagSlug(t);
    if (slug2 && !wantedMap.has(slug2)) wantedMap.set(slug2, t.trim());
  }
  const wanted = [...wantedMap.entries()];
  const current = post ? (await d.select({ slug: postTags.tagSlug }).from(postTags).where(eq(postTags.postId, id))).map((r) => r.slug).sort() : [];
  const wantedSlugs = [...new Set(wanted.map(([s2]) => s2))].sort();
  if (current.join(',') !== wantedSlugs.join(',')) {
    await d.delete(postTags).where(eq(postTags.postId, id));
    for (const [slug2, name] of wanted) {
      await d.insert(tags).values({ slug: slug2, name }).onConflictDoNothing();
      await d.insert(postTags).values({ postId: id, tagSlug: slug2 }).onConflictDoNothing();
    }
  }

  if (b.submit) {
    await env.MODERATION.create({ id: `post-${id}-${Date.now()}`, params: { postId: id, kind: 'post' } });
    return json({ id, status: 'submitted', redirect: `/write/status/${id}/` });
  }
  return json({ id, status, slug, updatedAt: nowDate.toISOString() });
};
