/**
 * POST /api/view { postId } : view beacon sent 10 s after page load (bots and bounces are not counted).
 * Above `views_sample_threshold` views/day for a post, counts 1 in 5 and multiplies by 5 (plan: D1 write budget).
 */
import type { APIRoute } from 'astro';
import { and, eq, sql } from 'drizzle-orm';
import { db, posts, postStats } from '../../lib/db';
import { getSettingInt } from '../../lib/db/settings';
import { todayUTC } from '../../lib/content';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const ua = request.headers.get('user-agent') ?? '';
  if (/bot|crawl|spider|slurp|headless|lighthouse|pingdom/i.test(ua)) return new Response(null, { status: 204 });
  const body = (await request.json().catch(() => null)) as { postId?: string } | null;
  const postId = body?.postId;
  if (!postId || typeof postId !== 'string' || postId.length > 120) return new Response(null, { status: 204 });

  const d = db();
  const day = todayUTC();
  const threshold = await getSettingInt('views_sample_threshold');
  const row = await d.query.postStats.findFirst({ where: and(eq(postStats.postId, postId), eq(postStats.day, day)), columns: { views: true } });
  let inc = 1;
  if ((row?.views ?? 0) >= threshold) {
    if (Math.random() >= 0.2) return new Response(null, { status: 204 });
    inc = 5;
  }
  await d.insert(postStats).values({ postId, day, views: inc }).onConflictDoUpdate({ target: [postStats.postId, postStats.day], set: { views: sql`${postStats.views} + ${inc}` } });
  if (!postId.startsWith('editorial:')) await d.update(posts).set({ viewsCount: sql`${posts.viewsCount} + ${inc}` }).where(eq(posts.id, postId));
  return new Response(null, { status: 204 });
};
