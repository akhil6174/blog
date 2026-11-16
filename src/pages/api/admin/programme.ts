/**
 * POST /api/admin/programme : Campus Writers Programme operations (admin only, via middleware).
 * Competition: refresh, score, finalise, reopen, publish. Ledger: confirm, pay, cancel, adjust.
 * Applications: set status. Announcements: notify writers. Every success goes to the audit log.
 */
import type { APIRoute } from 'astro';
import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { applications, db, rewards, user } from '../../../lib/db';
import { audit } from '../../../lib/audit';
import { notify, notifyMany } from '../../../lib/notify';
import { finalise, publishResults, refreshEntries, reopen, saveScores } from '../../../lib/programme';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store' } });

const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must look like 2026-11');
const Score = z.union([z.null(), z.number().int().min(0).max(10)]);
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('refresh'), month: Month }),
  z.object({ action: z.literal('score'), month: Month, postId: z.string().min(3).max(40), accuracy: Score, quality: Score, originality: Score, clarity: Score, disqualified: z.boolean(), note: z.string().max(300).nullable() }),
  z.object({ action: z.literal('finalise'), month: Month }),
  z.object({ action: z.literal('reopen'), month: Month }),
  z.object({ action: z.literal('publish'), month: Month }),
  z.object({ action: z.literal('reward_confirm'), id: z.number().int() }),
  z.object({ action: z.literal('reward_pay'), id: z.number().int(), ref: z.string().trim().min(3, 'Enter the payment reference (UPI or bank transaction id).').max(80) }),
  z.object({ action: z.literal('reward_cancel'), id: z.number().int(), note: z.string().trim().min(5, 'Say why (at least 5 characters).').max(200) }),
  z.object({ action: z.literal('reward_adjust'), email: z.string().trim().toLowerCase().email(), amount: z.number().int().min(-5000).max(5000).refine((n) => n !== 0, 'Amount cannot be 0.'), note: z.string().trim().min(5, 'Say why (at least 5 characters).').max(200) }),
  z.object({ action: z.literal('application_status'), id: z.number().int(), status: z.enum(['new', 'shortlisted', 'accepted', 'declined']) }),
  z.object({ action: z.literal('announce'), title: z.string().trim().min(5).max(200), link: z.union([z.literal(''), z.string().trim().max(200).regex(/^(\/|https:\/\/)\S*$/, 'Link must start with / or https://')]).default(''), audience: z.enum(['writers', 'all']) }),
]);

export const POST: APIRoute = async ({ request, locals }) => {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, 400);
  const b = parsed.data;
  try {
    const res = await run(b);
    await audit(locals.user!.id, `programme:${b.action}`, 'month' in b ? b.month : 'id' in b ? String(b.id) : null, res.detail ?? null);
    return json({ message: res.message });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
};

async function run(b: z.infer<typeof Body>): Promise<{ message: string; detail?: string }> {
  const d = db();
  const reward = async (id: number) => {
    const r = await d.query.rewards.findFirst({ where: eq(rewards.id, id) });
    if (!r) throw new Error('Reward not found.');
    return r;
  };
  switch (b.action) {
    case 'refresh': {
      const r = await refreshEntries(b.month);
      return { message: `${r.entries} eligible articles. Upvotes updated.` };
    }
    case 'score': {
      await saveScores(b.month, b.postId, { accuracy: b.accuracy, quality: b.quality, originality: b.originality, clarity: b.clarity, disqualified: b.disqualified, note: b.note?.trim() || null });
      return { message: 'Scores saved.', detail: `${b.postId}: ${[b.accuracy, b.quality, b.originality, b.clarity].join('/')}${b.disqualified ? ' DQ' : ''}` };
    }
    case 'finalise': {
      const r = await finalise(b.month);
      return { message: `Finalised. ₹${r.total} in prizes added to the ledger as pending. Check them, then publish the results.`, detail: `total ₹${r.total}` };
    }
    case 'reopen':
      await reopen(b.month);
      return { message: 'Reopened. Unpaid prizes for this month were cancelled; finalise again when ready.' };
    case 'publish': {
      const n = await publishResults(b.month);
      return { message: `Results published on /leaderboard. ${n} writers notified.` };
    }
    case 'reward_confirm': {
      const r = await reward(b.id);
      if (r.status !== 'pending') throw new Error('Only pending rewards can be confirmed.');
      await d.update(rewards).set({ status: 'confirmed', updatedAt: new Date() }).where(eq(rewards.id, r.id));
      await notify(r.userId, 'reward', `₹${r.amount} reward confirmed. We will email you to arrange payment.`, '/me/#programme');
      return { message: 'Confirmed. Email the writer to arrange payment.', detail: `₹${r.amount}` };
    }
    case 'reward_pay': {
      const r = await reward(b.id);
      if (r.status !== 'confirmed') throw new Error('Confirm the reward before marking it paid.');
      if (r.amount <= 0) throw new Error('Only positive rewards are paid.');
      await d.update(rewards).set({ status: 'paid', paymentRef: b.ref, paidAt: new Date(), updatedAt: new Date() }).where(eq(rewards.id, r.id));
      await notify(r.userId, 'reward', `₹${r.amount} paid (reference ${b.ref}).`, '/me/#programme');
      return { message: 'Marked paid.', detail: `₹${r.amount} ref ${b.ref}` };
    }
    case 'reward_cancel': {
      const r = await reward(b.id);
      if (!['pending', 'confirmed'].includes(r.status)) throw new Error('Only unpaid rewards can be cancelled. Use an adjustment for paid ones.');
      await d.update(rewards).set({ status: 'cancelled', note: `${r.note ?? ''} · cancelled: ${b.note}`.slice(0, 300), updatedAt: new Date() }).where(eq(rewards.id, r.id));
      await notify(r.userId, 'reward', `A ₹${r.amount} reward was cancelled: ${b.note}`, '/me/#programme');
      return { message: 'Cancelled.', detail: `₹${r.amount}: ${b.note}` };
    }
    case 'reward_adjust': {
      const u = await d.query.user.findFirst({ where: eq(user.email, b.email), columns: { id: true } });
      if (!u) throw new Error('No account with that email.');
      await d.insert(rewards).values({ userId: u.id, kind: 'adjustment', amount: b.amount, status: 'confirmed', note: b.note });
      await notify(u.id, 'reward', `Reward adjustment of ₹${b.amount}: ${b.note}`, '/me/#programme');
      return { message: 'Adjustment added (confirmed).', detail: `${b.email} ₹${b.amount}: ${b.note}` };
    }
    case 'application_status': {
      const r = await d.update(applications).set({ status: b.status }).where(eq(applications.id, b.id)).returning({ id: applications.id });
      if (!r.length) throw new Error('Application not found.');
      return { message: `Marked ${b.status}. Reply to the applicant by email.`, detail: b.status };
    }
    case 'announce': {
      const roles = b.audience === 'writers' ? ['writer', 'trusted', 'admin'] : ['reader', 'writer', 'trusted', 'admin'];
      const ids = (await d.select({ id: user.id }).from(user).where(sql`${inArray(user.role, roles as ['writer'])} and ${user.bannedAt} is null`)).map((r) => r.id);
      if (ids.length > 5000) throw new Error('Too many accounts for an in-site announcement. Use email instead.');
      const n = await notifyMany(ids, 'announcement', b.title, b.link || null);
      return { message: `Sent to ${n} accounts.`, detail: `${b.audience}: ${b.title}` };
    }
  }
}
