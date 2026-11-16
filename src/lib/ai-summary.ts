/**
 * Prompt and post-processing for the AI summary (meta description). Pure, so it is unit-tested.
 */
export const SUMMARY_INSTRUCTIONS = `You write meta descriptions for articles on a technology blog.
Return JSON only: {"summary": "<text>"}.
Rules for the summary:
- 130 to 150 characters (hard limit 155), one or two complete plain sentences.
- Say what the reader will learn or be able to do, using the article's main topic words naturally.
- No quotes, emojis, hashtags, clickbait or exclamation marks.
- Do not start with "This article", "In this article", "Learn how" or "Discover".
- Use only facts present in the article.`;

export function summaryInput(title: string, text: string): string {
  const body = text.split(/\s+/).slice(0, 900).join(' ');
  return `Title: ${title || '(untitled)'}\n\nArticle:\n${body}`;
}

/** Extract the summary from the model's reply and make it safe to show: one line, no wrapping quotes, max 160 characters on a word boundary. */
export function cleanSummary(raw: string): string | null {
  let s = '';
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]) as { summary?: unknown };
      if (typeof j.summary === 'string') s = j.summary;
    } catch {
      /* fall through to plain text */
    }
  }
  if (!s) s = raw.replace(/^[^A-Za-z0-9]*summary[^A-Za-z0-9]*/i, '');
  s = s.replace(/\s+/g, ' ').trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  // Weak openers the prompt forbids but models sometimes use anyway.
  s = s.replace(/^(this (article|guide|post)|in this (article|guide|post),?|learn how to|learn how|discover how to|discover)\s+/i, '');
  if (s.length < 40) return null;
  if (s.length > 160) s = trimToSense(s, 160);
  s = dropDanglingEnd(s);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Shorten to `max` characters, preferring a complete sentence, then a clause break, then a word break. */
export function trimToSense(s: string, max: number): string {
  const head = s.slice(0, max);
  const sentence = head.match(/^[\s\S]*[.!?](?=\s|$)/);
  if (sentence && sentence[0].length >= 80) return sentence[0].trim();
  const clause = head.match(/^[\s\S]*[,;:](?=\s)/);
  if (clause && clause[0].length >= 100) return `${clause[0].slice(0, -1).trim()}.`;
  const words = head.slice(0, max - 1).replace(/\s+\S*$/, '').replace(/[,;:\-–]+$/, '');
  return /[.!?]$/.test(words) ? words : `${words}.`;
}

const DANGLING = /\s+(for|to|and|or|of|with|the|a|an|in|on|at|by|from|that|which|while|as|into|your)\.?$/i;

/** Remove words a cut-off sentence can end on ("…request handling for.") and close it with a full stop. */
export function dropDanglingEnd(s: string): string {
  let out = s.trim();
  let changed = false;
  while (DANGLING.test(out)) {
    out = out.replace(DANGLING, '');
    changed = true;
  }
  out = out.replace(/[,;:\-–]+$/, '');
  if (changed || !/[.!?]$/.test(out)) out = `${out.replace(/[.!?]$/, '')}.`;
  return out;
}
