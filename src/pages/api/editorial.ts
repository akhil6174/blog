/**
 * POST /api/editorial { id, action: 'publish' | 'schedule' | 'unschedule' | 'unpublish', at? }   (admin only)
 * The editor saves the latest text first, then calls this.
 */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { hasRole } from '../../lib/auth';
import { db, posts } from '../../lib/db';
import { publishEditorial, scheduleEditorial, unpublishEditorial, unscheduleEditorial } from '../../lib/editorial';
import { githubConfigured } from '../../lib/github';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!hasRole(user, 'admin')) return json({ errors: ['Only the site admin can publish to the blog.'] }, 403);
  const parsed = z.object({ id: z.string().min(8).max(32), action: z.enum(['publish', 'schedule', 'unschedule', 'unpublish']), at: z.string().datetime().optional() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ errors: ['Invalid request.'] }, 400);
  const { id, action, at } = parsed.data;
  const p = await db().query.posts.findFirst({ where: eq(posts.id, id), columns: { id: true, authorId: true } });
  if (!p) return json({ errors: ['Article not found.'] }, 404);

  if ((action === 'publish' || action === 'unpublish') && !githubConfigured()) {
    return json({ errors: ['Publishing is not connected yet: add the GITHUB_TOKEN secret (setup guide, section 15).'] }, 503);
  }
  switch (action) {
    case 'publish': {
      const r = await publishEditorial(id);
      return r.ok ? json(r) : json(r, 400);
    }
    case 'schedule': {
      if (!at) return json({ errors: ['Pick a date and time.'] }, 400);
      const r = await scheduleEditorial(id, new Date(at));
      return r.ok ? json({ ok: true, scheduledAt: at }) : json(r, 400);
    }
    case 'unschedule':
      await unscheduleEditorial(id);
      return json({ ok: true });
    case 'unpublish': {
      const r = await unpublishEditorial(id);
      return r.ok ? json(r) : json(r, 400);
    }
  }
};
