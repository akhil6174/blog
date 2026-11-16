/**
 * Campus Writers Programme: reward rules, the reward cap and the monthly competition (D-031).
 *
 * Money rules (owner decisions):
 *  - Amounts are whole rupees. Every credit, adjustment and payment is a row in `rewards`.
 *  - A writer can receive at most `reward_cap` across the programme (first-article reward + prizes together).
 *    A prize above what is left is cut to what is left.
 *  - One monthly prize per writer: only their best article is ranked.
 *  - Payment details are never stored. The editor collects them by email and records the payment reference.
 *
 * Score (out of 100) = weighted editor scores (0-10 each: accuracy, quality, originality, clarity) plus genuine
 * upvotes (scaled so the month's most upvoted article gets 10). Only published community articles qualify.
 * Ties: more genuine upvotes first, then the earlier publication.
 */
import { and, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import { competitionEntries, competitions, db, posts, raises, rewards, user } from './db';
import { getSettings } from './db/settings';
import { notify } from './notify';

const IST_MS = 330 * 60 * 1000;

/** Competition month (YYYY-MM) for a date, in India time. */
export function monthOf(d: Date): string {
  return new Date(d.getTime() + IST_MS).toISOString().slice(0, 7);
}

/** UTC instants for the start of a month and of the next month, in India time. */
export function monthRange(month: string): { from: Date; to: Date } {
  const [y, m] = month.split('-').map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1) - IST_MS), to: new Date(Date.UTC(y, m, 1) - IST_MS) };
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export type ProgrammeConfig = { open: boolean; start: string; end: string; firstArticle: number; prizes: number[]; cap: number; weights: number[] };

export async function programmeConfig(): Promise<ProgrammeConfig> {
  const s = await getSettings();
  const nums = (v: string) => v.split(',').map((x) => Math.max(0, Math.round(Number(x.trim()) || 0)));
  const weights = nums(s.competition_weights);
  return {
    open: s.programme_open === 'true',
    start: s.programme_start.trim(),
    end: s.programme_end.trim(),
    firstArticle: Math.max(0, Number(s.reward_first_article) || 0),
    prizes: nums(s.reward_prizes).filter((n) => n > 0),
    cap: Math.max(0, Number(s.reward_cap) || 0),
    weights: weights.length === 5 ? weights : [30, 25, 20, 15, 10],
  };
}

/** Is a publication date inside the programme window? An empty start or end means no limit on that side. */
export function inWindow(d: Date, cfg: ProgrammeConfig): boolean {
  const day = new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
  return (!cfg.start || day >= cfg.start) && (!cfg.end || day <= cfg.end);
}

/** Rupees already promised to a writer (everything not cancelled; adjustments can be negative). */
export async function earnedTotal(userId: string): Promise<number> {
  const [{ n }] = await db().select({ n: sql<number>`coalesce(sum(${rewards.amount}), 0)` }).from(rewards).where(and(eq(rewards.userId, userId), ne(rewards.status, 'cancelled')));
  return Number(n);
}

export async function remainingFor(userId: string, cfg?: ProgrammeConfig): Promise<number> {
  const c = cfg ?? (await programmeConfig());
  return Math.max(0, c.cap - (await earnedTotal(userId)));
}

/** Called when a community article is published. Credits the first-article reward once per writer, as pending. */
export async function creditFirstArticle(post: { id: string; authorId: string; title: string; publishedAt: Date | null; kind: string }): Promise<void> {
  try {
    if (post.kind !== 'community') return;
    const cfg = await programmeConfig();
    if (!cfg.open || cfg.firstArticle <= 0 || !inWindow(post.publishedAt ?? new Date(), cfg)) return;
    const d = db();
    const had = await d.query.rewards.findFirst({ where: and(eq(rewards.userId, post.authorId), eq(rewards.kind, 'first_article'), ne(rewards.status, 'cancelled')) });
    if (had) return;
    const amount = Math.min(cfg.firstArticle, await remainingFor(post.authorId, cfg));
    if (amount <= 0) return;
    await d.insert(rewards).values({ userId: post.authorId, kind: 'first_article', amount, status: 'pending', postId: post.id, note: `First published article: ${post.title}`.slice(0, 300) });
    await notify(post.authorId, 'reward', `₹${amount} first-article reward added (pending editor confirmation)`, '/me/#programme');
  } catch (e) {
    console.error('[programme] first-article reward failed:', (e as Error).message);
  }
}

