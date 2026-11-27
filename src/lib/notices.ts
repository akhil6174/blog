/**
 * Admin messages to campus ambassadors and interns (D-046). The full message is stored once (notices); each
 * recipient gets a notification "Notice from Akhilendra: <title>" linking to /me/notices/<id>/.
 * Ambassadors: users assigned to a college. Interns: users whose sign-in email has an internship code.
 * Replies (D-050): each recipient has a private conversation with the admin under the notice. Notices, their
 * replies and their notifications are deleted automatically 30 days after sending (hourly job).
 */
import { and, asc, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { colleges, db, internCodes, noticeReplies, notices, notifications, user } from './db';
import { chunked } from './db/chunk';
import { notify, notifyMany } from './notify';

export const NOTICE_SENDER = 'Akhilendra';
export const noticeLink = (id: number) => `/me/notices/${id}/`;
export const adminThreadLink = (id: number, userId?: string) => `/admin/messages/${id}/${userId ? `#u-${userId}` : ''}`;
export const RETENTION_DAYS = 30;
export const expiresAt = (sent: Date) => new Date(sent.getTime() + RETENTION_DAYS * 86_400_000);
const short = (t: string) => (t.length > 60 ? `${t.slice(0, 57)}…` : t);

export type Recipient = { key: string; userId: string | null; name: string; email: string; detail: string; group: 'ambassador' | 'intern' };

/** Everyone the admin can message. Interns who have not signed in yet have no account and cannot receive notices. */
export async function audience(): Promise<{ ambassadors: Recipient[]; interns: Recipient[] }> {
  const d = db();
  const amb = await d
    .select({ id: user.id, name: user.name, email: user.email, college: colleges.name })
    .from(colleges)
    .innerJoin(user, eq(user.id, colleges.ambassadorId))
    .where(isNull(user.bannedAt))
    .orderBy(colleges.name);
  const codes = await d.select({ name: internCodes.name, email: internCodes.email, code: internCodes.code }).from(internCodes).orderBy(desc(internCodes.createdAt));
  const emails = [...new Set(codes.map((c) => c.email.trim().toLowerCase()))];
  const users = await chunked(emails, (part) => d.select({ id: user.id, email: user.email, banned: user.bannedAt }).from(user).where(inArray(sql`lower(${user.email})`, part)));
  const byEmail = new Map(users.filter((u) => !u.banned).map((u) => [u.email.toLowerCase(), u.id]));
  const seen = new Set<string>();
  const interns: Recipient[] = [];
  for (const c of codes) {
    const e = c.email.trim().toLowerCase();
    if (seen.has(e)) continue;
    seen.add(e);
    interns.push({ key: `i:${e}`, userId: byEmail.get(e) ?? null, name: c.name, email: c.email, detail: `Code ${c.code}`, group: 'intern' });
  }
  return {
    ambassadors: amb.map((a) => ({ key: `a:${a.id}`, userId: a.id, name: a.name, email: a.email, detail: a.college, group: 'ambassador' })),
    interns,
  };
}

export class NoticeError extends Error {}

/** Send one message to the chosen user ids. Returns the notice id and how many received it. */
export async function sendNotice(input: { title: string; body: string; link: string | null; userIds: string[]; audienceLabel: string; notifyTitle?: string; postId?: string; kind?: 'message' | 'suggestion' | 'removal' }): Promise<{ id: number; sent: number }> {
  const ids = [...new Set(input.userIds.filter(Boolean))];
  if (!ids.length) throw new NoticeError('Choose at least one person who has a TrutiAI account.');
  const [row] = await db().insert(notices).values({ title: input.title, body: input.body, link: input.link, sender: NOTICE_SENDER, audience: input.audienceLabel, recipients: ids.length, postId: input.postId ?? null, kind: input.kind ?? 'message' }).returning({ id: notices.id });
  const sent = await notifyMany(ids, 'notice', input.notifyTitle ?? `Notice from ${NOTICE_SENDER}: ${input.title}`, noticeLink(row!.id));
  return { id: row!.id, sent };
}

export async function recentNotices(limit = 30) {
  return db().select().from(notices).where(eq(notices.kind, 'message')).orderBy(desc(notices.id)).limit(limit);
}

/** Suggestions and removal notices sent about one article, newest first. */
export async function noticesForPost(postId: string) {
  return db().select().from(notices).where(eq(notices.postId, postId)).orderBy(desc(notices.id));
}

/** A notice the user received (or any notice for the admin). Marks the matching notification read. */
export async function noticeFor(id: number, userId: string, isAdmin: boolean) {
  const d = db();
  const n = await d.query.notices.findFirst({ where: eq(notices.id, id) });
  if (!n) return null;
  const mine = await d.query.notifications.findFirst({ where: and(eq(notifications.userId, userId), eq(notifications.link, noticeLink(id))) });
  if (!mine && !isAdmin) return null;
  // Mark every notification about this notice read (the message itself and any replies).
  if (mine) await d.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), eq(notifications.link, noticeLink(id)), isNull(notifications.readAt)));
  return n;
}

// ---------- Replies (D-050) ----------

/** Did this user receive the notice? (Their notification row is the proof.) */
async function received(noticeId: number, userId: string): Promise<boolean> {
  return !!(await db().query.notifications.findFirst({ where: and(eq(notifications.userId, userId), eq(notifications.link, noticeLink(noticeId))), columns: { id: true } }));
}

