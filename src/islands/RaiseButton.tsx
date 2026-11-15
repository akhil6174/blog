/**
 * Raise (clap) button. Local counter up to 50 per person; one request after 1 s of inactivity with the delta (D-007).
 * Anonymous readers see the count and a sign-in hint.
 */
import { useEffect, useRef, useState } from 'preact/hooks';

const MAX = 50;

export default function RaiseButton({ postId, initial }: { postId: string; initial: number }) {
  const [total, setTotal] = useState(initial);
  const [mine, setMine] = useState(0);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
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
      .then((d) => { if (typeof d.total === 'number') setTotal(d.total); if (typeof d.mine === 'number') setMine(d.mine); })
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
    <button type="button" onClick={click} aria-label={`Raise this article, ${total} raises so far`} title={signedIn === false ? 'Sign in to raise' : mine >= MAX ? 'You reached the maximum of 50' : 'Raise'} class="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 font-sans text-sm hover:border-accent">
      <svg width="18" height="18" viewBox="0 0 24 24" fill={mine > 0 ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" aria-hidden="true" class={mine > 0 ? 'text-accent' : ''}><path d="M12 4l7 8h-4v8H9v-8H5z" /></svg>
      <span>{total}</span>
      {mine > 0 && <span class="text-xs text-muted">+{mine}</span>}
    </button>
  );
}
