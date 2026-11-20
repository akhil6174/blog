/**
 * Campus ambassadors (D-040). The owner keeps a list of colleges, recruits one ambassador per college off-site
 * (LinkedIn, email) and assigns them here by the Google email they signed in with. Ambassadors get a badge on their
 * writer page, their name on /students/campus-ambassadors/, a certificate (tracked here) and internship priority.
 */
import { and, asc, eq, isNotNull, isNull, like, or, sql } from 'drizzle-orm';
import { colleges, db, user } from './db';
import { notify } from './notify';

export class AmbassadorError extends Error {}
const fail = (m: string): never => {
  throw new AmbassadorError(m);
};

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Writer pages are edge-cached; refresh the one whose badge changed. */
async function refreshWriterPage(userId: string) {
  const u = await db().query.user.findFirst({ where: eq(user.id, userId), columns: { handle: true } });
  if (!u?.handle) return;
  try { await (await import('./cache')).purgePaths([`/writer/${u.handle}/`]); } catch { /* cache is best-effort */ }
}

/**
 * One college per line: "Name", "Name | City" or "Name | City | State" (a tab works as well as "|").
 * Commas stay part of the name, because many college names contain them.
 */
export function parseCollegeLines(text: string): { name: string; city: string | null; state: string | null }[] {
  const seen = new Set<string>();
  const out: { name: string; city: string | null; state: string | null }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const [name, city, state] = raw.split(/\t|\s\|\s|\|/).map(tidy);
    if (!name || name.length < 3) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: name.slice(0, 160), city: city ? city.slice(0, 60) : null, state: state ? state.slice(0, 60) : null });
  }
  return out;
}

export async function addColleges(text: string): Promise<{ added: number; skipped: number }> {
  const rows = parseCollegeLines(text);
  if (!rows.length) fail('Add at least one college name (one per line).');
  if (rows.length > 1000) fail('Paste at most 1,000 colleges at a time.');
  const d = db();
  let added = 0;
  for (const r of rows) {
    const exists = await d.select({ id: colleges.id }).from(colleges).where(sql`lower(${colleges.name}) = ${r.name.toLowerCase()}`).limit(1);
    if (exists.length) continue;
    await d.insert(colleges).values(r);
    added++;
  }
  return { added, skipped: rows.length - added };
}

export async function assignAmbassador(collegeId: number, email: string): Promise<{ name: string; college: string }> {
  const d = db();
  const c = await d.query.colleges.findFirst({ where: eq(colleges.id, collegeId) });
  if (!c) fail('College not found.');
  if (c!.ambassadorId) fail(`${c!.name} already has an ambassador. Remove them first.`);
  const u = await d.query.user.findFirst({ where: eq(user.email, email.trim().toLowerCase()) });
  if (!u) fail('No account with that email yet. Ask them to sign in once at trutiai.in with Google, then try again.');
  if (u!.bannedAt) fail('That account is suspended.');
  const other = await d.query.colleges.findFirst({ where: eq(colleges.ambassadorId, u!.id), columns: { name: true } });
  if (other) fail(`${u!.name} is already the ambassador for ${other.name}.`);
  await d.update(colleges).set({ ambassadorId: u!.id, ambassadorSince: new Date(), certificateSentAt: null, ambassadorCode: null }).where(eq(colleges.id, collegeId));
  if (!u!.college) await d.update(user).set({ college: c!.name, updatedAt: new Date() }).where(eq(user.id, u!.id));
  await refreshWriterPage(u!.id);
  await notify(u!.id, 'announcement', `You are now the TrutiAI Campus Ambassador for ${c!.name}. Your badge is on your writer page.`, '/students/campus-ambassadors/');
  return { name: u!.name, college: c!.name };
}

export async function removeAmbassador(collegeId: number): Promise<void> {
  const c = await db().query.colleges.findFirst({ where: eq(colleges.id, collegeId), columns: { ambassadorId: true } });
  await db().update(colleges).set({ ambassadorId: null, ambassadorSince: null, certificateSentAt: null, ambassadorCode: null }).where(eq(colleges.id, collegeId));
  if (c?.ambassadorId) await refreshWriterPage(c.ambassadorId);
}

