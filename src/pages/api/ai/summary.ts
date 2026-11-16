/**
 * POST /api/ai/summary { title, text } -> { summary, basis }
 * Generates an SEO meta description with the Workers AI model from settings. Signed-in writers only,
 * 30 generations per writer per day (about 45 neurons each, so moderation always keeps its budget).
 */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { hasRole } from '../../../lib/auth';
import { getSetting } from '../../../lib/db/settings';
import { todayUTC } from '../../../lib/content';
import { basisOf } from '../../../lib/fingerprint';
import { cleanSummary, SUMMARY_INSTRUCTIONS, summaryInput } from '../../../lib/ai-summary';
import { extractText } from '../../../lib/moderation/quality';

export const prerender = false;
const DAILY = 30;
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Please sign in.' }, 401);
  if (!hasRole(user, 'writer')) return json({ error: 'Your account cannot use the writing tools yet.' }, 403);
  const parsed = z.object({ title: z.string().max(200).default(''), text: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Write some of the article first.' }, 400);
  const { title, text } = parsed.data;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words < 80) return json({ error: `Write at least 80 words first (now ${words}) so the summary has something to describe.` }, 400);

  const admin = hasRole(user, 'admin');
  const key = `ai-summary:${user.id}:${todayUTC()}`;
  const used = Number((await env.CACHE.get(key)) ?? 0);
  if (!admin && used >= DAILY) return json({ error: `Daily limit reached (${DAILY} summaries). You can still write it yourself.` }, 429);

  const model = await getSetting('ai_quality_model');
  try {
    const input = summaryInput(title, text);
    // gpt-oss spends part of its output budget on hidden reasoning, so the budget must be generous;
    // one retry covers the occasional empty or unusable answer.
    let summary: string | null = null;
    let raw = '';
    for (let attempt = 0; attempt < 2 && !summary; attempt++) {
      const out = /gpt-oss/.test(model)
        ? await env.AI.run(model as Parameters<typeof env.AI.run>[0], { instructions: SUMMARY_INSTRUCTIONS, input, reasoning: { effort: 'low' }, max_output_tokens: 900 } as never)
        : await env.AI.run(model as Parameters<typeof env.AI.run>[0], { messages: [{ role: 'system', content: SUMMARY_INSTRUCTIONS }, { role: 'user', content: input }], max_tokens: 250, temperature: 0.3 } as never);
      raw = extractText(out);
      summary = cleanSummary(raw);
    }
    if (!summary) {
      console.error('[ai-summary] unusable answer:', raw.slice(0, 300));
      return json({ error: 'The AI did not return a usable summary. Try again or write it yourself.' }, 502);
    }
    if (!admin) await env.CACHE.put(key, String(used + 1), { expirationTtl: 2 * 86400 });
    return json({ summary, basis: basisOf(text), model });
  } catch (e) {
    console.error('[ai-summary]', (e as Error).message);
    return json({ error: 'The AI service is unavailable right now. Try again in a minute or write the summary yourself.' }, 503);
  }
};
