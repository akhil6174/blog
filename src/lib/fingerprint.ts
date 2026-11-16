/**
 * Sentence fingerprints: a compact record of which sentences an AI summary was based on.
 * Used to tell when an article has changed enough (default 30 %) that its summary should be refreshed.
 * Pure functions, shared by the browser and the server.
 */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function sentenceHashes(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.split(/(?<=[.!?])\s+|\n+/)) {
    const norm = raw.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (norm.split(' ').length < 4) continue;
    out.add(fnv1a(norm));
    if (out.size >= 400) break;
  }
  return [...out];
}

export function basisOf(text: string): string {
  return sentenceHashes(text).join(',');
}

/** 0 = same sentences, 1 = entirely different. */
export function changedFraction(basis: string | null | undefined, text: string): number {
  const old = (basis ?? '').split(',').filter(Boolean);
  const now = sentenceHashes(text);
  if (old.length === 0) return 1;
  const set = new Set(old);
  const kept = now.filter((h) => set.has(h)).length;
  return 1 - kept / Math.max(old.length, now.length, 1);
}

export const SUMMARY_MIN = 120;
export const SUMMARY_IDEAL_MAX = 160;
export const SEO_TITLE_MAX = 60;
