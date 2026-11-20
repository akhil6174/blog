/**
 * SGPA (from subjects) and CGPA (from semesters) on the 10-point scale. Runs in the browser; inputs are kept in
 * this browser only (localStorage) so a student can come back to them. Maths: src/lib/student-tools.ts.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { cgpa, GRADE_POINTS, round2, sgpa } from '../../lib/student-tools';

type Subject = { name: string; credits: string; points: string };
type Sem = { sgpa: string; credits: string };
const KEY = 'trutiai-gpa-v1';
const blankSubjects = (): Subject[] => [
  { name: 'Mathematics', credits: '4', points: '9' },
  { name: 'Data Structures', credits: '4', points: '8' },
  { name: 'Digital Logic', credits: '3', points: '8' },
  { name: 'Lab', credits: '2', points: '10' },
];
const blankSems = (): Sem[] => [{ sgpa: '8.2', credits: '22' }, { sgpa: '8.6', credits: '24' }];

export default function GpaCalculator() {
  const [tab, setTab] = useState<'sgpa' | 'cgpa'>('sgpa');
  const [subjects, setSubjects] = useState<Subject[]>(blankSubjects);
  const [sems, setSems] = useState<Sem[]>(blankSems);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (saved?.subjects?.length) setSubjects(saved.subjects);
      if (saved?.sems?.length) setSems(saved.sems);
      if (location.hash === '#cgpa') setTab('cgpa');
    } catch { /* storage unavailable: keep the examples */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ subjects, sems })); } catch { /* ignore */ }
  }, [subjects, sems]);

  const s = useMemo(() => {
    try { return { v: sgpa(subjects.map((x) => ({ points: Number(x.points), credits: Number(x.credits) }))) }; } catch (e) { return { error: (e as Error).message }; }
  }, [subjects]);
  const c = useMemo(() => {
    try {
      return { v: cgpa(sems.filter((x) => x.sgpa.trim() !== '').map((x) => ({ sgpa: Number(x.sgpa), credits: x.credits.trim() ? Number(x.credits) : null }))) };
    } catch (e) { return { error: (e as Error).message }; }
  }, [sems]);

  const cell = 'w-full rounded-md border border-line bg-surface px-2 py-2 tabular-nums focus:border-accent focus:outline-none';
  const tabBtn = (id: 'sgpa' | 'cgpa', label: string) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} class={`rounded-full px-4 py-2 text-sm font-semibold ${tab === id ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`} data-testid={`tab-${id}`}>{label}</button>
  );

  return (
    <div class="rounded-2xl border border-line bg-tint p-5 font-sans md:p-7">
      <div role="tablist" class="mb-5 inline-flex gap-1 rounded-full border border-line bg-surface p-1">{tabBtn('sgpa', 'SGPA (one semester)')}{tabBtn('cgpa', 'CGPA (all semesters)')}</div>

      {tab === 'sgpa' ? (
        <div class="grid gap-6 lg:grid-cols-[1fr_16rem]">
          <div class="min-w-0 overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="text-left text-xs uppercase tracking-wide text-muted"><tr><th class="pb-2 pr-2">Subject</th><th class="w-20 pb-2 pr-2">Credits</th><th class="pb-2 pr-2">Grade</th><th class="w-10" /></tr></thead>
              <tbody>
                {subjects.map((x, i) => (
                  <tr>
                    <td class="py-1 pr-2"><input class={cell} value={x.name} aria-label={`Subject ${i + 1} name`} onInput={(e) => setSubjects(subjects.map((y, j) => (j === i ? { ...y, name: (e.target as HTMLInputElement).value } : y)))} /></td>
                    <td class="py-1 pr-2"><input class={cell} type="number" min={0} step="0.5" value={x.credits} aria-label={`Subject ${i + 1} credits`} data-testid={`credits-${i}`} onInput={(e) => setSubjects(subjects.map((y, j) => (j === i ? { ...y, credits: (e.target as HTMLInputElement).value } : y)))} /></td>
                    <td class="py-1 pr-2">
                      <select class={cell} value={x.points} aria-label={`Subject ${i + 1} grade`} data-testid={`grade-${i}`} onChange={(e) => setSubjects(subjects.map((y, j) => (j === i ? { ...y, points: (e.target as HTMLSelectElement).value } : y)))}>
                        {GRADE_POINTS.map((g) => <option value={String(g.points)}>{g.grade} · {g.points}</option>)}
                      </select>
                    </td>
                    <td class="py-1 text-right"><button type="button" class="rounded px-2 py-1 text-muted hover:bg-surface hover:text-red-700" aria-label={`Remove subject ${i + 1}`} onClick={() => setSubjects(subjects.filter((_, j) => j !== i))}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" class="mt-3 rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-semibold hover:border-accent" onClick={() => setSubjects([...subjects, { name: `Subject ${subjects.length + 1}`, credits: '3', points: '8' }])} data-testid="add-subject">+ Add subject</button>
          </div>
          <div class="self-start rounded-xl bg-surface p-5 text-center" aria-live="polite">
            <p class="text-sm font-semibold uppercase tracking-wide text-muted">Your SGPA</p>
            <p class="mt-1 text-5xl font-bold tabular-nums text-accent" data-testid="sgpa">{'error' in s ? '–' : s.v === null ? '–' : round2(s.v).toFixed(2)}</p>
            {'error' in s && <p class="mt-2 text-sm text-red-700">{s.error}</p>}
            <p class="mt-3 text-xs text-muted">{subjects.reduce((n, x) => n + (Number(x.credits) || 0), 0)} credits</p>
          </div>
        </div>
      ) : (
        <div class="grid gap-6 lg:grid-cols-[1fr_16rem]">
          <div class="min-w-0 overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="text-left text-xs uppercase tracking-wide text-muted"><tr><th class="pb-2 pr-2">Semester</th><th class="pb-2 pr-2">SGPA</th><th class="pb-2 pr-2">Credits <span class="normal-case">(optional)</span></th><th class="w-10" /></tr></thead>
              <tbody>
                {sems.map((x, i) => (
                  <tr>
                    <td class="py-1 pr-2 font-semibold">Semester {i + 1}</td>
                    <td class="py-1 pr-2"><input class={cell} type="number" min={0} max={10} step="0.01" value={x.sgpa} aria-label={`Semester ${i + 1} SGPA`} data-testid={`sem-sgpa-${i}`} onInput={(e) => setSems(sems.map((y, j) => (j === i ? { ...y, sgpa: (e.target as HTMLInputElement).value } : y)))} /></td>
                    <td class="py-1 pr-2"><input class={cell} type="number" min={0} value={x.credits} aria-label={`Semester ${i + 1} credits`} data-testid={`sem-credits-${i}`} onInput={(e) => setSems(sems.map((y, j) => (j === i ? { ...y, credits: (e.target as HTMLInputElement).value } : y)))} /></td>
                    <td class="py-1 text-right"><button type="button" class="rounded px-2 py-1 text-muted hover:bg-surface hover:text-red-700" aria-label={`Remove semester ${i + 1}`} onClick={() => setSems(sems.filter((_, j) => j !== i))}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sems.length < 10 && <button type="button" class="mt-3 rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-semibold hover:border-accent" onClick={() => setSems([...sems, { sgpa: '', credits: '' }])} data-testid="add-sem">+ Add semester</button>}
          </div>
          <div class="self-start rounded-xl bg-surface p-5 text-center" aria-live="polite">
            <p class="text-sm font-semibold uppercase tracking-wide text-muted">Your CGPA</p>
            <p class="mt-1 text-5xl font-bold tabular-nums text-accent" data-testid="cgpa">{'error' in c ? '–' : c.v === null ? '–' : round2(c.v.value).toFixed(2)}</p>
            {'error' in c && <p class="mt-2 text-sm text-red-700">{c.error}</p>}
            {!('error' in c) && c.v && <p class="mt-3 text-xs text-muted">{c.v.weighted ? 'Weighted by semester credits.' : 'Simple average: add credits for every semester for the exact, credit-weighted CGPA.'}</p>}
            {!('error' in c) && c.v && <a href={`/students/cgpa-to-percentage/?cgpa=${round2(c.v.value)}`} class="mt-4 inline-block text-sm font-semibold text-accent hover:underline">Convert to percentage →</a>}
          </div>
        </div>
      )}
    </div>
  );
}
