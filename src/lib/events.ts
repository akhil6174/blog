/** Events (D-047): admin-managed on /admin/events, shown on /events/ and /events/<id>/. */
import { asc, desc, eq } from 'drizzle-orm';
import { db, events } from './db';
import { purgePaths } from './cache';
import { isUpcoming } from './event-time';

export type EventRow = typeof events.$inferSelect;
export type EventInput = Omit<EventRow, 'id' | 'createdAt' | 'updatedAt'> & { id?: number };

export const eventPath = (id: number) => `/events/${id}/`;
const refresh = (id?: number) => purgePaths(['/events/', '/sitemap-community.xml', ...(id ? [eventPath(id)] : [])]).catch(() => {});

export async function listAllEvents(): Promise<EventRow[]> {
  return db().select().from(events).orderBy(desc(events.startsAt));
}

export async function publicEvents(now = new Date()): Promise<{ upcoming: EventRow[]; past: EventRow[] }> {
  const rows = await db().select().from(events).where(eq(events.published, true)).orderBy(asc(events.startsAt));
  const upcoming = rows.filter((e) => isUpcoming(e.startsAt, e.endsAt, now));
  const past = rows.filter((e) => !isUpcoming(e.startsAt, e.endsAt, now)).reverse().slice(0, 24);
  return { upcoming, past };
}

export async function getEvent(id: number): Promise<EventRow | null> {
  return (await db().query.events.findFirst({ where: eq(events.id, id) })) ?? null;
}

export async function saveEvent(e: EventInput): Promise<number> {
  const values = { ...e, updatedAt: new Date() };
  delete (values as { id?: number }).id;
  let id = e.id;
  if (id) {
    const r = await db().update(events).set(values).where(eq(events.id, id)).returning({ id: events.id });
    if (!r.length) throw new Error('Event not found.');
  } else {
    id = (await db().insert(events).values(values).returning({ id: events.id }))[0]!.id;
  }
  await refresh(id);
  return id;
}

export async function setEventPublished(id: number, published: boolean) {
  await db().update(events).set({ published, updatedAt: new Date() }).where(eq(events.id, id));
  await refresh(id);
}

export async function deleteEvent(id: number) {
  await db().delete(events).where(eq(events.id, id));
  await refresh(id);
}
