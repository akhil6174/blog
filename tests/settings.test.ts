import { describe, expect, it } from 'vitest';
import { basisOf, changedFraction, sentenceHashes } from '../src/lib/fingerprint';
import { cleanSummary } from '../src/lib/ai-summary';
import { slugify, slugTyping } from '../src/lib/slug';

const article = `Cloudflare Workers serve static assets for free. Only requests that run code count toward the daily limit.
Astro pre-renders every editorial page to a file. Community pages are rendered on demand and cached at the edge for ten minutes.
The moderation pipeline runs five durable steps for every submission.`;

describe('fingerprint', () => {
  it('ignores very short fragments and is stable', () => {
    expect(sentenceHashes('Hi. Ok then.')).toEqual([]);
    expect(basisOf(article)).toBe(basisOf(article));
  });
  it('reports small edits as small and rewrites as large', () => {
    const basis = basisOf(article);
    expect(changedFraction(basis, article)).toBe(0);
    expect(changedFraction(basis, article.replace('ten minutes', '10 minutes'))).toBeLessThan(0.3);
    expect(changedFraction(basis, 'A completely different article about Python packaging tools and virtual environments today.')).toBeGreaterThan(0.9);
    expect(changedFraction('', article)).toBe(1);
  });
});

describe('cleanSummary', () => {
  it('reads JSON, strips quotes and a weak opener', () => {
    expect(cleanSummary('{"summary": "\\"This article explains how Cloudflare Workers serve static files for free and which requests count toward the daily limit.\\""}'))
      .toBe('Explains how Cloudflare Workers serve static files for free and which requests count toward the daily limit.');
  });
  it('cuts long text on a word boundary under 160 characters', () => {
    const long = 'Deploy an Astro blog on Cloudflare Workers with D1 and KV, keep pages static, cache community posts at the edge, and moderate every submission with a five step durable workflow that never loses work.';
    const s = cleanSummary(JSON.stringify({ summary: long }))!;
    expect(s.length).toBeLessThanOrEqual(160);
    expect(s.endsWith('.')).toBe(true);
    expect(long.startsWith(s.slice(0, -1))).toBe(true);
    // prefers a clause break over cutting mid-phrase
    expect(s).toBe('Deploy an Astro blog on Cloudflare Workers with D1 and KV, keep pages static, cache community posts at the edge.');
  });
  it('keeps the first complete sentence when two are too long together', () => {
    const two = 'Cloudflare Workers serve static files for free and only code requests count toward the daily limit. This guide also covers D1 queries, KV caching and the moderation workflow.';
    expect(cleanSummary(JSON.stringify({ summary: two }))).toBe('Cloudflare Workers serve static files for free and only code requests count toward the daily limit.');
  });
  it('removes a forbidden opener and a dangling ending', () => {
    expect(cleanSummary('{"summary":"Learn how Cloudflare Workers serve static assets for free while only code requests count toward the limit and how to optimize request handling for."}'))
      .toBe('Cloudflare Workers serve static assets for free while only code requests count toward the limit and how to optimize request handling.');
    expect(cleanSummary('{"summary":"Deploy Astro to Cloudflare Workers and keep every editorial page static so it costs nothing to serve"}'))
      .toBe('Deploy Astro to Cloudflare Workers and keep every editorial page static so it costs nothing to serve.');
  });
  it('rejects empty or tiny answers', () => {
    expect(cleanSummary('{"summary":"ok"}')).toBeNull();
    expect(cleanSummary('')).toBeNull();
  });
});

describe('slug', () => {
  it('matches between title-derived and typed slugs', () => {
    expect(slugify('Deploying Astro on Cloudflare: Step-by-Step (2026)')).toBe('deploying-astro-on-cloudflare-step-by-step-2026');
    expect(slugify('Café déjà vu')).toBe('cafe-deja-vu');
    expect(slugify('!!!')).toBe('post');
    expect(slugTyping('My New  URL!')).toBe('my-new-url-');
  });
});
