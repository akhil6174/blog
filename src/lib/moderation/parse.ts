/**
 * Pure parser for the model's JSON verdict (no runtime imports, so it is unit-testable in Node).
 */
import type { QualityResult } from './types';

export function parseQuality(raw: string): QualityResult | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Partial<{ verdict: string; reason: string; quality_score: number; suggested_tags: string[] }>;
    const verdict = j.verdict === 'publish' || j.verdict === 'reject' || j.verdict === 'unsure' ? j.verdict : null;
    if (!verdict) return null;
    const score = Number.isFinite(Number(j.quality_score)) ? Math.max(0, Math.min(100, Math.round(Number(j.quality_score)))) : 50;
    return { verdict, reason: String(j.reason ?? '').slice(0, 200), qualityScore: score, suggestedTags: Array.isArray(j.suggested_tags) ? j.suggested_tags.map(String).slice(0, 5) : [] };
  } catch {
    return null;
  }
}

