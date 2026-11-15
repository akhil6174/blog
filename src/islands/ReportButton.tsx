import { useState } from 'preact/hooks';

export default function ReportButton({ targetType, targetId }: { targetType: 'post' | 'comment'; targetId: string }) {
  const [done, setDone] = useState<string>('');
  async function report() {
    const reason = window.prompt('Why are you reporting this? (spam, copied content, harmful, off-topic, other)');
    if (!reason) return;
    try {
      const r = await fetch('/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetType, targetId, reason }) });
      const d = await r.json();
      setDone(d.error ?? 'Thanks, an editor will review it.');
    } catch {
      setDone('Could not send the report.');
    }
  }
  return (
    <span class="inline-flex items-center gap-2">
      <button type="button" onClick={report} class="text-muted underline hover:text-ink">Report</button>
      {done && <span class="text-xs text-muted" role="status">{done}</span>}
    </span>
  );
}
