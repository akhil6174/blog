/**
 * Student tool usage counting (D-049). Pure: the list of tools and actions, plus the browser helper that reports an
 * event. Counts are anonymous (no user, IP or device stored): one number per India-time day, tool and action.
 */
export const USAGE_TOOLS = {
  'resume-builder': { name: 'Resume builder', actions: ['view', 'use', 'download'] },
  'portfolio-builder': { name: 'Portfolio builder', actions: ['view', 'use', 'download_zip', 'download_html'] },
  'dsa-sheet': { name: 'DSA sheet', actions: ['view', 'use', 'solve'] },
  'attendance-calculator': { name: 'Attendance calculator', actions: ['view', 'use'] },
  'cgpa-calculator': { name: 'SGPA and CGPA calculator', actions: ['view', 'use'] },
  'cgpa-to-percentage': { name: 'CGPA to percentage', actions: ['view', 'use'] },
} as const;

export type UsageTool = keyof typeof USAGE_TOOLS;
export const ACTION_LABELS: Record<string, string> = {
  view: 'Visits', use: 'Used', download: 'PDF downloads', download_zip: 'Zip downloads', download_html: 'HTML downloads', solve: 'Problems ticked',
};

export function isUsageEvent(tool: unknown, action: unknown): tool is UsageTool {
  return typeof tool === 'string' && tool in USAGE_TOOLS && typeof action === 'string' && (USAGE_TOOLS[tool as UsageTool].actions as readonly string[]).includes(action);
}

/** Browser: report one event. Never throws and never delays the page. */
export function track(tool: UsageTool, action: string): void {
  try {
    const body = JSON.stringify({ tool, action });
    if (navigator.sendBeacon?.('/api/track', new Blob([body], { type: 'application/json' }))) return;
    void fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* ignore */ }
}

const sent = new Set<string>();
/** Browser: report an event at most once per page visit. */
export function trackOnce(tool: UsageTool, action: string): void {
  const k = `${tool}:${action}`;
  if (sent.has(k)) return;
  sent.add(k);
  track(tool, action);
}

/** India-time day "YYYY-MM-DD". */
export const istDayKey = (d = new Date()) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
