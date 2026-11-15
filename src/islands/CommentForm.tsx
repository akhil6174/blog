/**
 * Comment form island. Shows a sign-in prompt for anonymous readers; posts to /api/comments and reports the
 * moderation result (published within seconds, or held for review).
 */
import { useEffect, useState } from 'preact/hooks';

type Props = { postId: string; turnstileSiteKey?: string };

export default function CommentForm({ postId, turnstileSiteKey }: Props) {
  const [user, setUser] = useState<{ name: string } | null | undefined>(undefined);
  const [body, setBody] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/get-session', { credentials: 'same-origin' }).then((r) => r.json()).then((d) => setUser(d?.user ?? null)).catch(() => setUser(null));
    const onReply = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t.classList.contains('reply-btn')) {
        setParentId(t.dataset.id ?? null);
        document.getElementById('comment-body')?.focus();
      }
      if (t.classList.contains('report-comment')) {
        const reason = window.prompt('Why are you reporting this comment? (spam, abuse, off-topic, other)');
        if (!reason) return;
        fetch('/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ targetType: 'comment', targetId: t.dataset.id, reason }) })
          .then((r) => r.json()).then((d) => alert(d.error ?? 'Thanks, we will review it.')).catch(() => alert('Could not send the report.'));
      }
    };
    document.addEventListener('click', onReply);
    return () => document.removeEventListener('click', onReply);
  }, []);

  async function submit(e: Event) {
    e.preventDefault();
    if (busy || body.trim().length < 2) return;
    setBusy(true);
    setMsg('');
    try {
      const token = document.querySelector<HTMLInputElement>('#comment-form input[name="cf-turnstile-response"]')?.value ?? '';
      const res = await fetch('/api/comments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ postId, parentId, body, turnstileToken: token }) });
      const d = (await res.json()) as { status?: string; error?: string; html?: string; id?: string };
      if (!res.ok) {
        setMsg(d.error ?? 'Could not post.');
        return;
      }
      setBody('');
      setParentId(null);
      if (d.status === 'published') {
        setMsg('Posted.');
        // Refresh the comment list without reloading the article.
        const island = document.getElementById('comments')?.closest('astro-island, [data-island-id]') as HTMLElement | null;
        if (island && 'refresh' in island) (island as unknown as { refresh: () => void }).refresh();
        else location.reload();
      } else if (d.status === 'pending_review') setMsg('Thanks. Your comment is waiting for a quick review.');
      else if (d.status === 'rejected') setMsg('That comment did not pass our checks.');
      else setMsg('Thanks. Checking your comment…');
      // Cheap re-fetch after a moment so a published comment appears.
      setTimeout(() => location.reload(), d.status === 'published' ? 0 : 4000);
    } catch {
      setMsg('Network error.');
    } finally {
      setBusy(false);
      // @ts-expect-error turnstile global
      window.turnstile?.reset?.();
    }
  }

  if (user === undefined) return null;
  if (user === null) {
    return (
      <p class="mt-6 rounded-lg border border-line bg-surface p-4 font-sans text-sm text-muted">
        <a href={`/signin/?next=${encodeURIComponent(location.pathname)}`} class="font-semibold text-ink underline">Sign in</a> to comment. Comments are checked before they appear.
      </p>
    );
  }
  return (
    <form id="comment-form" onSubmit={submit} class="mt-6 grid gap-3 rounded-lg border border-line bg-surface p-4 font-sans">
      <label for="comment-body" class="text-sm font-semibold">
        {parentId ? (
          <>Replying to a comment · <button type="button" class="font-normal underline" onClick={() => setParentId(null)}>cancel</button></>
        ) : (
          <>Comment as {user.name}</>
        )}
      </label>
      <textarea id="comment-body" rows={3} maxLength={2000} value={body} onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)} class="rounded border border-line px-3 py-2 font-serif" placeholder="Be specific, be kind." required />
      {turnstileSiteKey && <div class="cf-turnstile" data-sitekey={turnstileSiteKey} data-size="compact" />}
      <div class="flex items-center gap-3">
        <button type="submit" disabled={busy} class="rounded bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-60">{busy ? 'Posting…' : 'Post comment'}</button>
        {msg && <span class="text-sm text-muted" role="status">{msg}</span>}
      </div>
    </form>
  );
}
