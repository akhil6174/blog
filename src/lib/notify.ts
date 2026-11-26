/**
 * In-site notifications (shown on /me/notifications). Never throws: a failed notification must not break the
 * action that caused it. One D1 write per notification.
 */
import { db, notifications } from './db';

export type NoticeType = 'article' | 'comment' | 'reply' | 'reward' | 'ranking' | 'announcement' | 'notice';

export async function notify(userId: string | null | undefined, type: NoticeType, title: string, link?: string | null): Promise<void> {
  if (!userId) return;
  try {
    await db().insert(notifications).values({ userId, type, title: title.slice(0, 200), link: link ?? null });
  } catch (e) {
    console.error('[notify] failed:', (e as Error).message);
  }
}

/**
 * Many users at once (announcements). D1 allows at most 100 bound values per statement and each row binds 4,
 * so rows go in batches of 20.
 */
export async function notifyMany(userIds: string[], type: NoticeType, title: string, link?: string | null): Promise<number> {
  const rows = [...new Set(userIds)].map((userId) => ({ userId, type, title: title.slice(0, 200), link: link ?? null }));
  for (let i = 0; i < rows.length; i += 20) await db().insert(notifications).values(rows.slice(i, i + 20));
  return rows.length;
}
