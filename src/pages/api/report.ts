/**
 * POST /api/report { targetType, targetId, reason } : readers flag a post or comment.
 * Signed-in users count by id; anonymous reports count by hashed IP. `reports_to_hide` distinct reports hide the item.
 */
import type { APIRoute } from 'astro';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { comments, db, posts, reports } from '../../lib/db';
import { getSettingInt } from '../../lib/db/settings';
import { purgePostCaches } from '../../lib/cache';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store' } });

async function ipHash(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`report:${ip}:${new Date().toISOString().slice(0, 10)}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export const POST: APIRoute = async ({ request, locals }) => {
  const parsed = z.object({ targetType: z.enum(['post', 'comment']), targetId: z.string().min(3).max(120), reason: z.string().min(2).max(300), note: z.string().max(1000).optional() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid report.' }, 400);
  const { targetType, targetId, reason, note } = parsed.data;
  const d = db();
  const reporterId = locals.user?.id ?? null;
  const hash = reporterId ? null : await ipHash(request.headers.get('cf-connecting-ip'));

  // One report per reporter per target.
  const dupWhere = reporterId ? and(eq(reports.targetType, targetType), eq(reports.targetId, targetId), eq(reports.reporterId, reporterId)) : and(eq(reports.targetType, targetType), eq(reports.targetId, targetId), eq(reports.reporterIpHash, hash ?? ''));
  const dup = await d.query.reports.findFirst({ where: dupWhere, columns: { id: true } });
  if (dup) return json({ ok: true, message: 'Already reported.' });

  await d.insert(reports).values({ targetType, targetId, reporterId, reporterIpHash: hash, reason, note: note ?? null });
  const [{ n }] = await d.select({ n: sql<number>`count(*)` }).from(reports).where(and(eq(reports.targetType, targetType), eq(reports.targetId, targetId), sql`${reports.resolvedAt} is null`));
  const limit = await getSettingInt('reports_to_hide');

  if (targetType === 'post') {
    await d.update(posts).set({ reportsCount: Number(n) }).where(eq(posts.id, targetId));
    if (Number(n) >= limit) {
      const p = await d.query.posts.findFirst({ where: eq(posts.id, targetId), columns: { slug: true, status: true } });
      if (p?.status === 'published') {
        await d.update(posts).set({ status: 'hidden', indexAllowed: false, adsAllowed: false }).where(eq(posts.id, targetId));
        await purgePostCaches(p.slug);
      }
    }
  } else {
    await d.update(comments).set({ reportsCount: Number(n) }).where(eq(comments.id, targetId));
    if (Number(n) >= limit) await d.update(comments).set({ status: 'hidden' }).where(and(eq(comments.id, targetId), eq(comments.status, 'published')));
  }
  return json({ ok: true });
};
