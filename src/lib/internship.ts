/**
 * Internship codes (D-032). Interns are recruited and given their projects off-site (LinkedIn, email). Each intern
 * gets one unique code, tied to the Google email they sign in with. They paste it in the editor when submitting an
 * article about a project. /admin/internships counts published articles per code; at the target
 * (`internship_articles`, default 3) the editor emails the certificate and marks it sent.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, internCodes, posts, user } from './db';
import { getSettings } from './db/settings';
import { SITE } from './site';

export async function articlesNeeded(): Promise<number> {
  return Math.min(20, Math.max(1, Number((await getSettings()).internship_articles) || 3));
}

/** Readable, hard to guess: INT-7K3M-9QXA (no 0/O/1/I). */
export function newCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(8));
  const s = [...b].map((x) => A[x % A.length]).join('');
  return `INT-${s.slice(0, 4)}-${s.slice(4)}`;
}

export const normaliseCode = (c: string) => c.trim().toUpperCase().replace(/\s+/g, '');

/**
 * Check a code a writer typed. Returns the normalised code, or an error the writer can act on.
 * Empty means "no internship article" and is always fine.
 */
export async function checkCode(raw: string | null | undefined, writerEmail: string): Promise<{ code: string | null } | { error: string }> {
  const code = normaliseCode(raw ?? '');
  if (!code) return { code: null };
  const row = await db().query.internCodes.findFirst({ where: eq(internCodes.code, code) });
  if (!row) return { error: 'That internship code does not exist. Check it in the email from the editor.' };
  if (row.email !== writerEmail.trim().toLowerCase()) return { error: `This internship code belongs to another account. Sign in with the email you gave ${SITE.name}.` };
  return { code };
}

export type CodeRow = typeof internCodes.$inferSelect & { published: number; inReview: number; articles: { id: string; title: string; slug: string; status: string; publishedAt: Date | null }[]; accountName: string | null };

/** Every code with its article counts, newest first. */
export async function codeOverview(): Promise<CodeRow[]> {
  const d = db();
  const codes = await d.select().from(internCodes).orderBy(desc(internCodes.createdAt));
  if (!codes.length) return [];
  const arts = await d
    .select({ id: posts.id, title: posts.title, slug: posts.slug, status: posts.status, publishedAt: posts.publishedAt, code: posts.internCode, authorEmail: user.email, authorName: user.name })
    .from(posts)
    .innerJoin(user, eq(user.id, posts.authorId))
    .where(sql`${posts.internCode} is not null and ${posts.status} not in ('draft', 'trashed')`);
  const accounts = await d.select({ email: user.email, name: user.name }).from(user).where(sql`${user.email} in (select email from intern_codes)`);
  const am = new Map(accounts.map((a) => [a.email, a.name]));
  return codes.map((c) => {
    // Only articles by the code's own account count.
    const mine = arts.filter((a) => a.code === c.code && a.authorEmail === c.email);
    return {
      ...c,
      published: mine.filter((a) => a.status === 'published').length,
      inReview: mine.filter((a) => ['submitted', 'checking', 'pending_review', 'changes_requested', 'scheduled'].includes(a.status)).length,
      articles: mine.map(({ id, title, slug, status, publishedAt }) => ({ id, title, slug, status, publishedAt })),
      accountName: am.get(c.email) ?? null,
    };
  });
}

/** Make the intern a writer now (or on first sign-in, through the invited list). */
export async function letWrite(email: string): Promise<'now' | 'on-sign-in'> {
  const d = db();
  const u = await d.query.user.findFirst({ where: eq(user.email, email), columns: { id: true, role: true } });
  if (u) {
    if (u.role === 'reader') await d.update(user).set({ role: 'writer', updatedAt: new Date() }).where(and(eq(user.id, u.id), eq(user.role, 'reader')));
    return 'now';
  }
  const { getSetting, setSetting } = await import('./db/settings');
  const list = (await getSetting('invited_emails')).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!list.includes(email)) await setSetting('invited_emails', [...list, email].join(','));
  return 'on-sign-in';
}
