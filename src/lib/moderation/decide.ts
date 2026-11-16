/**
 * Step 4: combine the three checks into a status (plan, Part 5, "Decide").
 */
import type { StepResult } from './types';

export type Decision = {
  /** changes_requested is only set by an editor (never by the automatic checks). */
  status: 'published' | 'rejected' | 'pending_review' | 'changes_requested';
  reason: string;
  qualityScore: number | null;
  indexAllowed: boolean;
  adsAllowed: boolean;
};

export function decide(
  rules: StepResult,
  harmful: StepResult,
  quality: StepResult,
  opts: { words: number; trusted: boolean; publishMin: number; indexMin: number; indexMinWords: number; kind: 'post' | 'comment' },
): Decision {
  const score = typeof quality.score === 'number' ? quality.score : null;
  const indexAllowed = opts.kind === 'post' && score !== null && score >= opts.indexMin && opts.words >= opts.indexMinWords;

  if (rules.verdict === 'reject') return { status: 'rejected', reason: rules.reason, qualityScore: score, indexAllowed: false, adsAllowed: false };
  if (harmful.verdict === 'reject') return { status: 'rejected', reason: harmful.reason, qualityScore: score, indexAllowed: false, adsAllowed: false };
  if (quality.verdict === 'reject') return { status: 'rejected', reason: quality.reason, qualityScore: score, indexAllowed: false, adsAllowed: false };

  const unsure = harmful.verdict === 'unsure' || quality.verdict === 'unsure' || (score !== null && score < opts.publishMin);
  if (unsure && !opts.trusted) {
    return { status: 'pending_review', reason: [harmful.verdict === 'unsure' ? harmful.reason : '', quality.verdict === 'unsure' ? quality.reason : '', score !== null && score < opts.publishMin ? `Quality score ${score} below ${opts.publishMin}.` : ''].filter(Boolean).join(' '), qualityScore: score, indexAllowed: false, adsAllowed: false };
  }
  // Trusted writers publish on "unsure" (flagged in the log for later review). Ads stay off until Phase 4 rules.
  return { status: 'published', reason: unsure ? `Published for trusted writer despite: ${quality.reason}` : quality.reason || 'ok', qualityScore: score, indexAllowed, adsAllowed: false };
}
