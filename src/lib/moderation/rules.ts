/**
 * Step 1: rule checks. Free, instant, no AI. Returns the first failing rule.
 */
import { and, eq, gte, ne, sql } from 'drizzle-orm';
import { db, posts, user } from '../db';
import { getSettings } from '../db/settings';
import { externalLinks } from '../content';
import { hasRole } from '../auth';
import type { ModerationTarget, StepResult } from './types';

// Obvious spam markers. Kept short on purpose; the AI step handles nuance.
const BANNED_PATTERNS: RegExp[] = [
  /\b(viagra|cialis|casino bonus|escort service|buy followers)\b/i,
  /\b(whatsapp me|telegram @|dm for price)\b/i,
  /(.)\1{25,}/, // 26+ repeated characters
];

export async function runRules(t: ModerationTarget, ownHost: string): Promise<StepResult> {
  const started = Date.now();
  const s = await getSettings();
  const d = db();
  const author = await d.query.user.findFirst({ where: eq(user.id, t.authorId) });
  const fail = (reason: string): StepResult => ({ step: 'rules', verdict: 'reject', reason, provider: 'code', durationMs: Date.now() - started });

  if (!author) return fail('Author account not found.');
  if (author.bannedAt) return fail('This account is suspended.');

  if (t.kind === 'post') {
    const min = Number(s.min_words);
    if (t.words < min) return fail(`Too short: ${t.words} words, minimum ${min}.`);
    const links = externalLinks(t.html, ownHost);
    const max = Number(s.max_external_links);
    if (links.length > max) return fail(`Too many outside links: ${links.length}, maximum ${max}.`);

    // Duplicate of another post (same normalised text).
    const row = await d.query.posts.findFirst({ where: eq(posts.id, t.id), columns: { contentHash: true, submittedAt: true } });
    if (row?.contentHash) {
      const dup = await d.query.posts.findFirst({
        where: and(eq(posts.contentHash, row.contentHash), ne(posts.id, t.id), eq(posts.status, 'published')),
        columns: { id: true, slug: true },
      });
      if (dup) return fail('This text already exists on the site.');
    }

    // Daily limit by account age and role (24 h window, excluding this submission).
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [{ n }] = await d
      .select({ n: sql<number>`count(*)` })
      .from(posts)
      .where(and(eq(posts.authorId, t.authorId), gte(posts.submittedAt, since), ne(posts.id, t.id)));
    const ageH = (Date.now() - new Date(author.createdAt).getTime()) / 3600_000;
    const limit = hasRole(author, 'admin') ? 999 : hasRole(author, 'trusted') ? Number(s.posts_per_day_trusted) : ageH < 24 ? Number(s.posts_per_day_new) : Number(s.posts_per_day);
    if (Number(n) >= limit) return fail(`Daily limit reached (${limit} per day).`);
  } else {
    if (t.words < 1) return fail('Empty comment.');
    if (t.words > 400) return fail('Comments are limited to 400 words.');
    const links = externalLinks(t.html, ownHost);
    if (links.length > 1) return fail('Comments may contain at most one outside link.');
  }

  for (const re of BANNED_PATTERNS) {
    if (re.test(`${t.title}\n${t.text}`)) return fail('Contains spam patterns.');
  }

  return { step: 'rules', verdict: 'pass', reason: 'ok', provider: 'code', durationMs: Date.now() - started };
}