export async function setCertificate(collegeId: number, sent: boolean): Promise<void> {
  const c = await db().query.colleges.findFirst({ where: eq(colleges.id, collegeId), columns: { ambassadorId: true } });
  if (!c?.ambassadorId) fail('This college has no ambassador.');
  await db().update(colleges).set({ certificateSentAt: sent ? new Date() : null }).where(eq(colleges.id, collegeId));
}

export async function deleteCollege(collegeId: number): Promise<void> {
  const c = await db().query.colleges.findFirst({ where: eq(colleges.id, collegeId), columns: { ambassadorId: true } });
  if (c?.ambassadorId) fail('Remove the ambassador before deleting the college.');
  await db().delete(colleges).where(eq(colleges.id, collegeId));
}

export type CollegeRow = typeof colleges.$inferSelect & { ambassador: { name: string; email: string; handle: string | null } | null };

/** Admin list: search by college, city, state or ambassador; filter by status. */
export async function listColleges(opts: { q?: string; status?: 'all' | 'open' | 'filled'; limit?: number }): Promise<{ rows: CollegeRow[]; total: number; filled: number }> {
  const d = db();
  const where = [];
  const q = (opts.q ?? '').trim().slice(0, 80);
  if (q) {
    const pat = `%${q.replace(/[%_]/g, '')}%`;
    where.push(or(like(colleges.name, pat), like(colleges.city, pat), like(colleges.state, pat), like(user.name, pat), like(user.email, pat))!);
  }
  if (opts.status === 'open') where.push(isNull(colleges.ambassadorId));
  if (opts.status === 'filled') where.push(isNotNull(colleges.ambassadorId));
  const rows = await d
    .select({ c: colleges, name: user.name, email: user.email, handle: user.handle })
    .from(colleges)
    .leftJoin(user, eq(user.id, colleges.ambassadorId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(sql`${colleges.ambassadorId} is null`, asc(colleges.name))
    .limit(opts.limit ?? 300);
  const [{ total, filled }] = await d.select({ total: sql<number>`count(*)`, filled: sql<number>`count(${colleges.ambassadorId})` }).from(colleges);
  return {
    rows: rows.map((r) => ({ ...r.c, ambassador: r.c.ambassadorId && r.name ? { name: r.name, email: r.email ?? '', handle: r.handle } : null })),
    total: Number(total),
    filled: Number(filled),
  };
}

/** Public: current ambassadors (name, photo, profile link, college) and colleges still looking for one. */
export async function publicAmbassadors() {
  const d = db();
  const people = await d
    .select({ name: user.name, image: user.image, handle: user.handle, college: colleges.name, city: colleges.city, state: colleges.state, since: colleges.ambassadorSince })
    .from(colleges)
    .innerJoin(user, eq(user.id, colleges.ambassadorId))
    .where(isNull(user.bannedAt))
    .orderBy(asc(colleges.name));
  const open = await d.select({ name: colleges.name, city: colleges.city, state: colleges.state }).from(colleges).where(isNull(colleges.ambassadorId)).orderBy(asc(colleges.state), asc(colleges.name)).limit(500);
  return { people, open };
}

/** The college a user is ambassador for, or null (for the badge). */
export async function ambassadorCollege(userId: string): Promise<string | null> {
  const c = await db().query.colleges.findFirst({ where: eq(colleges.ambassadorId, userId), columns: { name: true } });
  return c?.name ?? null;
}

// ---------- Ambassador codes (D-041) ----------

/** Readable code with no 0/O/1/I: AMB-7K3M-9QXA. */
export function newAmbassadorCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const s = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => A[x % A.length]).join('');
  return `AMB-${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Create (or replace) the one-time code for a college that has no ambassador yet. */
export async function createCode(collegeId: number): Promise<string> {
  const d = db();
  const c = await d.query.colleges.findFirst({ where: eq(colleges.id, collegeId) });
  if (!c) fail('College not found.');
  if (c!.ambassadorId) fail(`${c!.name} already has an ambassador.`);
  let code = newAmbassadorCode();
  while (await d.query.colleges.findFirst({ where: eq(colleges.ambassadorCode, code), columns: { id: true } })) code = newAmbassadorCode();
  await d.update(colleges).set({ ambassadorCode: code }).where(eq(colleges.id, collegeId));
  return code;
}

/**
 * A student enters the code on /me: they become that college's ambassador, their profile college is set to it,
 * and a reader becomes a writer (ambassadors can write). The code is used up.
 */
export async function redeemCode(userId: string, raw: string): Promise<{ college: string }> {
  const code = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!/^AMB-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) fail('That does not look like an ambassador code (AMB-XXXX-XXXX).');
  const d = db();
  const c = await d.query.colleges.findFirst({ where: eq(colleges.ambassadorCode, code) });
  if (!c) fail('That code is not valid or has already been used. Check the email from TrutiAI.');
  if (c!.ambassadorId && c!.ambassadorId !== userId) fail(`${c!.name} already has an ambassador.`);
  const other = await d.query.colleges.findFirst({ where: eq(colleges.ambassadorId, userId), columns: { id: true, name: true } });
  if (other && other.id !== c!.id) fail(`You are already the ambassador for ${other.name}.`);
  const u = await d.query.user.findFirst({ where: eq(user.id, userId), columns: { role: true } });
  await d.update(colleges).set({ ambassadorId: userId, ambassadorSince: new Date(), ambassadorCode: null, certificateSentAt: null }).where(eq(colleges.id, c!.id));
  await d.update(user).set({ college: c!.name, ...(u?.role === 'reader' ? { role: 'writer' as const } : {}), updatedAt: new Date() }).where(eq(user.id, userId));
  await refreshWriterPage(userId);
  await notify(userId, 'announcement', `Welcome! You are now the TrutiAI Campus Ambassador for ${c!.name}.`, '/me/#ambassador');
  return { college: c!.name };
}

/** All college names, for the profile's college picker. */
export async function collegeNames(): Promise<string[]> {
  return (await db().select({ name: colleges.name }).from(colleges).orderBy(asc(colleges.name))).map((r) => r.name);
}

/** Students whose profile college matches (case-insensitive), not counting the ambassador. */
export async function studentsFrom(collegeName: string, exceptUserId?: string) {
  const d = db();
  const where = sql`lower(trim(${user.college})) = ${collegeName.trim().toLowerCase()} and ${user.bannedAt} is null${exceptUserId ? sql` and ${user.id} != ${exceptUserId}` : sql``}`;
  const [{ n }] = await d.select({ n: sql<number>`count(*)` }).from(user).where(where);
  const byMonth = await d
    .select({ month: sql<string>`strftime('%Y-%m', ${user.createdAt}, 'unixepoch', '+330 minutes')`, n: sql<number>`count(*)` })
    .from(user)
    .where(where)
    .groupBy(sql`strftime('%Y-%m', ${user.createdAt}, 'unixepoch', '+330 minutes')`);
  return { total: Number(n), byMonth: new Map(byMonth.map((r) => [r.month, Number(r.n)])) };
}

/** Ambassador dashboard data for /me, or null if the user is not an ambassador. */
export async function ambassadorStats(userId: string) {
  const c = await db().query.colleges.findFirst({ where: eq(colleges.ambassadorId, userId) });
  if (!c) return null;
  const s = await studentsFrom(c.name, userId);
  return { college: c.name, city: c.city, state: c.state, since: c.ambassadorSince, certificateSentAt: c.certificateSentAt, students: s.total, byMonth: s.byMonth };
}

/** Joined-student counts for every college (admin list). */
export async function joinedCounts(): Promise<Map<string, number>> {
  const rows = await db().select({ college: sql<string>`lower(trim(${user.college}))`, n: sql<number>`count(*)` }).from(user).where(sql`${user.college} is not null and ${user.bannedAt} is null`).groupBy(sql`lower(trim(${user.college}))`);
  return new Map(rows.map((r) => [r.college, Number(r.n)]));
}
