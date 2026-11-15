import { env } from 'cloudflare:workers';

/** Verifies a Turnstile token. Returns true when Turnstile is not configured yet (owner task), so forms keep working. */
export async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secret = (env as unknown as { TURNSTILE_SECRET_KEY?: string }).TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean };
  return !!data.success;
}
