/**
 * Transactional email through Resend's REST API. No-op (logged) when RESEND_API_KEY is not set yet.
 */
import { env } from 'cloudflare:workers';
import { SITE } from './site';

export async function sendEmail(opts: { to: string; subject: string; text: string; replyTo?: string }): Promise<boolean> {
  const apiKey = (env as unknown as { RESEND_API_KEY?: string }).RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email skipped: no RESEND_API_KEY] to=${opts.to} subject=${opts.subject}`);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: `${SITE.name} <no-reply@${SITE.domain}>`, to: [opts.to], subject: opts.subject, text: opts.text, reply_to: opts.replyTo }),
  });
  if (!res.ok) console.error('resend error', res.status, (await res.text().catch(() => '')).slice(0, 300));
  return res.ok;
}

export function postDecisionEmail(p: { authorName: string; title: string; status: string; reason: string; url: string; editUrl: string }): { subject: string; text: string } {
  const hi = `Hi ${p.authorName.split(' ')[0]},\n\n`;
  if (p.status === 'published') {
    return { subject: `Published: ${p.title}`, text: `${hi}Your article "${p.title}" is live on ${SITE.name}:\n${p.url}\n\nThank you for writing with us.\n— ${SITE.name}` };
  }
  if (p.status === 'pending_review') {
    return { subject: `In review: ${p.title}`, text: `${hi}Your article "${p.title}" passed the automatic checks but needs a quick look from an editor. This usually takes under two days; we will email you either way.\n\nReason given by the checks: ${p.reason}\n\n— ${SITE.name}` };
  }
  if (p.status === 'changes_requested') {
    return { subject: `Changes requested: ${p.title}`, text: `${hi}An editor read "${p.title}" and asked for a few changes before it can be published.

What to change: ${p.reason}

Edit it and submit again here:
${p.editUrl}

— ${SITE.name}` };
  }
  return { subject: `Not published: ${p.title}`, text: `${hi}Your article "${p.title}" was not published.\n\nReason: ${p.reason}\n\nYou can edit and resubmit it here:\n${p.editUrl}\n\nIf you think this is a mistake, reply to this email.\n— ${SITE.name}` };
}
