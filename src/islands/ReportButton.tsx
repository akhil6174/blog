/**
 * "Report a problem": readers pick a reason (technical problems first) and can add details.
 * Technical reports go to the author and editor; abuse reports can hide the item after several reports.
 */
import { useState } from 'preact/hooks';
import { REPORT_REASONS } from '../lib/tech-labels';

export default function ReportButton({ targetType, targetId, label = 'Report a problem' }: { targetType: 'post' | 'comment'; targetId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const reasons = targetType === 'comment' ? REPORT_REASONS.filter((r) => !r.technical) : REPORT_REASONS;

  async function send(e: Event) {
    e.preventDefault();
    if (!reason) return;
    setBusy(true);
    try {
      const r = await fetch('/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetType, targetId, reason, note: note.trim() || undefined }) });
      const d = (await r.json()) as { error?: string; message?: string };
      setDone(d.error ?? d.message ?? 'Thanks, an editor will review it.');
      setOpen(false);
    } catch {
      setDone('Could not send the report.');
    } finally {
      setBusy(false);
    }
  }

  if (done) return <span class="text-xs text-muted" role="status">{done}</span>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} class="text-muted underline hover:text-ink">{targetType === 'comment' ? 'Report' : label}</button>;
  return (
    <form onSubmit={send} class="grid w-full max-w-md gap-2 rounded-lg border border-line bg-surface p-3 font-sans text-sm" aria-label="Report a problem">
      <fieldset class="grid gap-1">
        <legend class="mb-1 font-semibold">What is wrong?</legend>
        {reasons.map((r) => (
          <label class="flex items-center gap-2">
            <input type="radio" name={`reason-${targetId}`} value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} class="accent-[var(--color-accent)]" />
            {r.label}
          </label>
        ))}
      </fieldset>
      <textarea value={note} maxLength={1000} rows={3} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} class="rounded border border-line bg-page px-2 py-1.5" placeholder="Details help: which step, the error message, your versions (optional)" aria-label="Details" />
      <div class="flex gap-2">
        <button type="submit" disabled={!reason || busy} class="rounded bg-accent px-3 py-1.5 font-semibold text-white disabled:opacity-60">{busy ? 'Sending…' : 'Send report'}</button>
        <button type="button" onClick={() => setOpen(false)} class="rounded border border-line px-3 py-1.5">Cancel</button>
      </div>
    </form>
  );
}
