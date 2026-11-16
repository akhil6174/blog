/**
 * POST /api/apply : internship (or contributor) application from /join-us. Stored in `applications` and emailed
 * to the editor. Works signed out. Limits: the programme must be on, and 3 applications per email per 30 days.
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { and, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { applications, db } from '../../lib/db';
import { programmeConfig } from '../../lib/programme';
import { sendEmail } from '../../lib/email';
import { verifyTurnstile } from '../../lib/turnstile';
import { SITE } from '../../lib/site';

export const prerender = false;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store' } });

const Body = z.object({
  track: z.enum(['internship', 'contributor']).default('internship'),
  name: z.string().trim().min(2, 'Please enter your name.').max(80),
  email: z.string().trim().toLowerCase().email('Please enter a valid email.').max(120),
  college: z.string().trim().max(100).default(''),
  interests: z.string().trim().max(200).default(''),
  sampleUrl: z.union([z.literal(''), z.string().trim().max(200).regex(/^https?:\/\/\S+$/, 'The sample link must start with https://')]).default(''),
  message: z.string().trim().min(30, 'Tell us a little more (at least 30 characters).').max(2000),
  turnstileToken: z.string().optional().default(''),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const cfg = await programmeConfig();
  if (!cfg.open && locals.user?.role !== 'admin') return json({ error: 'Applications are not open yet.' }, 403);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid application.' }, 400);
  const b = parsed.data;
  if (!(await verifyTurnstile(b.turnstileToken, request.headers.get('cf-connecting-ip')))) return json({ error: 'Bot check failed. Please try again.' }, 400);
  const d = db();
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [{ n }] = await d.select({ n: sql<number>`count(*)` }).from(applications).where(and(eq(applications.email, b.email), gte(applications.createdAt, since)));
  if (Number(n) >= 3) return json({ error: 'We already have your application. We will email you.' }, 429);
  await d.insert(applications).values({ userId: locals.user?.id ?? null, track: b.track, name: b.name, email: b.email, college: b.college || null, interests: b.interests || null, sampleUrl: b.sampleUrl || null, message: b.message });
  const to = (env as unknown as { CONTACT_TO?: string }).CONTACT_TO || SITE.contactTo;
  await sendEmail({ to, replyTo: b.email, subject: `New ${b.track} application: ${b.name}`, text: `${b.name} <${b.email}>\nCollege: ${b.college || '-'}\nInterests: ${b.interests || '-'}\nSample: ${b.sampleUrl || '-'}\n\n${b.message}\n\nReview it in Programme admin: ${env.SITE_URL}/admin/programme/#applications` });
  return json({ message: 'Thank you. Your application is in; we reply by email within two weeks.' });
};
