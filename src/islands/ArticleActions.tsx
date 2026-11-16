/**
 * Save (bookmark), Share and Copy link for an article. Share uses the phone's share sheet when available,
 * otherwise copies the link.
 */
import { useEffect, useState } from 'preact/hooks';

export default function ArticleActions({ postId, title }: { postId: string; title: string }) {
  const [saved, setSaved] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch(`/api/bookmarks?postId=${encodeURIComponent(postId)}`, { credentials: 'same-origin' })
      .then((r) => r.json()).then((d) => { setSaved(!!d.saved); setSignedIn(!!d.signedIn); }).catch(() => setSignedIn(false));
  }, [postId]);

  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(''), 2500); };
  const url = () => location.origin + location.pathname;

  async function toggle() {
    if (signedIn === false) { location.href = `/signin/?next=${encodeURIComponent(location.pathname)}`; return; }
    const r = await fetch('/api/bookmarks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ postId }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return flash(d.error ?? 'Could not save.');
    setSaved(!!d.saved);
    flash(d.saved ? 'Saved to your list' : 'Removed from your list');
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url()); flash('Link copied'); } catch { flash(url()); }
  }
  async function share() {
    if (navigator.share) { try { await navigator.share({ title, url: url() }); } catch { /* cancelled */ } return; }
    copy();
  }

  const btn = 'inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-2 hover:border-accent';
  return (
    <span class="inline-flex flex-wrap items-center gap-2 font-sans text-sm">
      <button type="button" onClick={toggle} class={btn} aria-pressed={saved} title={signedIn === false ? 'Sign in to save' : saved ? 'Remove from saved' : 'Save for later'}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" aria-hidden="true" class={saved ? 'text-accent' : ''}><path d="M6 3h12v18l-6-4-6 4z" /></svg>
        {saved ? 'Saved' : 'Save'}
      </button>
      <button type="button" onClick={share} class={btn}>Share</button>
      <button type="button" onClick={copy} class={btn}>Copy link</button>
      {msg && <span class="text-xs text-muted" role="status">{msg}</span>}
    </span>
  );
}