export type EntryRow = typeof competitionEntries.$inferSelect & { title: string; slug: string; publishedAt: Date | null; authorName: string; authorHandle: string | null };

/**
 * Rebuild the month's entries from published articles and current upvotes. Editor scores, notes and
 * disqualifications are kept. Does nothing once the month is finalised.
 */
export async function refreshEntries(month: string): Promise<{ entries: number }> {
  const d = db();
  const comp = await d.query.competitions.findFirst({ where: eq(competitions.month, month) });
  if (comp && comp.status !== 'open') throw new Error('This month is finalised. Reopen it first.');
  if (!comp) await d.insert(competitions).values({ month }).onConflictDoNothing();
  const cfg = await programmeConfig();
  const { from, to } = monthRange(month);
  const eligible = (
    await d
      .select({ id: posts.id, authorId: posts.authorId, publishedAt: posts.publishedAt })
      .from(posts)
      .innerJoin(user, eq(user.id, posts.authorId))
      .where(and(eq(posts.status, 'published'), eq(posts.kind, 'community'), gte(posts.publishedAt, from), lt(posts.publishedAt, to), sql`${user.bannedAt} is null`))
  ).filter((p) => p.publishedAt && inWindow(p.publishedAt, cfg));

  const ids = eligible.map((p) => p.id);
  const existing = await d.select().from(competitionEntries).where(eq(competitionEntries.month, month));
  const gone = existing.filter((e) => !ids.includes(e.postId)).map((e) => e.postId);
  if (gone.length) await d.delete(competitionEntries).where(and(eq(competitionEntries.month, month), inArray(competitionEntries.postId, gone)));
  if (!ids.length) return { entries: 0 };

  // Votes on these articles, with the voter's account age.
  const votes = await d
    .select({ postId: raises.postId, voter: raises.userId, votedAt: raises.updatedAt, joined: user.createdAt, banned: user.bannedAt })
    .from(raises)
    .innerJoin(user, eq(user.id, raises.userId))
    .where(inArray(raises.postId, ids));
  const voters = [...new Set(votes.map((v) => v.voter))];
  // How many different writers each voter has upvoted (someone who only ever upvotes one writer is a signal).
  const spread = new Map<string, number>();
  if (voters.length) {
    const rows = await d
      .select({ voter: raises.userId, writers: sql<number>`count(distinct ${posts.authorId})` })
      .from(raises)
      .innerJoin(posts, eq(posts.id, raises.postId))
      .where(inArray(raises.userId, voters))
      .groupBy(raises.userId);
    for (const r of rows) spread.set(r.voter, Number(r.writers));
  }
  const TWO_DAYS = 2 * 24 * 3600 * 1000;
  for (const p of eligible) {
    const mine = votes.filter((v) => v.postId === p.id && v.voter !== p.authorId && !v.banned);
    const suspicious = mine.filter((v) => v.votedAt.getTime() - v.joined.getTime() < TWO_DAYS || (spread.get(v.voter) ?? 0) <= 1).length;
    await d
      .insert(competitionEntries)
      .values({ month, postId: p.id, authorId: p.authorId, upvotes: mine.length, suspiciousVotes: suspicious })
      .onConflictDoUpdate({ target: [competitionEntries.month, competitionEntries.postId], set: { upvotes: mine.length, suspiciousVotes: suspicious, authorId: p.authorId } });
  }
  return { entries: eligible.length };
}

/** Final score out of 100, stored x10. Null until all four editor scores are in. */
export function scoreOf(e: { accuracy: number | null; quality: number | null; originality: number | null; clarity: number | null; upvotes: number; suspiciousVotes: number }, maxGenuine: number, weights: number[]): number | null {
  if ([e.accuracy, e.quality, e.originality, e.clarity].some((x) => x === null || x === undefined)) return null;
  const genuine = Math.max(0, e.upvotes - e.suspiciousVotes);
  const votes = maxGenuine > 0 ? (genuine / maxGenuine) * 10 : 0;
  const parts = [e.accuracy!, e.quality!, e.originality!, e.clarity!, votes];
  const total = parts.reduce((sum, s, i) => sum + (s / 10) * weights[i], 0);
  return Math.round(total * 10);
}

