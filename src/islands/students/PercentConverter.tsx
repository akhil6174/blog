/**
 * CGPA to percentage converter. Only formulas we can state with confidence, plus a custom multiplier; the page
 * tells students to use their own university's printed rule when it differs. Maths: src/lib/student-tools.ts.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { PERCENT_FORMULAS, round2, toPercent } from '../../lib/student-tools';

export default function PercentConverter() {
  const [value, setValue] = useState('8.2');
  const [id, setId] = useState('times10');
  const [custom, setCustom] = useState('9.5');
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('cgpa');
    if (q && Number(q) >= 0 && Number(q) <= 10) setValue(q);
  }, []);

  const f = PERCENT_FORMULAS.find((x) => x.id === id);
  const out = useMemo(() => {
    const c = Number(value);
    if (value.trim() === '' || Number.isNaN(c)) return { error: 'Enter your CGPA.' };
    try {
      return { pct: toPercent(c, f ?? { custom: Number(custom) || 0 }) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [value, id, custom]);

  const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-lg tabular-nums focus:border-accent focus:outline-none';
  return (
    <div class="grid gap-6 rounded-2xl border border-line bg-tint p-5 font-sans md:grid-cols-2 md:p-7">
      <div class="grid content-start gap-4">
        <label class="grid gap-1"><span class="text-sm font-semibold">Your CGPA (10-point scale)</span><input class={field} type="number" min={0} max={10} step="0.01" value={value} onInput={(e) => setValue((e.target as HTMLInputElement).value)} data-testid="cgpa-in" /></label>
        <fieldset class="grid gap-2">
          <legend class="mb-1 text-sm font-semibold">Conversion formula</legend>
          {PERCENT_FORMULAS.map((x) => (
            <label class={`flex cursor-pointer gap-3 rounded-lg border bg-surface p-3 ${id === x.id ? 'border-accent' : 'border-line'}`}>
              <input type="radio" name="formula" value={x.id} checked={id === x.id} onChange={() => setId(x.id)} class="mt-1 accent-[var(--color-accent)]" data-testid={`f-${x.id}`} />
              <span><span class="block font-semibold">{x.label}</span><span class="block text-xs text-muted">{x.note}</span></span>
            </label>
          ))}
          <label class={`flex cursor-pointer items-center gap-3 rounded-lg border bg-surface p-3 ${id === 'custom' ? 'border-accent' : 'border-line'}`}>
            <input type="radio" name="formula" value="custom" checked={id === 'custom'} onChange={() => setId('custom')} class="accent-[var(--color-accent)]" data-testid="f-custom" />
            <span class="font-semibold">CGPA ×</span>
            <input type="number" step="0.01" min={0} value={custom} onInput={(e) => { setCustom((e.target as HTMLInputElement).value); setId('custom'); }} class="w-20 rounded-md border border-line px-2 py-1 tabular-nums" aria-label="Custom multiplier" />
            <span class="text-xs text-muted">from your grade card</span>
          </label>
        </fieldset>
      </div>
      <div class="flex flex-col justify-center rounded-xl bg-surface p-5 text-center" aria-live="polite">
        <p class="text-sm font-semibold uppercase tracking-wide text-muted">Equivalent percentage</p>
        <p class="mt-1 text-5xl font-bold tabular-nums text-accent" data-testid="pct">{'error' in out ? '–' : `${round2(out.pct).toFixed(2)}%`}</p>
        {'error' in out ? <p class="mt-2 text-sm text-red-700">{out.error}</p> : <p class="mt-3 text-sm text-muted">{f ? f.formula : `Percentage = CGPA × ${custom}`}</p>}
        <p class="mt-4 text-xs text-muted">Always use the formula printed on your grade card or in your university's regulations if it is different.</p>
      </div>
    </div>
  );
}
