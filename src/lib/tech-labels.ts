/**
 * Labels shared by server and browser code (no zod here, so islands stay small).
 */
export const DIFFICULTIES = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
] as const;

export const difficultyLabel = (v?: string) => DIFFICULTIES.find((d) => d.value === v)?.label;

/** Reasons a reader can pick in "Report a problem". The technical ones never hide an article automatically. */
export const REPORT_REASONS = [
  { value: 'broken-code', label: 'Code does not work', technical: true },
  { value: 'outdated', label: 'Outdated instructions', technical: true },
  { value: 'incorrect', label: 'Incorrect explanation', technical: true },
  { value: 'broken-link', label: 'Broken link or repository', technical: true },
  { value: 'spam', label: 'Spam or advertising', technical: false },
  { value: 'copied', label: 'Copied content', technical: false },
  { value: 'harmful', label: 'Harmful or abusive', technical: false },
  { value: 'other', label: 'Something else', technical: false },
] as const;
export const isTechnicalReason = (r: string) => REPORT_REASONS.some((x) => x.value === r && x.technical);
export const reasonLabel = (r: string) => REPORT_REASONS.find((x) => x.value === r)?.label ?? r;
