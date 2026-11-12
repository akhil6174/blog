/**
 * POST /api/contact (runs in the Worker).
 * 1. Honeypot + field validation (Zod-free to keep Phase 1 dependency-light; Zod arrives with Phase 3 forms).
 * 2. Turnstile verification when TURNSTILE_SECRET_KEY is configured.
 * 3. Delivery through Resend's REST API to CONTACT_TO. Without RESEND_API_KEY the route answers 503 with a clear message.
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { SITE } from '../../lib/site';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secret = (env as unknown as { TURNSTILE_SECRET_KEY?: string }).TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured yet (Phase 1 owner task); honeypot still applies
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const data = (await res.json()) as { success?: boolean };
  return !!data.success;
}

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: 'Invalid form submission.' }, 400);

  const get = (k: string) => String(form.get(k) ?? '').trim();
  if (get('website')) return json({ ok: true }); // honeypot filled: pretend success, drop silently

  const name = get('name').slice(0, 100);
  const email = get('email').slice(0, 200);
  const subject = get('subject').slice(0, 100) || 'General question';
  const message = get('message').slice(0, 4000);

  if (name.length < 2) return json({ error: 'Please enter your name.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Please enter a valid email address.' }, 400);
  if (message.length < 20) return json({ error: 'Please write at least a sentence or two.' }, 400);

  const ip = request.headers.get('cf-connecting-ip');
  const token = get('cf-turnstile-response');
  if (!(await verifyTurnstile(token, ip))) return json({ error: 'The bot check failed. Please try again.' }, 400);

  const apiKey = (env as unknown as { RESEND_API_KEY?: string }).RESEND_API_KEY;
  if (!apiKey) return json({ error: `The contact form is not connected yet. Please email ${SITE.contactEmail}.` }, 503);

  const to = env.CONTACT_TO || SITE.contactTo;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: `${SITE.name} contact form <no-reply@${SITE.domain}>`,
      to: [to],
      reply_to: email,
      subject: `[${SITE.name}] ${subject} from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\nIP: ${ip ?? 'unknown'}\n\n${message}`,
    }),
  });

  if (!res.ok) {
    console.error('resend error', res.status, await res.text().catch(() => ''));
    return json({ error: `We could not send your message. Please email ${SITE.contactEmail}.` }, 502);
  }
  return json({ ok: true });
};
