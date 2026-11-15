/**
 * POST /api/comments : create a comment (status "checking") and start the moderation Workflow for it.
 * Works for community posts (post id) and editorial posts ("editorial:<slug>").
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { and, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { comments, db, posts } from '../../lib/db';
import { esc } from '../../lib/render-doc';
import { newId } from '../../lib/content';
import { verifyTurnstile } from '../../lib/turnstile';

export const prerender = false;

const Body = z.object({
  postId: z.string().min(3).max(120),
  parentId: z.string().min(8).max(32).nullable().optional(),
  body: z.string().min(2).max(2000),
  turnstileToken: z.string().optional().default(''),
});

const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store' } });

/** Plain text -> minimal safe HTML: paragraphs, line breaks, autolinked URLs (rel ugc nofollow). */
export function commentHtml(text: string): string {
  const paras = text.trim().split(/\n{2,}/).slice(0, 20);
  return paras
    .map((p) => {
      const safe = esc(p).replace(/\n/g, '<br>');
      const linked = safe.replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" rel="ugc nofollow noopener" target="_blank">${u}</a>`);
      return `<p>${linked}</p>`;
    })
    .join('');
}

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Please sign in to comment.' }, 401);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid comment.' }, 400);
  const b = parsed.data;

  if (!(await verifyTurnstile(b.turnstileToken, request.headers.get('cf-connecting-ip')))) return json({ error: 'Bot check failed.' }, 400);

  const d = db();
  if (!b.postId.startsWith('editorial:')) {
    const p = await d.query.posts.findFirst({ where: eq(posts.id, b.postId), columns: { status: true } });
    if (!p || p.status !== 'published') return json({ error: 'Post not found.' }, 404);
  }
  if (b.parentId) {
    const parent = await d.query.comments.findFirst({ where: eq(comments.id, b.parentId), columns: { postId: true, parentId: true } });
    if (!parent || parent.postId !== b.postId) return json({ error: 'Parent comment not found.' }, 404);
    if (parent.parentId) b.parentId = parent.parentId; // one level of replies
  }
  // Rate limit: 20 comments per user per day.
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [{ n }] = await d.select({ n: sql<number>`count(*)` }).from(comments).where(and(eq(comments.userId, user.id), gte(comments.createdAt, since)));
  if (Number(n) >= 20) return json({ error: 'Comment limit reached for today.' }, 429);

  const id = newId();
  await d.insert(comments).values({ id, postId: b.postId, userId: user.id, parentId: b.parentId ?? null, body: b.body.trim(), bodyHtml: commentHtml(b.body), status: 'checking' });
  await env.MODERATION.create({ id: `comment-${id}`, params: { postId: id, kind: 'comment' } });
  return json({ id, status: 'checking' });
};
