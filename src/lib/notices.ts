/**
 * Admin messages to campus ambassadors and interns (D-046). The full message is stored once (notices); each
 * recipient gets a notification "Notice from Akhilendra: <title>" linking to /me/notices/<id>/.
 * Ambassadors: users assigned to a college. Interns: users whose sign-in email has an internship code.
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { colleges, db, internCodes, notices, notifications, user } from './db';
import { chunked } from './db/chunk';
import { notifyMany } from './notify';

export const NOTICE_SENDER = 'Akhilendra';
export const noticeLink = (id: number) => `/me/notices/${id}/`;

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
  if (mine && !mine.readAt) await d.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, mine.id));
  return n;
}
