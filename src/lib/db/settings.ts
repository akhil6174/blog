/**
 * Runtime settings stored in D1 (`settings` table), editable from /admin without a redeploy.
 * Defaults live here so the site works on an empty table. Reads are cached per isolate for 60 s.
 */
import { eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { db, settings } from './index';

export const SETTING_DEFAULTS = {
  community_open: 'false', // community publishing visible to the public
  submissions_open: 'true', // emergency switch: false = nobody can submit community articles
  comments_open: 'true', // emergency switch: false = no new comments anywhere
  community_invite_only: 'true', // while false/true: only users with role >= writer who were invited can write (Phase 3 testing)
  ai_quality_model: env.AI_MODEL_DEFAULT || '@cf/openai/gpt-oss-20b',
  ai_safety_fallback_model: env.AI_SAFETY_FALLBACK_MODEL || '@cf/meta/llama-guard-3-8b',
  min_words: '600', // AdSense thin-content guard; there is no maximum
  max_external_links: '5',
  quality_publish_min: '40', // below this -> pending_review
  quality_index_min: '70', // index_allowed when >= this and words >= index_min_words
  index_min_words: '600',
  posts_per_day_new: '1', // accounts younger than 24 h
  posts_per_day: '3',
  posts_per_day_trusted: '10',
  reports_to_hide: '3',
  views_sample_threshold: '20000',
  invited_emails: '', // comma-separated; these become writers on first sign-in even when invite-only
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

type Cache = { at: number; values: Record<string, string> };
let cache: Cache | undefined;
const TTL = 60_000;

export async function getSettings(): Promise<Record<SettingKey, string>> {
  if (cache && Date.now() - cache.at < TTL) return cache.values as Record<SettingKey, string>;
  const rows = await db().select().from(settings);
  const values: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const r of rows) values[r.key] = r.value;
  cache = { at: Date.now(), values };
  return values as Record<SettingKey, string>;
}

export async function getSetting(key: SettingKey): Promise<string> {
  return (await getSettings())[key];
}

export async function getSettingBool(key: SettingKey): Promise<boolean> {
  return (await getSetting(key)) === 'true';
}

export async function getSettingInt(key: SettingKey): Promise<number> {
  return Number.parseInt(await getSetting(key), 10);
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await db()
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  cache = undefined;
}

export function invalidateSettingsCache() {
  cache = undefined;
}

export const SETTING_HELP: Record<SettingKey, string> = {
  community_open: 'true = community posts are public, listed and linked. false = only the admin and the author can see them.',
  submissions_open: 'Emergency switch. false = writers can keep drafting, but nobody can submit articles for review.',
  comments_open: 'Emergency switch. false = no new comments on any article; existing comments stay visible.',
  community_invite_only: 'true = only users the admin promoted to writer can open /write. false = anyone signed in can write.',
  ai_quality_model: 'Workers AI model id for the spam/quality check. Change here when Cloudflare deprecates a model.',
  ai_safety_fallback_model: 'Workers AI model used for the harmful-content check only if OpenAI fails.',
  min_words: 'Minimum words before an article can be submitted (600 keeps every article long enough for AdSense and for indexing). There is no maximum.',
  max_external_links: 'Maximum outside links in a community post.',
  quality_publish_min: 'Quality score below this goes to the review queue instead of publishing.',
  quality_index_min: 'Quality score at or above this (and enough words) makes a community post indexable.',
  index_min_words: 'Minimum words for a community post to be indexable.',
  posts_per_day_new: 'Posts per day for accounts younger than 24 hours.',
  posts_per_day: 'Posts per day for writers.',
  posts_per_day_trusted: 'Posts per day for trusted writers.',
  reports_to_hide: 'Distinct reports that hide a post or comment until reviewed.',
  views_sample_threshold: 'Daily views above which the view beacon samples 1 in 5.',
  invited_emails: 'Comma-separated emails that become writers on first sign-in while writing is invite-only.',
};
