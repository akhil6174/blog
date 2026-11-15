export type Verdict = 'publish' | 'reject' | 'unsure';

export type StepResult = {
  step: 'rules' | 'harmful' | 'quality' | 'decide' | 'finalize';
  verdict: 'pass' | Verdict | 'error';
  reason: string;
  provider?: 'code' | 'openai' | 'workers-ai';
  model?: string;
  score?: number | null;
  fallback?: boolean;
  raw?: string;
  durationMs?: number;
};

export type QualityResult = {
  verdict: Verdict;
  reason: string;
  qualityScore: number;
  suggestedTags: string[];
};

export type ModerationTarget = {
  kind: 'post' | 'comment';
  id: string;
  title: string;
  text: string;
  html: string;
  tags: string[];
  images: string[];
  words: number;
  authorId: string;
};
