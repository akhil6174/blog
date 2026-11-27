/**
 * POST /api/track { tool, action } : adds 1 to today's anonymous count for a student tool (D-049). Only known
 * tools and actions are accepted. A small per-instance limit per address keeps a script from inflating counts;
 * nothing about the visitor is stored.
 */
import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { db, toolUsage } from '../../lib/db';
import { isUsageEvent, istDayKey } from '../../lib/usage';

export const prerender = false;

const LIMIT = 60; // events per address per minute, per Worker instance
const seen = new Map<string, { at: number; n: number }>();

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = request.headers.get('cf-connecting-ip') ?? clientAddress ?? '';
  const now = Date.now();
  const s = seen.get(ip);
  if (s && now - s.at < 60_000) { if (++s.n > LIMIT) return new Response(null, { status: 429 }); } else seen.set(ip, { at: now, n: 1 });
  if (seen.size > 5000) seen.clear();

  const b = (await request.json().catch(() => null)) as { tool?: unknown; action?: unknown } | null;
  if (!b || !isUsageEvent(b.tool, b.action)) return new Response(null, { status: 400 });
  await db().insert(toolUsage).values({ day: istDayKey(), tool: b.tool, action: b.action as string, count: 1 })
    .onConflictDoUpdate({ target: [toolUsage.day, toolUsage.tool, toolUsage.action], set: { count: sql`${toolUsage.count} + 1` } });
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
};
