/**
 * Step 2: harmful-content check.
 * Primary: OpenAI Moderation API (omni-moderation-latest), free, text + images.
 * Fallback: Workers AI Llama Guard 3 when OpenAI is not configured or fails (D-004).
 */
import { env } from 'cloudflare:workers';
import { getSetting } from '../db/settings';
import type { ModerationTarget, StepResult } from './types';

const OPENAI_URL = 'https://api.openai.com/v1/moderations';
const MAX_CHARS = 30_000;
const MAX_IMAGES = 5;

// Categories that block publication outright. Scores are 0..1; thresholds are deliberately conservative.
const BLOCK: Record<string, number> = {
  sexual: 0.5,
  'sexual/minors': 0.1,
  hate: 0.5,
  'hate/threatening': 0.3,
  harassment: 0.6,
  'harassment/threatening': 0.3,
  violence: 0.7,
  'violence/graphic': 0.6,
  'self-harm': 0.4,
  'self-harm/intent': 0.3,
  'self-harm/instructions': 0.3,
  illicit: 0.6,
  'illicit/violent': 0.4,
};

export async function runHarmful(t: ModerationTarget): Promise<StepResult> {
  const started = Date.now();
  const apiKey = (env as unknown as { OPENAI_API_KEY?: string }).OPENAI_API_KEY;
  const text = `${t.title}\n\n${t.text}`.slice(0, MAX_CHARS);

  if (apiKey) {
    try {
      const input: unknown[] = [{ type: 'text', text }];
      for (const url of t.images.slice(0, MAX_IMAGES)) input.push({ type: 'image_url', image_url: { url } });
      const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'omni-moderation-latest', input }),
      });
      if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = (await res.json()) as { results: { flagged: boolean; categories: Record<string, boolean>; category_scores: Record<string, number> }[] };
      const r = data.results?.[0];
      const hits = Object.entries(BLOCK).filter(([cat, th]) => (r?.category_scores?.[cat] ?? 0) >= th).map(([cat]) => cat);
      const raw = JSON.stringify({ flagged: r?.flagged, scores: r?.category_scores }).slice(0, 4000);
      if (hits.length) {
        return { step: 'harmful', verdict: 'reject', reason: `Flagged for ${hits.join(', ')}.`, provider: 'openai', model: 'omni-moderation-latest', raw, durationMs: Date.now() - started };
      }
      return { step: 'harmful', verdict: 'pass', reason: 'clean', provider: 'openai', model: 'omni-moderation-latest', raw, durationMs: Date.now() - started };
    } catch (e) {
      // fall through to Llama Guard
      console.warn('[moderation] openai failed, using fallback:', (e as Error).message);
    }
  }

  // Fallback: Llama Guard 3 (text only). Output is "safe" or "unsafe\nS<n>".
  const model = await getSetting('ai_safety_fallback_model');
  try {
    const out = (await env.AI.run(model as Parameters<typeof env.AI.run>[0], {
      messages: [{ role: 'user', content: text.slice(0, 12_000) }],
      max_tokens: 20,
    } as never)) as { response?: string };
    const answer = (out.response ?? '').trim().toLowerCase();
    const raw = answer.slice(0, 200);
    if (answer.startsWith('unsafe')) {
      return { step: 'harmful', verdict: 'reject', reason: `Flagged by safety model (${answer.replace(/\s+/g, ' ').slice(0, 20)}).`, provider: 'workers-ai', model, fallback: true, raw, durationMs: Date.now() - started };
    }
    if (answer.startsWith('safe')) {
      return { step: 'harmful', verdict: 'pass', reason: 'clean (fallback)', provider: 'workers-ai', model, fallback: true, raw, durationMs: Date.now() - started };
    }
    return { step: 'harmful', verdict: 'unsure', reason: 'Safety model gave an unexpected answer.', provider: 'workers-ai', model, fallback: true, raw, durationMs: Date.now() - started };
  } catch (e) {
    return { step: 'harmful', verdict: 'unsure', reason: `Safety check unavailable: ${(e as Error).message.slice(0, 120)}`, provider: 'workers-ai', model, fallback: true, durationMs: Date.now() - started };
  }
}
