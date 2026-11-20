/**
 * The DSA sheet with tracking (D-042). Signed out: progress lives in this browser (localStorage). Signed in:
 * progress is saved to the account (/api/me/dsa) and anything saved on the device is merged in once.
 * Shows overall and per-difficulty progress, streaks, weekly solves, badges and filters. Data and maths:
 * src/lib/dsa-sheet.ts.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { badges, PROBLEMS, type Problem, type Progress, streaks, summarize, TOPICS, topicSlug, weeklySolves } from '../../lib/dsa-sheet';

type Map_ = Record<string, { solvedAt: number | null; revise: boolean }>;
const KEY = 'trutiai-dsa-v1';
const DIFF_CLS = { Easy: 'text-emerald-700', Medium: 'text-amber-700', Hard: 'text-red-700' } as const;

const readLocal = (): Map_ => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; } };
const writeLocal = (m: Map_) => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* storage full or blocked */ } };
const toList = (m: Map_): Progress[] => Object.entries(m).map(([id, v]) => ({ id, solvedAt: v.solvedAt, revise: v.revise }));
const post = (body: unknown) => fetch('/api/me/dsa', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function Ring({ done, total }: { done: number; total: number }) {
  const r = 42, c = 2 * Math.PI * r, f = total ? done / total : 0;
  return (
    <svg viewBox="0 0 100 100" width="112" height="112" role="img" aria-label={`${done} of ${total} solved`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-line)" stroke-width="9" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-accent)" stroke-width="9" stroke-linecap="round" stroke-dasharray={`${c * f} ${c}`} transform="rotate(-90 50 50)" />
      <text x="50" y="48" text-anchor="middle" font-size="20" font-weight="700" fill="var(--color-ink)">{done}</text>
      <text x="50" y="65" text-anchor="middle" font-size="10" fill="var(--color-muted)">of {total}</text>
    </svg>
  );
}

function Bar({ done, total, label }: { done: number; total: number; label?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div class="h-2 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div class="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Weekly({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 360, h = 120, bw = w / data.length;
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h + 18}`} class="w-full" role="img" aria-label="Problems solved per week, last 12 weeks">
        {data.map((d, i) => {
          const bh = (d.value / max) * h;
          return (
            <g key={i}>
              <rect x={i * bw + 3} y={h - bh} width={bw - 6} height={Math.max(bh, d.value ? 2 : 0)} rx="3" fill={i === data.length - 1 ? 'var(--color-accent)' : 'var(--color-tint-strong)'} />
              {d.value > 0 && <text x={i * bw + bw / 2} y={h - bh - 3} text-anchor="middle" font-size="9" fill="var(--color-muted)">{d.value}</text>}
              {i % 3 === 0 && <text x={i * bw + bw / 2} y={h + 13} text-anchor="middle" font-size="9" fill="var(--color-muted)">{d.label}</text>}
            </g>
          );
        })}
        <line x1="0" x2={w} y1={h} y2={h} stroke="var(--color-line)" />
      </svg>
    </figure>
  );
}

export default function DsaSheet() {
  const [prog, setProg] = useState<Map_>({});
  const [mode, setMode] = useState<'loading' | 'local' | 'account'>('loading');
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState('all');
  const [diff, setDiff] = useState('all');
  const [status, setStatus] = useState<'all' | 'todo' | 'solved' | 'revise'>('all');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const u = new URLSearchParams(location.search);
    const t = TOPICS.find((x) => topicSlug(x) === u.get('topic'));
    if (t) setTopic(t);
    (async () => {
      const local = readLocal();
      try {
        const r = await fetch('/api/me/dsa', { credentials: 'same-origin' });
        if (r.status === 401) { setProg(local); setMode('local'); return; }
        if (!r.ok) throw new Error();
        let d = await r.json();
        if (Object.keys(local).length) {
          const m = await post({ action: 'merge', items: toList(local) });
          if (m.ok) {
            const { added } = await m.json();
            try { localStorage.removeItem(KEY); } catch { /* ignore */ }
            if (added) { setMsg(`Added ${added} problem${added === 1 ? '' : 's'} from this device to your account.`); d = await (await fetch('/api/me/dsa')).json(); }
          }
        }
        setProg(Object.fromEntries((d.progress as Progress[]).map((p) => [p.id, { solvedAt: p.solvedAt, revise: p.revise }])));
        setMode('account');
      } catch {
        setProg(local);
        setMode('local');
      }
    })();
  }, []);

  const list = useMemo(() => toList(prog), [prog]);
  const solvedIds = useMemo(() => new Set(list.filter((p) => p.solvedAt).map((p) => p.id)), [list]);
  const sum = useMemo(() => summarize(solvedIds), [solvedIds]);
  const st = useMemo(() => streaks(list.filter((p) => p.solvedAt).map((p) => p.solvedAt!)), [list]);
  const weeks = useMemo(() => weeklySolves(list.filter((p) => p.solvedAt).map((p) => p.solvedAt!)), [list]);
  const bs = useMemo(() => badges(list), [list]);
  const reviseCount = list.filter((p) => p.revise).length;

  async function change(id: string, field: 'solved' | 'revise') {
    const cur = prog[id] ?? { solvedAt: null, revise: false };
    const next = field === 'solved' ? { ...cur, solvedAt: cur.solvedAt ? null : Date.now() } : { ...cur, revise: !cur.revise };
    const updated = { ...prog };
    if (!next.solvedAt && !next.revise) delete updated[id]; else updated[id] = next;
    setProg(updated);
    if (mode !== 'account') { writeLocal(updated); return; }
    const r = await post({ action: 'set', id, [field]: field === 'solved' ? !!next.solvedAt : next.revise }).catch(() => null);
    if (!r?.ok) { setProg(prog); setMsg('Could not save. Check your connection and try again.'); }
  }

  const match = (p: Problem) => {
    const s = prog[p.id];
    if (topic !== 'all' && p.topic !== topic) return false;
    if (diff !== 'all' && p.difficulty !== diff) return false;
    if (status === 'solved' && !s?.solvedAt) return false;
    if (status === 'todo' && s?.solvedAt) return false;
    if (status === 'revise' && !s?.revise) return false;
    if (q && !p.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  };

  // A plain function (not a component) so rows keep focus and state across re-renders.
  function row(p: Problem) {
    const s = prog[p.id];
    return (
      <li key={p.id} class="border-b border-line py-2.5 last:border-0" data-id={p.id}>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <input type="checkbox" class="h-5 w-5 shrink-0 accent-[var(--color-accent)]" checked={!!s?.solvedAt} onChange={() => change(p.id, 'solved')} aria-label={`Mark ${p.title} solved`} data-testid="solve" />
          <a href={p.url} target="_blank" rel="noopener" class={`min-w-0 flex-1 font-medium hover:text-accent hover:underline ${s?.solvedAt ? 'text-muted line-through decoration-1' : 'text-ink'}`}>{p.title}</a>
          <span class={`w-16 text-xs font-semibold ${DIFF_CLS[p.difficulty]}`}>{p.difficulty}</span>
          <button type="button" class={`rounded px-1.5 text-lg leading-none ${s?.revise ? 'text-amber-500' : 'text-muted hover:text-ink'}`} aria-pressed={!!s?.revise} aria-label={`${s?.revise ? 'Remove' : 'Add'} ${p.title} ${s?.revise ? 'from' : 'to'} revision`} title="Revise later" onClick={() => change(p.id, 'revise')} data-testid="revise">{s?.revise ? '★' : '☆'}</button>
        </div>
      </li>
    );
  }

  const earned = bs.filter((b) => b.earned).length;

  return (
    <div class="font-sans" data-mode={mode}>
      <section class="grid gap-4 rounded-2xl border border-line bg-surface p-5 md:grid-cols-[auto_1fr_1fr]" aria-label="Your progress">
        <div class="flex items-center gap-4">
          <Ring done={sum.done} total={sum.total} />
          <div class="text-sm">
            <p class="font-semibold">Solved</p>
            <p class="text-muted">{reviseCount} to revise</p>
            <p class="text-muted"><a href="#badges" class="underline">{earned} badge{earned === 1 ? '' : 's'}</a></p>
          </div>
        </div>
        <div class="grid content-center gap-3 text-sm">
          {sum.byDifficulty.map((d) => (
            <div>
              <div class="mb-1 flex justify-between"><span class={`font-semibold ${DIFF_CLS[d.difficulty]}`}>{d.difficulty}</span><span class="tabular-nums text-muted">{d.done}/{d.total}</span></div>
              <Bar done={d.done} total={d.total} label={`${d.difficulty} progress`} />
            </div>
          ))}
        </div>
        <div class="grid grid-cols-2 content-center gap-3 text-center">
          <div class="rounded-xl bg-tint p-3"><p class="text-2xl font-bold tabular-nums" data-testid="streak">{st.current}</p><p class="text-xs text-muted">day streak</p></div>
          <div class="rounded-xl bg-tint p-3"><p class="text-2xl font-bold tabular-nums">{st.best}</p><p class="text-xs text-muted">best streak</p></div>
        </div>
      </section>

      {mode === 'local' && (
        <p class="mt-3 rounded-lg border border-line bg-tint px-4 py-3 text-sm">
          Your ticks are saved in this browser only. <a href={`/signin/?next=${encodeURIComponent('/students/dsa-sheet/')}`} class="font-semibold text-accent underline">Sign in</a> to keep them on every device, and see charts on your dashboard.
        </p>
      )}
      <p class="mt-2 min-h-5 text-sm text-accent" role="status">{msg}</p>

      <div class="sticky top-16 z-10 -mx-1 mt-2 flex flex-wrap items-center gap-2 bg-page/95 px-1 py-2 text-sm backdrop-blur">
        <label class="sr-only" for="dsa-q">Search problems</label>
        <input id="dsa-q" type="search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} placeholder="Search problems" class="w-44 rounded-full border border-line bg-surface px-3 py-1.5" />
        <label class="sr-only" for="dsa-topic">Topic</label>
        <select id="dsa-topic" value={topic} onChange={(e) => setTopic((e.target as HTMLSelectElement).value)} class="rounded-full border border-line bg-surface px-3 py-1.5">
          <option value="all">All topics</option>
          {TOPICS.map((t) => <option value={t}>{t}</option>)}
        </select>
        <label class="sr-only" for="dsa-diff">Difficulty</label>
        <select id="dsa-diff" value={diff} onChange={(e) => setDiff((e.target as HTMLSelectElement).value)} class="rounded-full border border-line bg-surface px-3 py-1.5">
          <option value="all">All levels</option><option>Easy</option><option>Medium</option><option>Hard</option>
        </select>
        <label class="sr-only" for="dsa-status">Status</label>
        <select id="dsa-status" value={status} onChange={(e) => setStatus((e.target as HTMLSelectElement).value as typeof status)} class="rounded-full border border-line bg-surface px-3 py-1.5" data-testid="status">
          <option value="all">All problems</option><option value="todo">Not solved</option><option value="solved">Solved</option><option value="revise">Starred to revise</option>
        </select>
      </div>

      <div class="mt-4 grid gap-4">
          {TOPICS.map((t) => {
            const ps = PROBLEMS.filter((p) => p.topic === t && match(p));
            if (!ps.length) return null;
            const all = sum.byTopic.find((x) => x.topic === t)!;
            return (
              <details open id={topicSlug(t)} class="group rounded-xl border border-line bg-surface">
                <summary class="flex cursor-pointer list-none items-center gap-4 px-4 py-3">
                  <span class="text-muted transition group-open:rotate-90" aria-hidden="true">▸</span>
                  <h2 class="min-w-0 flex-1 text-base font-bold">{t}</h2>
                  <span class="hidden w-40 sm:block"><Bar done={all.done} total={all.total} label={`${t} progress`} /></span>
                  <span class="w-12 text-right text-sm tabular-nums text-muted">{all.done}/{all.total}</span>
                </summary>
                <ul class="border-t border-line px-4">{ps.map(row)}</ul>
              </details>
            );
          })}
      </div>

      <section class="mt-10 grid gap-6 lg:grid-cols-2">
        <div class="rounded-2xl border border-line bg-surface p-5">
          <h2 class="text-base font-bold">Solved per week</h2>
          <p class="text-xs text-muted">Last 12 weeks, India time</p>
          <Weekly data={weeks} />
        </div>
        <div class="rounded-2xl border border-line bg-surface p-5">
          <h2 class="text-base font-bold">By topic</h2>
          <div class="mt-3 grid gap-2 text-sm">
            {sum.byTopic.map((t) => (
              <a href={`#${topicSlug(t.topic)}`} class="grid grid-cols-[9rem_1fr_3rem] items-center gap-3 hover:text-accent">
                <span class="truncate">{t.topic}</span><Bar done={t.done} total={t.total} label={`${t.topic} progress`} /><span class="text-right tabular-nums text-muted">{t.done}/{t.total}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section id="badges" class="mt-6 rounded-2xl border border-line bg-surface p-5" aria-labelledby="badges-title">
        <h2 id="badges-title" class="text-base font-bold">Badges <span class="font-normal text-muted">· {earned} of {bs.length}</span></h2>
        <ul class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {bs.map((b) => (
            <li class={`rounded-xl border p-3 ${b.earned ? 'border-accent bg-tint' : 'border-line opacity-70'}`} data-badge={b.id} data-earned={b.earned ? '1' : '0'}>
              <p class="font-semibold">{b.earned ? '🏅 ' : ''}{b.name}</p>
              <p class="text-xs text-muted">{b.desc}</p>
              {!b.earned && b.progress && <p class="mt-1 text-xs tabular-nums text-muted">{b.progress}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
