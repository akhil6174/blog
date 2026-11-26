/**
 * The public /people/ page (D-044): interns who completed the internship and campus ambassadors, added by the
 * admin on /admin/people. Ambassadors assigned on /admin/ambassadors can be listed too (setting
 * people_auto_ambassadors). The page is off until the setting people_page_open is true.
 */
import { asc, eq } from 'drizzle-orm';
import { db, people } from './db';
import { purgePaths } from './cache';
import { publicAmbassadors } from './ambassadors';
import { getSettingBool } from './db/settings';

export type Person = typeof people.$inferSelect;
export type PublicPerson = Pick<Person, 'name' | 'photo' | 'role' | 'college' | 'period' | 'summary' | 'github' | 'linkedin' | 'website' | 'highlightUrl' | 'highlightLabel'> & { profileUrl?: string | null };
export type PersonInput = Omit<Person, 'id' | 'createdAt' | 'updatedAt'> & { id?: number };

export const PEOPLE_PATH = '/people/';
export const refreshPeoplePage = () => purgePaths([PEOPLE_PATH, '/sitemap-community.xml']).catch(() => {});

export async function listAll(): Promise<Person[]> {
  return db().select().from(people).orderBy(asc(people.kind), asc(people.sort), asc(people.name));
}

export async function savePerson(p: PersonInput): Promise<number> {
  const d = db();
  const values = { ...p, updatedAt: new Date() };
  delete (values as { id?: number }).id;
  let id = p.id;
  if (id) {
    const r = await d.update(people).set(values).where(eq(people.id, id)).returning({ id: people.id });
    if (!r.length) throw new Error('Profile not found.');
  } else {
    id = (await d.insert(people).values(values).returning({ id: people.id }))[0]!.id;
  }
  await refreshPeoplePage();
  return id;
}

export async function setPublished(id: number, published: boolean): Promise<void> {
  await db().update(people).set({ published, updatedAt: new Date() }).where(eq(people.id, id));
  await refreshPeoplePage();
}

export async function deletePerson(id: number): Promise<void> {
  await db().delete(people).where(eq(people.id, id));
  await refreshPeoplePage();
}

const pick = (p: Person): PublicPerson => ({
  name: p.name, photo: p.photo, role: p.role, college: p.college, period: p.period, summary: p.summary,
  github: p.github, linkedin: p.linkedin, website: p.website, highlightUrl: p.highlightUrl, highlightLabel: p.highlightLabel,
});

/** What the public page shows. Ambassadors added by hand come first; assigned ambassadors with the same name are not repeated. */
export async function publicPeople(): Promise<{ interns: PublicPerson[]; ambassadors: PublicPerson[] }> {
  const rows = await db().select().from(people).where(eq(people.published, true)).orderBy(asc(people.sort), asc(people.name));
  const interns = rows.filter((r) => r.kind === 'intern').map(pick);
  const ambassadors = rows.filter((r) => r.kind === 'ambassador').map(pick);
  if (await getSettingBool('people_auto_ambassadors')) {
    const seen = new Set(ambassadors.map((a) => a.name.trim().toLowerCase()));
    for (const a of (await publicAmbassadors()).people) {
      if (seen.has(a.name.trim().toLowerCase())) continue;
      ambassadors.push({ name: a.name, photo: a.image, role: 'Campus Ambassador', college: a.college, period: a.since ? `Since ${a.since.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', year: 'numeric' })}` : null, summary: null, github: null, linkedin: null, website: null, highlightUrl: null, highlightLabel: null, profileUrl: a.handle ? `/writer/${a.handle}/` : null });
    }
  }
  return { interns, ambassadors };
}

export async function counts() {
  const rows = await db().select({ kind: people.kind, published: people.published }).from(people);
  return {
    interns: rows.filter((r) => r.kind === 'intern' && r.published).length,
    ambassadors: rows.filter((r) => r.kind === 'ambassador' && r.published).length,
    hidden: rows.filter((r) => !r.published).length,
  };
}