export async function listEntries(month: string): Promise<EntryRow[]> {
  const rows = await db()
    .select({ e: competitionEntries, title: posts.title, slug: posts.slug, publishedAt: posts.publishedAt, authorName: user.name, authorHandle: user.handle })
    .from(competitionEntries)
    .innerJoin(posts, eq(posts.id, competitionEntries.postId))
    .innerJoin(user, eq(user.id, competitionEntries.authorId))
    .where(eq(competitionEntries.month, month));
  return rows
    .map((r) => ({ ...r.e, title: r.title, slug: r.slug, publishedAt: r.publishedAt, authorName: r.authorName, authorHandle: r.authorHandle }))
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || (b.score ?? -1) - (a.score ?? -1) || b.upvotes - a.upvotes);
}

/** Save editor scores (0-10) and recompute every entry's score for the month. */
export async function saveScores(month: string, postId: string, s: { accuracy: number | null; quality: number | null; originality: number | null; clarity: number | null; disqualified: boolean; note: string | null }): Promise<void> {
  const d = db();
  const comp = await d.query.competitions.findFirst({ where: eq(competitions.month, month) });
  if (comp && comp.status !== 'open') throw new Error('This month is finalised. Reopen it first.');
  await d.update(competitionEntries).set(s).where(and(eq(competitionEntries.month, month), eq(competitionEntries.postId, postId)));
  await rescore(month);
}

async function rescore(month: string): Promise<void> {
  const d = db();
  const cfg = await programmeConfig();
  const rows = await d.select().from(competitionEntries).where(eq(competitionEntries.month, month));
  const maxGenuine = Math.max(0, ...rows.filter((r) => !r.disqualified).map((r) => r.upvotes - r.suspiciousVotes));
  for (const r of rows) {
    const score = r.disqualified ? null : scoreOf(r, maxGenuine, cfg.weights);
    if (score !== r.score) await d.update(competitionEntries).set({ score }).where(and(eq(competitionEntries.month, month), eq(competitionEntries.postId, r.postId)));
  }
}

/**
 * Rank the month, apply one-prize-per-writer and the cap, and add each prize to the ledger as pending.
 * Every eligible entry needs all four editor scores (or to be disqualified) first.
 */
export async function finalise(month: string): Promise<{ winners: number; total: number }> {
  const d = db();
  const comp = await d.query.competitions.findFirst({ where: eq(competitions.month, month) });
  if (!comp || comp.status !== 'open') throw new Error('Only an open month can be finalised.');
  await rescore(month);
  const cfg = await programmeConfig();
  const entries = await listEntries(month);
  const unscored = entries.filter((e) => !e.disqualified && e.score === null);
  if (unscored.length) throw new Error(`Score every article first (${unscored.length} left), or disqualify it.`);
  const ordered = entries
    .filter((e) => !e.disqualified && e.score !== null)
    .sort((a, b) => b.score! - a.score! || b.upvotes - b.suspiciousVotes - (a.upvotes - a.suspiciousVotes) || (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0));
  const seen = new Set<string>();
  let rank = 0;
  let total = 0;
  for (const e of entries) await d.update(competitionEntries).set({ rank: null, prize: 0 }).where(and(eq(competitionEntries.month, month), eq(competitionEntries.postId, e.postId)));
  for (const e of ordered) {
    if (seen.has(e.authorId)) continue; // one prize per writer: their best article only
    seen.add(e.authorId);
    rank++;
    const listed = cfg.prizes[rank - 1] ?? 0;
    const prize = Math.min(listed, await remainingFor(e.authorId, cfg));
    await d.update(competitionEntries).set({ rank, prize }).where(and(eq(competitionEntries.month, month), eq(competitionEntries.postId, e.postId)));
    if (prize > 0) {
      const capped = prize < listed ? ` (cut from ₹${listed} by the ₹${cfg.cap} cap)` : '';
      await d.insert(rewards).values({ userId: e.authorId, kind: 'monthly_prize', amount: prize, status: 'pending', month, postId: e.postId, note: `${monthLabel(month)}: position ${rank}${capped}` });
      total += prize;
    }
  }
  await d.update(competitions).set({ status: 'finalised', finalisedAt: new Date() }).where(eq(competitions.month, month));
  return { winners: ordered.length ? Math.min(rank, cfg.prizes.length) : 0, total };
}

