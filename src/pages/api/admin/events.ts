/**
 * POST /api/admin/events : manage /events/ (admin only, via middleware; audited).
 * Actions: save { event } (add or edit; times are India time "YYYY-MM-DDTHH:MM"), publish { id, published }, delete { id }.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { audit } from '../../../lib/audit';
import { fromIstInput } from '../../../lib/event-time';
import { deleteEvent, saveEvent, setEventPublished } from '../../../lib/events';
import { MEDIA_PATH } from '../../../lib/media';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store' } });
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

const Event = z.object({
  id: z.number().int().positive().optional(),
  title: z.string().trim().min(4, 'Title needs at least 4 characters.').max(120),
  subtitle: opt(200),
  description: z.string().trim().min(10, 'Add a description (at least 10 characters).').max(5000),
  coverImage: z.string().trim().max(200).optional().transform((v) => v || null).refine((v) => v === null || MEDIA_PATH.test(v), 'Upload the cover with the "Upload cover" button.'),
  link: z.string().trim().max(300).optional().transform((v) => v || null).refine((v) => v === null || /^(https:\/\/|\/)[^\s]*$/.test(v), 'The link must start with https:// or /'),
  linkLabel: opt(40),
  location: opt(120),
  startsAt: z.string(),
  endsAt: z.string().optional().default(''),
  published: z.boolean().default(true),
});

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), event: Event }),
  z.object({ action: z.literal('publish'), id: z.number().int(), published: z.boolean() }),
  z.object({ action: z.literal('delete'), id: z.number().int() }),
]);

export const POST: APIRoute = async ({ request, locals }) => {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, 400);
  const b = parsed.data;
  let message: string;
  let target: number;
  if (b.action === 'save') {
    const startsAt = fromIstInput(b.event.startsAt);
    if (!startsAt) return json({ error: 'Choose when the event starts.' }, 400);
    const endsAt = b.event.endsAt ? fromIstInput(b.event.endsAt) : null;
    if (b.event.endsAt && !endsAt) return json({ error: 'The end time is not valid.' }, 400);
    if (endsAt && endsAt < startsAt) return json({ error: 'The event cannot end before it starts.' }, 400);
    target = await saveEvent({ ...b.event, startsAt, endsAt });
    message = b.event.id ? 'Event updated.' : 'Event added.';
  } else if (b.action === 'publish') {
    await setEventPublished(b.id, b.published);
    target = b.id;
    message = b.published ? 'Event shown on the events page.' : 'Event hidden.';
  } else {
    await deleteEvent(b.id);
    target = b.id;
    message = 'Event deleted.';
  }
  await audit(locals.user!.id, `event:${b.action}`, String(target), null);
  return json({ message, id: target });
};
