/**
 * Step 3: spam / topic / quality verdict from Workers AI as strict JSON.
 * The model id comes from settings (default gpt-oss-20b). gpt-oss models use the Responses-style input;
 * everything else uses chat messages. Either way the answer is parsed defensively.
 */
import { env } from 'cloudflare:workers';
import { getSetting } from '../db/settings';
import type { ModerationTarget, QualityResult, StepResult } from './types';
import { parseQuality } from './parse';
export { parseQuality } from './parse';

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['publish', 'reject', 'unsure'] },
    reason: { type: 'string' },
    quality_score: { type: 'integer', minimum: 0, maximum: 100 },
    suggested_tags: { type: 'array', items: { type: 'string' }, maxItems: 5 },
  },
  required: ['verdict', 'reason', 'quality_score'],
  additionalProperties: false,
};

export function buildPrompt(t: ModerationTarget): { instructions: string; input: string } {
  const instructions =
    t.kind === 'post'
      ? `You review submissions for an English-language technology blog. Judge only what is in the post. Return JSON matching the schema.
Rules:
- reject: advertising, affiliate link dumps, SEO spam, keyword stuffing, gibberish, non-technology topics, text that reads as copied from documentation or another article without added value.
- unsure: borderline quality, mixed topic, or you cannot tell.
- publish: a genuine article, tutorial, opinion or explainer about technology, software, hardware, data, security, careers in tech or related subjects.
quality_score: 0-100 for depth, originality, structure and usefulness to a developer. reason: one sentence, max 200 characters.`
      : `You review reader comments on a technology blog. Return JSON matching the schema.
- reject: spam, advertising, link dumps, gibberish, insults or harassment aimed at a person.
- unsure: borderline or you cannot tell.
- publish: an on-topic, civil comment, even if critical or short.
quality_score: 0-100 for relevance and civility. reason: one sentence.`;

  const body = t.text.split(/\s+/).slice(0, 1500).join(' ');
  const input = t.kind === 'post' ? `Title: ${t.title}\nTags: ${t.tags.join(', ')}\nBody (first 1,500 words):\n${body}` : `Comment on "${t.title}":\n${body}`;
  return { instructions, input };
}

function extractText(out: unknown): string {
  const o = out as { response?: unknown; output_text?: string; output?: { type?: string; content?: { type?: string; text?: string }[] }[] };
  if (typeof o.response === 'string') return o.response;
  if (o.response && typeof o.response === 'object') return JSON.stringify(o.response);
  if (typeof o.output_text === 'string') return o.output_text;
  if (Array.isArray(o.output)) {
    const parts: string[] = [];
    for (const item of o.output) if (item?.type === 'message') for (const c of item.content ?? []) if (typeof c.text === 'string') parts.push(c.text);
    return parts.join('\n');
  }
  return JSON.stringify(out);
}

export async function runQuality(t: ModerationTarget): Promise<StepResult & { quality?: QualityResult }> {
  const started = Date.now();
  const model = await getSetting('ai_quality_model');
  const { instructions, input } = buildPrompt(t);
  try {
    let out: unknown;
    if (/gpt-oss/.test(model)) {
      out = await env.AI.run(model as Parameters<typeof env.AI.run>[0], {
        instructions,
        input: `${input}\n\nRespond with JSON only, matching this schema: ${JSON.stringify(SCHEMA)}`,
        reasoning: { effort: 'low' },
        max_output_tokens: 400,
      } as never);
    } else {
      out = await env.AI.run(model as Parameters<typeof env.AI.run>[0], {
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: input },
        ],
        response_format: { type: 'json_schema', json_schema: SCHEMA },
        max_tokens: 400,
        temperature: 0.1,
      } as never);
    }
    const raw = extractText(out);
    const q = parseQuality(raw);
    if (!q) return { step: 'quality', verdict: 'unsure', reason: 'Model answer was not valid JSON.', provider: 'workers-ai', model, raw: raw.slice(0, 2000), durationMs: Date.now() - started };
    return { step: 'quality', verdict: q.verdict, reason: q.reason, provider: 'workers-ai', model, score: q.qualityScore, raw: raw.slice(0, 2000), durationMs: Date.now() - started, quality: q };
  } catch (e) {
    return { step: 'quality', verdict: 'unsure', reason: `Quality check unavailable: ${(e as Error).message.slice(0, 120)}`, provider: 'workers-ai', model, durationMs: Date.now() - started };
  }
}