/** Undo a finalisation that is not published yet: cancels the month's unpaid prize credits. */
export async function reopen(month: string): Promise<void> {
  const d = db();
  const comp = await d.query.competitions.findFirst({ where: eq(competitions.month, month) });
  if (comp?.status !== 'finalised') throw new Error('Only a finalised, unpublished month can be reopened.');
  const paid = await d.query.rewards.findFirst({ where: and(eq(rewards.month, month), eq(rewards.kind, 'monthly_prize'), eq(rewards.status, 'paid')) });
  if (paid) throw new Error('A prize for this month is already paid. Use an adjustment instead.');
  await d.update(rewards).set({ status: 'cancelled', note: sql`coalesce(${rewards.note}, '') || ' · cancelled: month reopened'`, updatedAt: new Date() }).where(and(eq(rewards.month, month), eq(rewards.kind, 'monthly_prize'), inArray(rewards.status, ['pending', 'confirmed'])));
  await d.update(competitionEntries).set({ rank: null, prize: 0 }).where(eq(competitionEntries.month, month));
  await d.update(competitions).set({ status: 'open', finalisedAt: null }).where(eq(competitions.month, month));
}

/** Make the results public on /leaderboard and tell every entrant. */
export async function publishResults(month: string): Promise<number> {
  const d = db();
  const comp = await d.query.competitions.findFirst({ where: eq(competitions.month, month) });
  if (comp?.status !== 'finalised') throw new Error('Finalise the month before publishing results.');
  await d.update(competitions).set({ status: 'published', publishedAt: new Date() }).where(eq(competitions.month, month));
  const entries = await listEntries(month);
  const told = new Set<string>();
  for (const e of entries) {
    if (told.has(e.authorId)) continue;
    told.add(e.authorId);
    const best = entries.find((x) => x.authorId === e.authorId && x.rank);
    const text = best?.rank ? `${monthLabel(month)} results: you placed #${best.rank}${best.prize ? ` and won ₹${best.prize} (pending confirmation)` : ''}` : `${monthLabel(month)} results are out. Thank you for taking part.`;
    await notify(e.authorId, 'ranking', text, '/leaderboard/');
  }
  return told.size;
}

/** Published results, newest month first (for /leaderboard). */
export async function publishedMonths(): Promise<string[]> {
  const rows = await db().select({ month: competitions.month }).from(competitions).where(eq(competitions.status, 'published'));
  return rows.map((r) => r.month).sort().reverse();
}

export type Ledger = { pending: number; confirmed: number; paid: number; total: number; remaining: number; rows: (typeof rewards.$inferSelect)[] };

export async function ledgerFor(userId: string): Promise<Ledger> {
  const cfg = await programmeConfig();
  const rows = await db().select().from(rewards).where(eq(rewards.userId, userId)).orderBy(sql`${rewards.id} desc`);
  const sum = (s: string) => rows.filter((r) => r.status === s).reduce((n, r) => n + r.amount, 0);
  const total = rows.filter((r) => r.status !== 'cancelled').reduce((n, r) => n + r.amount, 0);
  return { pending: sum('pending'), confirmed: sum('confirmed'), paid: sum('paid'), total, remaining: Math.max(0, cfg.cap - total), rows };
}

/**
 * Programme pages are public only when `programme_open` is true. Admins can always preview them.
 * Returns the config, or null when the page should 404.
 */
export async function programmeGate(headers: Headers): Promise<(ProgrammeConfig & { preview: boolean }) | null> {
  const cfg = await programmeConfig();
  if (cfg.open) return { ...cfg, preview: false };
  const { auth, hasRole } = await import('./auth');
  const s = await auth().api.getSession({ headers });
  return hasRole(s?.user, 'admin') ? { ...cfg, preview: true } : null;
}

export function rupees(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

/** Prize table rows grouped by equal amounts: "1st", "2nd–5th", "6th–10th". */
export function prizeBands(prizes: number[]): { label: string; amount: number }[] {
  const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
  const out: { label: string; amount: number }[] = [];
  let i = 0;
  while (i < prizes.length) {
    let j = i;
    while (j + 1 < prizes.length && prizes[j + 1] === prizes[i]) j++;
    out.push({ label: i === j ? ord(i + 1) : `${ord(i + 1)}–${ord(j + 1)}`, amount: prizes[i] });
    i = j + 1;
  }
  return out;
}
