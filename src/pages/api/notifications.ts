/**
 * GET  /api/notifications -> { unread }
 * POST /api/notifications { all: true } -> marks every notification read.
 */
import type { APIRoute } from 'astro';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, notifications } from '../../lib/db';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store' } });

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ unread: 0 });
  const [{ n }] = await db().select({ n: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.userId, locals.user.id), isNull(notifications.readAt)));
  return json({ unread: Number(n) });
};

export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Sign in first.' }, 401);
  await db().update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, locals.user.id), isNull(notifications.readAt)));
  return json({ ok: true });
};
