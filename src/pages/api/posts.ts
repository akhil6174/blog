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
import { getSettingBool, getSettingInt } from '../../lib/db/settings';
import { cleanTech, hasTech } from '../../lib/tech';
import { canWrite, hasRole } from '../../lib/auth';
import { contentHash, excerpt, isTiptapDoc, newId, readingMinutes, renderDoc, slugify } from '../../lib/content';
import { tagSlug } from '../../lib/posts';
import { verifyTurnstile } from '../../lib/turnstile';
import { isImageSrc } from '../../lib/media';
import { isValidCategory } from '../../lib/site';

import { checkCode, normaliseCode } from '../../lib/internship';
export const prerender = false;

const Body = z.object({
  id: z.string().min(8).max(32).optional(),
  title: z.string().max(90),
  subtitle: z.string().max(140).optional().default(''),
  description: z.string().max(160).optional().default(''),
  tags: z.array(z.string().min(2).max(30)).max(5).default([]),
  coverImage: z.string().max(500).refine((v) => isImageSrc(v), 'must be an uploaded image or an http(s) URL').nullable().optional(),
  coverAlt: z.string().max(200).nullable().optional(),
  bodyJson: z.unknown(),
  submit: z.boolean().default(false),
  /** true for background autosaves: writes only the post row (plus tags if they changed, revision at most every 5 min). */
  autosave: z.boolean().default(false),
  turnstileToken: z.string().optional().default(''),
  seoTitle: z.string().max(70).optional().default(''),
  category: z.string().max(40).optional().default('').transform((v) => v.trim().replace(/\s+/g, ' ')),
  /** Requested URL slug; honoured only until the post is first published (links must not break). */
  slug: z.string().max(80).optional().default(''),
  summarySource: z.enum(['ai', 'user', '']).optional().default(''),
  summaryBasis: z.string().max(4000).optional().default(''),
  /** Internship code (src/lib/internship.ts). Undefined keeps the stored one; empty clears it. */
  internCode: z.string().max(30).optional(),
  /** Admin only; ignored for everyone else. */
  featured: z.boolean().optional(),
  /** Optional technical details (src/lib/tech.ts); invalid fields are dropped, never fail the save. */
  tech: z.record(z.string(), z.string().max(300)).optional(),
  /** The post version this edit started from. A newer stored version means another tab or device saved since. */
  baseVersion: z.number().int().min(0).optional(),
  /** true = overwrite anyway after the writer saw the conflict warning. */
  force: z.boolean().default(false),
});

const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Please sign in.' }, 401);
  if (!(await canWrite(user))) return json({ error: 'Your account cannot publish yet.' }, 403);

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
  if (post?.status === 'trashed') return json({ error: 'This article is in the trash. Restore it from My articles first.' }, 409);
  // Optimistic locking: refuse to overwrite a newer save from another tab or device.
  if (post && typeof b.baseVersion === 'number' && post.version > b.baseVersion && !b.force) {
    return json({ error: 'This article was changed in another tab or device.', conflict: true, version: post.version, updatedAt: post.updatedAt.toISOString() }, 409);
  }
  // Admins write editorial articles (published to /blog/ from the editor, no moderation); everyone else writes community posts.
  const kind: 'community' | 'editorial' = post?.kind ?? (hasRole(user, 'admin') ? 'editorial' : 'community');
  if (kind === 'editorial' && b.submit) return json({ error: 'Editorial articles are published with "Publish to blog", not submitted for review.' }, 400);

  // Internship code: checked only when it changes. A wrong code blocks submitting; autosaves just keep the old one.
  let internCode = post?.internCode ?? null;
  if (kind === 'community' && b.internCode !== undefined && normaliseCode(b.internCode) !== (post?.internCode ?? '')) {
    const r = await checkCode(b.internCode, user.email);
    if ('error' in r) {
      if (b.submit) return json({ error: r.error, errors: [r.error] }, 400);
    } else internCode = r.code;
  }

  const { html, text, words } = renderDoc(b.bodyJson);
  const title = b.title.trim() || 'Untitled draft';
  const description = b.description.trim() || excerpt(text);

  if (b.submit && !(await getSettingBool('submissions_open')) && !hasRole(user, 'admin')) return json({ error: 'Submissions are paused right now. Your draft is saved; please try again later.' }, 503);

  if (b.submit) {
    const problems: string[] = [];
    const minWords = await getSettingInt('min_words');
    if (title.length < 10) problems.push('title too short');
    if (b.description.trim().length < 50) problems.push('summary too short');
    if (b.tags.length < 1) problems.push('add a tag');
    if (!isValidCategory(b.category)) problems.push('choose a category');
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
  // Slug: free to change until the first publish, then locked so published links never break.
  const locked = !!post?.publishedAt;
  const requested = b.slug.trim() ? slugify(b.slug) : ''; // slugify('') is 'post', which would clash
  let slug = post?.slug;
  let slugError: string | null = null;
  if (!locked && requested && requested !== slug) {
    const clash = await d.query.posts.findFirst({ where: eq(posts.slug, requested), columns: { id: true } });
    // Never fail the save over the address: keep the previous one and tell the writer.
    if (clash && clash.id !== post?.id) slugError = `The address "${requested}" is already taken, so the previous one was kept.`;
    else slug = requested;
  }
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
  const tech = cleanTech(b.tech);
  const version = (post?.version ?? 0) + 1;
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
    techMeta: b.tech ? (hasTech(tech) ? JSON.stringify(tech) : null) : post?.techMeta ?? null,
    internCode,
    version,
    seoTitle: b.seoTitle.trim() || null,
    category: isValidCategory(b.category) ? b.category : null,
    summarySource: b.summarySource || null,
    summaryBasis: b.summarySource === 'ai' ? b.summaryBasis || null : b.summaryBasis || post?.summaryBasis || null,
    featured: hasRole(user, 'admin') && typeof b.featured === 'boolean' ? b.featured : post?.featured ?? false,
    status: status as typeof posts.$inferInsert.status,
    kind,
    wordCount: words,
    readingMinutes: readingMinutes(words),
    contentHash: await contentHash(text),
    // Feedback stays visible while the writer revises (rejected or changes requested); cleared on resubmit.
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
    return json({ id, status: 'submitted', slug, slugError, version, redirect: `/write/status/${id}/` });
  }
  return json({ id, status, kind, slug, slugLocked: locked, slugError, version, updatedAt: nowDate.toISOString() });
};
