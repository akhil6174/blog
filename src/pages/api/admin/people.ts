/**
 * POST /api/admin/people : manage the public /people/ page (admin only, via middleware; every change audited).
 * Actions: save { person } (add or edit), publish { id, published }, delete { id }, settings { open?, auto? }.
 */
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { audit } from '../../../lib/audit';
import { MEDIA_PATH } from '../../../lib/media';
import { deletePerson, refreshPeoplePage, savePerson, setPublished } from '../../../lib/people';
import { normalizeGithub, normalizeLinkedin } from '../../../lib/profile';
import { setSetting } from '../../../lib/db/settings';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store' } });

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const https = (label: string) => z.string().trim().max(300).optional().transform((v) => v || null)
  .refine((v) => v === null || /^https:\/\/[^\s]+$/.test(v), `${label} must start with https://`);

const Person = z.object({
  id: z.number().int().positive().optional(),
  kind: z.enum(['intern', 'ambassador']),
  name: z.string().trim().min(2, 'Name needs at least 2 characters.').max(80),
  photo: z.string().trim().max(200).optional().transform((v) => v || null).refine((v) => v === null || MEDIA_PATH.test(v), 'Upload the photo with the "Upload photo" button.'),
  role: opt(100),
  college: opt(120),
  period: opt(60),
  summary: opt(500),
  github: z.string().max(200).optional().default(''),
  linkedin: z.string().max(200).optional().default(''),
  website: https('Website'),
  highlightUrl: https('Highlight link'),
  highlightLabel: opt(60),
  published: z.boolean().default(true),
  sort: z.number().int().min(0).max(9999).default(100),
});

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), person: Person }),
  z.object({ action: z.literal('publish'), id: z.number().int(), published: z.boolean() }),
  z.object({ action: z.literal('delete'), id: z.number().int() }),
  z.object({ action: z.literal('settings'), open: z.boolean().optional(), auto: z.boolean().optional() }),
]);

export const POST: APIRoute = async ({ request, locals }) => {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, 400);
  const b = parsed.data;
  let message = 'Saved.';
  let target: string | null = null;
  if (b.action === 'save') {
    const gh = normalizeGithub(b.person.github);
    const li = normalizeLinkedin(b.person.linkedin);
    for (const v of [gh, li]) if (v && typeof v === 'object') return json({ error: v.error }, 400);
    const id = await savePerson({ ...b.person, github: gh as string | null, linkedin: li as string | null });
    target = String(id);
    message = b.person.id ? `${b.person.name}'s profile updated.` : `${b.person.name} added.`;
  } else if (b.action === 'publish') {
    await setPublished(b.id, b.published);
    target = String(b.id);
    message = b.published ? 'Profile shown on the page.' : 'Profile hidden from the page.';
  } else if (b.action === 'delete') {
    await deletePerson(b.id);
    target = String(b.id);
    message = 'Profile deleted.';
  } else {
    if (b.open !== undefined) await setSetting('people_page_open', String(b.open));
    if (b.auto !== undefined) await setSetting('people_auto_ambassadors', String(b.auto));
    await refreshPeoplePage();
    message = b.open === undefined ? 'Saved.' : b.open ? 'The page is now public.' : 'The page is now turned off (visitors get "not found").';
  }
  await audit(locals.user!.id, `people:${b.action}`, target, b.action === 'settings' ? JSON.stringify({ open: b.open, auto: b.auto }) : null);
  return json({ message });
};