/** One recipient's conversation with the admin about a notice, oldest first. */
export async function thread(noticeId: number, userId: string) {
  return db().select().from(noticeReplies).where(and(eq(noticeReplies.noticeId, noticeId), eq(noticeReplies.userId, userId))).orderBy(asc(noticeReplies.id));
}

/** A recipient replies. Every admin is notified. */
export async function replyAsRecipient(noticeId: number, userId: string, body: string): Promise<void> {
  const d = db();
  const n = await d.query.notices.findFirst({ where: eq(notices.id, noticeId) });
  if (!n || !(await received(noticeId, userId))) throw new NoticeError('This message is not available.');
  const since = Math.floor(Date.now() / 1000) - 86_400;
  const [{ c }] = await d.select({ c: sql<number>`count(*)` }).from(noticeReplies).where(and(eq(noticeReplies.userId, userId), eq(noticeReplies.fromAdmin, false), sql`${noticeReplies.createdAt} > ${since}`));
  if (Number(c) >= 30) throw new NoticeError('You have sent many replies today. Please try again tomorrow.');
  await d.insert(noticeReplies).values({ noticeId, userId, body, fromAdmin: false });
  const me = await d.query.user.findFirst({ where: eq(user.id, userId), columns: { name: true } });
  const admins = await d.select({ id: user.id }).from(user).where(eq(user.role, 'admin'));
  await notifyMany(admins.map((a) => a.id).filter((id) => id !== userId), 'notice', `${me?.name ?? 'Someone'} replied to “${short(n.title)}”`, adminThreadLink(noticeId, userId));
}

/** The admin answers one recipient. The recipient is notified. */
export async function replyAsAdmin(noticeId: number, userId: string, body: string): Promise<void> {
  const d = db();
  const n = await d.query.notices.findFirst({ where: eq(notices.id, noticeId) });
  if (!n || !(await received(noticeId, userId))) throw new NoticeError('That person did not receive this message.');
  await d.insert(noticeReplies).values({ noticeId, userId, body, fromAdmin: true });
  await d.update(noticeReplies).set({ seenAt: new Date() }).where(and(eq(noticeReplies.noticeId, noticeId), eq(noticeReplies.userId, userId), isNull(noticeReplies.seenAt)));
  await notify(userId, 'notice', `${NOTICE_SENDER} replied to you: “${short(n.title)}”`, noticeLink(noticeId));
}

/** Admin: conversations under a notice, people with unanswered replies first. Marks nothing as seen. */
export async function threadsFor(noticeId: number) {
  const rows = await db()
    .select({ r: noticeReplies, name: user.name, email: user.email })
    .from(noticeReplies).innerJoin(user, eq(user.id, noticeReplies.userId))
    .where(eq(noticeReplies.noticeId, noticeId)).orderBy(asc(noticeReplies.id));
  const by = new Map<string, { userId: string; name: string; email: string; items: (typeof noticeReplies.$inferSelect)[]; unread: number; last: Date }>();
  for (const { r, name, email } of rows) {
    const t = by.get(r.userId) ?? { userId: r.userId, name, email, items: [], unread: 0, last: r.createdAt };
    t.items.push(r);
    if (!r.fromAdmin && !r.seenAt) t.unread++;
    t.last = r.createdAt;
    by.set(r.userId, t);
  }
  return [...by.values()].sort((a, b) => b.unread - a.unread || b.last.getTime() - a.last.getTime());
}

export async function markThreadsSeen(noticeId: number) {
  await db().update(noticeReplies).set({ seenAt: new Date() }).where(and(eq(noticeReplies.noticeId, noticeId), eq(noticeReplies.fromAdmin, false), isNull(noticeReplies.seenAt)));
}

/** Admin list: replies and unread replies per notice. */
export async function replyCounts(): Promise<Map<number, { replies: number; unread: number; people: number }>> {
  const rows = await db().select({
    id: noticeReplies.noticeId,
    replies: sql<number>`sum(case when ${noticeReplies.fromAdmin} = 0 then 1 else 0 end)`,
    unread: sql<number>`sum(case when ${noticeReplies.fromAdmin} = 0 and ${noticeReplies.seenAt} is null then 1 else 0 end)`,
    people: sql<number>`count(distinct ${noticeReplies.userId})`,
  }).from(noticeReplies).groupBy(noticeReplies.noticeId);
  return new Map(rows.map((r) => [r.id, { replies: Number(r.replies), unread: Number(r.unread), people: Number(r.people) }]));
}

/** Hourly job: delete notices sent more than 30 days ago, with their replies and notifications. Returns how many. */
export async function deleteExpiredNotices(now = new Date()): Promise<number> {
  const d = db();
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
  const old = await d.select({ id: notices.id }).from(notices).where(lt(notices.createdAt, cutoff)).limit(500);
  if (!old.length) return 0;
  const ids = old.map((o) => o.id);
  await chunked(ids.map(noticeLink), async (links) => { await d.delete(notifications).where(inArray(notifications.link, links)); return []; });
  await chunked(ids.map((id) => `/admin/messages/${id}/`), async (prefixes) => {
    for (const p of prefixes) await d.delete(notifications).where(sql`${notifications.link} like ${p + '%'}`);
    return [];
  });
  await chunked(ids, async (part) => { await d.delete(noticeReplies).where(inArray(noticeReplies.noticeId, part)); return []; });
  await chunked(ids, async (part) => { await d.delete(notices).where(inArray(notices.id, part)); return []; });
  return ids.length;
}
