/**
 * Loading targets and persisting results. Used by the Workflow (src/worker.ts) and by the admin actions.
 */
import { eq, sql } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { comments, db, moderationLog, posts, postStats, postTags, tags, user } from '../db';
import { todayUTC } from '../content';
import { purgePostCaches } from '../cache';
import { postDecisionEmail, sendEmail } from '../email';
import type { Decision } from './decide';
import type { ModerationTarget, StepResult } from './types';

export async function loadTarget(kind: 'post' | 'comment', id: string): Promise<ModerationTarget | null> {
  const d = db();
  if (kind === 'post') {
    const p = await d.query.posts.findFirst({ where: eq(posts.id, id) });
    if (!p) return null;
    const t = await d.select({ slug: postTags.tagSlug }).from(postTags).where(eq(postTags.postId, id));
    const images = [...(p.coverImage ? [p.coverImage] : []), ...[...p.bodyHtml.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1])];
    return { kind, id, title: p.title, text: p.bodyText, html: p.bodyHtml, tags: t.map((x) => x.slug), images: [...new Set(images)], words: p.wordCount, authorId: p.authorId };
  }
  const c = await d.query.comments.findFirst({ where: eq(comments.id, id) });
  if (!c) return null;
  let title = 'a post';
  if (!c.postId.startsWith('editorial:')) {
    const p = await d.query.posts.findFirst({ where: eq(posts.id, c.postId), columns: { title: true } });
    title = p?.title ?? title;
  } else title = c.postId.slice('editorial:'.length);
  const words = c.body.trim().split(/\s+/).filter(Boolean).length;
  return { kind, id, title, text: c.body, html: c.bodyHtml, tags: [], images: [], words, authorId: c.userId };
}

export async function logStep(kind: 'post' | 'comment', id: string, r: StepResult, actorId?: string): Promise<void> {
  await db().insert(moderationLog).values({
    targetType: kind,
    targetId: id,
    step: r.step,
    provider: r.provider ?? null,
    model: r.model ?? null,
    verdict: r.verdict,
    reason: r.reason.slice(0, 500),
    score: r.score ?? null,
    rawResponse: r.raw ?? null,
    fallback: !!r.fallback,
    durationMs: r.durationMs ?? null,
    actorId: actorId ?? null,
  });
}

export async function markChecking(kind: 'post' | 'comment', id: string): Promise<void> {
  if (kind === 'post') await db().update(posts).set({ status: 'checking' }).where(eq(posts.id, id));
}

export async function applyDecision(kind: 'post' | 'comment', id: string, dec: Decision, opts: { notify?: boolean; actorId?: string } = {}): Promise<void> {
  const d = db();
  const now = new Date();
  if (kind === 'post') {
    const p = await d.query.posts.findFirst({ where: eq(posts.id, id) });
    if (!p) return;
    const wasPublished = p.status === 'published' || !!p.publishedAt;
    await d
      .update(posts)
      .set({
        status: dec.status,
        qualityScore: dec.qualityScore,
        indexAllowed: dec.indexAllowed,
        adsAllowed: dec.adsAllowed,
        rejectReason: dec.status === 'rejected' ? dec.reason : null,
        publishedAt: dec.status === 'published' ? p.publishedAt ?? now : p.publishedAt,
        updatedAt: now,
      })
      .where(eq(posts.id, id));

    if (dec.status === 'published') {
      await d.insert(postStats).values({ postId: id, day: todayUTC() }).onConflictDoNothing();
      if (!wasPublished) {
        const t = await d.select({ slug: postTags.tagSlug }).from(postTags).where(eq(postTags.postId, id));
        for (const x of t) await d.update(tags).set({ postsCount: sql`${tags.postsCount} + 1` }).where(eq(tags.slug, x.slug));
        await d.update(user).set({ trustScore: sql`${user.trustScore} + 1` }).where(eq(user.id, p.authorId));
      }
    }
    const author = await d.query.user.findFirst({ where: eq(user.id, p.authorId) });
    await purgePostCaches(p.slug, author?.handle);

    if (opts.notify !== false && author?.email) {
      const m = postDecisionEmail({ authorName: author.name, title: p.title, status: dec.status, reason: dec.reason, url: `${env.SITE_URL}/p/${p.slug}/`, editUrl: `${env.SITE_URL}/write/?id=${p.id}` });
      await sendEmail({ to: author.email, ...m });
    }
  } else {
    const status = dec.status === 'published' ? 'published' : dec.status === 'rejected' ? 'rejected' : 'pending_review';
    await d.update(comments).set({ status }).where(eq(comments.id, id));
    if (status === 'published') {
      const c = await d.query.comments.findFirst({ where: eq(comments.id, id), columns: { postId: true } });
      if (c && !c.postId.startsWith('editorial:')) {
        await d.update(posts).set({ commentsCount: sql`${posts.commentsCount} + 1` }).where(eq(posts.id, c.postId));
      }
      if (c) {
        await d.insert(postStats).values({ postId: c.postId, day: todayUTC(), comments: 1 }).onConflictDoUpdate({ target: [postStats.postId, postStats.day], set: { comments: sql`${postStats.comments} + 1` } });
      }
    }
  }
}
