/**
 * Raise (clap) button. Local counter up to 50 per person; one request after 1 s of inactivity with the delta (D-007).
 * Anonymous readers see the count and a sign-in hint. "Undo" takes all of your raises back.
 */
import { useEffect, useRef, useState } from 'preact/hooks';

const MAX = 50;

export default function RaiseButton({ postId, initial }: { postId: string; initial: number }) {
  const [total, setTotal] = useState(initial);
  const [mine, setMine] = useState(0);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [note, setNote] = useState('');
  const pending = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    fetch(`/api/raise?postId=${encodeURIComponent(postId)}`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => { setTotal(d.total ?? initial); setMine(d.mine ?? 0); setSignedIn(!!d.signedIn); })
      .catch(() => setSignedIn(false));
  }, [postId]);

  function flush() {
    const delta = pending.current;
    pending.current = 0;
    if (!delta) return;
    fetch('/api/raise', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ postId, delta }) })
      .then((r) => r.json())
      .then((d) => { if (typeof d.total === 'number') setTotal(d.total); if (typeof d.mine === 'number') setMine(d.mine); if (d.error) { setNote(d.error); setMine((m) => Math.max(0, m - delta)); setTotal((t) => Math.max(0, t - delta)); } })
      .catch(() => {});
  }

  function undo() {
    window.clearTimeout(timer.current);
    pending.current = 0;
    fetch('/api/raise', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ postId }) })
      .then((r) => r.json())
      .then((d) => { if (typeof d.total === 'number') setTotal(d.total); setMine(0); })
      .catch(() => {});
  }

  function click() {
    if (signedIn === false) { location.href = `/signin/?next=${encodeURIComponent(location.pathname)}`; return; }
    if (mine >= MAX) return;
    setMine((m) => m + 1);
    setTotal((t) => t + 1);
    pending.current += 1;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 1000);
  }

  return (
    <span class="inline-flex items-center gap-2">
    <button type="button" onClick={click} aria-label={`Raise this article, ${total} raises so far`} title={signedIn === false ? 'Sign in to raise' : mine >= MAX ? 'You reached the maximum of 50' : 'Raise'} class="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 font-sans text-sm hover:border-accent">
      <svg width="18" height="18" viewBox="0 0 24 24" fill={mine > 0 ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" aria-hidden="true" class={mine > 0 ? 'text-accent' : ''}><path d="M12 4l7 8h-4v8H9v-8H5z" /></svg>
      <span>{total}</span>
      {mine > 0 && <span class="text-xs text-muted">+{mine}</span>}
    </button>
    {mine > 0 && <button type="button" onClick={undo} class="font-sans text-xs text-muted underline hover:text-ink">Undo</button>}
    {note && <span class="font-sans text-xs text-muted" role="status">{note}</span>}
    </span>
  );
}
