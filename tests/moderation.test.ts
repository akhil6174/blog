import { describe, expect, it } from 'vitest';
import { decide } from '../src/lib/moderation/decide';
import { parseQuality } from '../src/lib/moderation/parse';
import type { StepResult } from '../src/lib/moderation/types';

const pass = (step: StepResult['step']): StepResult => ({ step, verdict: 'pass', reason: 'ok' });
const opts = { words: 800, trusted: false, publishMin: 40, indexMin: 70, indexMinWords: 600, kind: 'post' as const };

describe('decide', () => {
  it('publishes and indexes a clean, good post', () => {
    const d = decide(pass('rules'), pass('harmful'), { step: 'quality', verdict: 'publish', reason: 'good', score: 82 }, opts);
    expect(d.status).toBe('published');
    expect(d.indexAllowed).toBe(true);
    expect(d.adsAllowed).toBe(false);
  });
  it('rejects on any hard failure, rules first', () => {
    const d = decide({ step: 'rules', verdict: 'reject', reason: 'too short' }, { step: 'harmful', verdict: 'reject', reason: 'hate' }, { step: 'quality', verdict: 'publish', reason: '', score: 90 }, opts);
    expect(d.status).toBe('rejected');
    expect(d.reason).toBe('too short');
  });
  it('holds low scores and unsure verdicts for review', () => {
    expect(decide(pass('rules'), pass('harmful'), { step: 'quality', verdict: 'publish', reason: 'meh', score: 30 }, opts).status).toBe('pending_review');
    expect(decide(pass('rules'), { step: 'harmful', verdict: 'unsure', reason: 'fallback failed' }, { step: 'quality', verdict: 'publish', reason: '', score: 80 }, opts).status).toBe('pending_review');
  });
  it('lets trusted writers publish on unsure but keeps noindex below threshold', () => {
    const d = decide(pass('rules'), pass('harmful'), { step: 'quality', verdict: 'unsure', reason: 'borderline', score: 55 }, { ...opts, trusted: true });
    expect(d.status).toBe('published');
    expect(d.indexAllowed).toBe(false);
  });
  it('never indexes short posts', () => {
    const d = decide(pass('rules'), pass('harmful'), { step: 'quality', verdict: 'publish', reason: '', score: 95 }, { ...opts, words: 350 });
    expect(d.indexAllowed).toBe(false);
  });
});

describe('parseQuality', () => {
  it('parses JSON embedded in prose and clamps the score', () => {
    const q = parseQuality('Sure! {"verdict":"publish","reason":"Solid tutorial","quality_score":140,"suggested_tags":["astro"]} thanks');
    expect(q).toEqual({ verdict: 'publish', reason: 'Solid tutorial', qualityScore: 100, suggestedTags: ['astro'] });
  });
  it('returns null for invalid verdicts or no JSON', () => {
    expect(parseQuality('{"verdict":"maybe","reason":"x","quality_score":5}')).toBeNull();
    expect(parseQuality('no json here')).toBeNull();
  });
});
