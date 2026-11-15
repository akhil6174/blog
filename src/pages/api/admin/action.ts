/**
 * POST /api/admin/action : every admin operation (admin role enforced by middleware). Each action is logged.
 */
import type { APIRoute } from 'astro';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { comments, db, posts, reports, user } from '../../../lib/db';
import { SETTING_DEFAULTS, setSetting, type SettingKey } from '../../../lib/db/settings';
import { applyDecision, logStep } from '../../../lib/moderation';
import { purgePostCaches } from '../../../lib/cache';
import { runHourly } from '../../../cron/hourly';

export const prerender = false;

const Body = z.object({
  action: z.enum(['publish_post', 'reject_post', 'unpublish_post', 'publish_comment', 'reject_comment', 'resolve_report', 'set_role', 'ban_user', 'unban_user', 'invite', 'set_settings', 'run_cron']),
  id: z.string().optional(),
  value: z.string().optional(),
  reason: z.string().max(300).optional(),
  values: z.record(z.string(), z.string()).optional(),
});

const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store' } });

export const POST: APIRoute = async ({ request, locals }) => {
  const me = locals.user!;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid request.' }, 400);
  const { action, id, value, reason, values } = parsed.data;
  const d = db();
  const adminLog = (type: 'post' | 'comment', target: string, verdict: string, why: string) => logStep(type, target, { step: 'decide', verdict: verdict as 'publish', reason: `admin: ${why}`, provider: 'code' }, me.id);

  switch (action) {
    case 'publish_post': {
      if (!id) return json({ error: 'id required' }, 400);
      const p = await d.query.posts.findFirst({ where: eq(posts.id, id) });
      if (!p) return json({ error: 'Not found' }, 404);
      await applyDecision('post', id, { status: 'published', reason: reason || 'Approved by editor', qualityScore: p.qualityScore ?? 70, indexAllowed: (p.qualityScore ?? 70) >= 70 && p.wordCount >= 600, adsAllowed: false }, { notify: true });
      await adminLog('post', id, 'publish', reason || 'approved');
      return json({ message: 'Published.' });
    }
    case 'reject_post': {
      if (!id) return json({ error: 'id required' }, 400);
      await applyDecision('post', id, { status: 'rejected', reason: reason || 'Declined by editor. See the community guidelines.', qualityScore: null, indexAllowed: false, adsAllowed: false }, { notify: true });
      await adminLog('post', id, 'reject', reason || 'declined');
      return json({ message: 'Rejected and writer notified.' });
    }
    case 'unpublish_post': {
      if (!id) return json({ error: 'id required' }, 400);
      const p = await d.query.posts.findFirst({ where: eq(posts.id, id) });
      if (!p) return json({ error: 'Not found' }, 404);
      await d.update(posts).set({ status: 'unpublished', indexAllowed: false, adsAllowed: false, updatedAt: new Date() }).where(eq(posts.id, id));
      await d.update(reports).set({ resolvedAt: new Date() }).where(eq(reports.targetId, id));
      await purgePostCaches(p.slug);
      await adminLog('post', id, 'reject', reason || 'unpublished');
      return json({ message: 'Unpublished.' });
    }
    case 'publish_comment':
    case 'reject_comment': {
      if (!id) return json({ error: 'id required' }, 400);
      const publish = action === 'publish_comment';
      await applyDecision('comment', id, { status: publish ? 'published' : 'rejected', reason: reason || (publish ? 'Approved by editor' : 'Removed by editor'), qualityScore: null, indexAllowed: false, adsAllowed: false });
      if (!publish) await d.update(reports).set({ resolvedAt: new Date() }).where(eq(reports.targetId, id));
      await adminLog('comment', id, publish ? 'publish' : 'reject', reason || (publish ? 'approved' : 'removed'));
      return json({ message: publish ? 'Comment published.' : 'Comment removed.' });
    }
    case 'resolve_report': {
      if (!id) return json({ error: 'id required' }, 400);
      const r = await d.query.reports.findFirst({ where: eq(reports.id, Number(id)) });
      if (!r) return json({ error: 'Not found' }, 404);
      await d.update(reports).set({ resolvedAt: new Date() }).where(eq(reports.targetId, r.targetId));
      // Restore an item that was auto-hidden by reports.
      if (r.targetType === 'post') {
        const p = await d.query.posts.findFirst({ where: eq(posts.id, r.targetId) });
        if (p?.status === 'hidden') {
          await d.update(posts).set({ status: 'published', reportsCount: 0 }).where(eq(posts.id, p.id));
          await purgePostCaches(p.slug);
        }
      } else {
        await d.update(comments).set({ status: 'published', reportsCount: 0 }).where(eq(comments.id, r.targetId));
      }
      return json({ message: 'Reports dismissed.' });
    }
    case 'set_role': {
      if (!id || !value || !['reader', 'writer', 'trusted', 'admin'].includes(value)) return json({ error: 'id and a valid role required' }, 400);
      if (value === 'admin') return json({ error: 'Admins are set with ADMIN_EMAILS.' }, 400);
      await d.update(user).set({ role: value as 'writer', updatedAt: new Date() }).where(eq(user.id, id));
      return json({ message: `Role set to ${value}.` });
    }
    case 'ban_user': {
      if (!id) return json({ error: 'id required' }, 400);
      if (id === me.id) return json({ error: 'You cannot ban yourself.' }, 400);
      const target = await d.query.user.findFirst({ where: eq(user.id, id) });
      if (target?.role === 'admin') return json({ error: 'Cannot ban an admin.' }, 400);
      await d.update(user).set({ bannedAt: new Date(), updatedAt: new Date() }).where(eq(user.id, id));
      const mine = await d.select({ id: posts.id, slug: posts.slug }).from(posts).where(eq(posts.authorId, id));
      await d.update(posts).set({ status: 'unpublished', indexAllowed: false, adsAllowed: false }).where(eq(posts.authorId, id));
      await d.update(comments).set({ status: 'hidden' }).where(eq(comments.userId, id));
      for (const p of mine) await purgePostCaches(p.slug, target?.handle);
      await d.run(sql`delete from session where user_id = ${id}`);
      return json({ message: 'User banned, their content unpublished.' });
    }
    case 'unban_user': {
      if (!id) return json({ error: 'id required' }, 400);
      await d.update(user).set({ bannedAt: null, updatedAt: new Date() }).where(eq(user.id, id));
      return json({ message: 'User unbanned. Their posts stay unpublished until re-approved.' });
    }
    case 'invite': {
      const email = (value ?? '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Valid email required' }, 400);
      const existing = await d.query.user.findFirst({ where: eq(user.email, email) });
      if (existing) {
        if (existing.role === 'reader') await d.update(user).set({ role: 'writer' }).where(eq(user.id, existing.id));
        return json({ message: `${email} can write now.` });
      }
      await setSetting('invited_emails' as SettingKey, [...new Set([...(await invitedList()), email])].join(','));
      return json({ message: `${email} will become a writer on first sign-in.` });
    }
    case 'set_settings': {
      if (!values) return json({ error: 'values required' }, 400);
      const keys = Object.keys(SETTING_DEFAULTS) as SettingKey[];
      for (const k of keys) if (k in values) await setSetting(k, String(values[k]).trim());
      return json({ message: 'Settings saved.' });
    }
    case 'run_cron': {
      await runHourly(new Date());
      return json({ message: 'Hourly job finished: Top 10 lists refreshed.' });
    }
  }
  return json({ error: 'Unknown action' }, 400);
};

async function invitedList(): Promise<string[]> {
  const row = await db().query.settings.findFirst({ where: (s, { eq: e }) => e(s.key, 'invited_emails') });
  return (row?.value ?? '').split(',').map((x) => x.trim()).filter(Boolean);
}
