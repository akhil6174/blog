/**
 * Attendance calculator: classes attended and held, target (75% by default) and, optionally, classes left this
 * semester. Everything runs in the browser; the maths is in src/lib/student-tools.ts.
 */
import { useMemo, useState } from 'preact/hooks';
import { attendance, round2 } from '../../lib/student-tools';

const num = (v: string) => (v.trim() === '' ? NaN : Number(v));

export default function AttendanceCalculator() {
  const [attended, setAttended] = useState('34');
  const [held, setHeld] = useState('42');
  const [target, setTarget] = useState('75');
  const [left, setLeft] = useState('');

  const out = useMemo(() => {
    const a = num(attended), h = num(held), t = num(target), l = left.trim() ? num(left) : null;
    if ([a, h, t].some((x) => Number.isNaN(x))) return { error: 'Enter the classes attended, classes held and your target.' };
    try {
      return { r: attendance(Math.floor(a), Math.floor(h), t, l), t };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [attended, held, target, left]);

  const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-lg tabular-nums focus:border-accent focus:outline-none';
  return (
    <div class="grid gap-6 rounded-2xl border border-line bg-tint p-5 font-sans md:grid-cols-2 md:p-7" data-tool="attendance">
      <form class="grid gap-4" onSubmit={(e) => e.preventDefault()}>
        <label class="grid gap-1"><span class="text-sm font-semibold">Classes attended</span><input class={field} type="number" inputMode="numeric" min={0} value={attended} onInput={(e) => setAttended((e.target as HTMLInputElement).value)} data-testid="attended" /></label>
        <label class="grid gap-1"><span class="text-sm font-semibold">Classes held so far</span><input class={field} type="number" inputMode="numeric" min={0} value={held} onInput={(e) => setHeld((e.target as HTMLInputElement).value)} data-testid="held" /></label>
        <label class="grid gap-1"><span class="text-sm font-semibold">Required attendance (%)</span><input class={field} type="number" inputMode="decimal" min={1} max={100} value={target} onInput={(e) => setTarget((e.target as HTMLInputElement).value)} data-testid="target" /></label>
        <label class="grid gap-1"><span class="text-sm font-semibold">Classes left this semester <span class="font-normal text-muted">(optional)</span></span><input class={field} type="number" inputMode="numeric" min={0} value={left} placeholder="for example 30" onInput={(e) => setLeft((e.target as HTMLInputElement).value)} data-testid="left" /></label>
      </form>
      <div class="flex flex-col justify-center rounded-xl bg-surface p-5" aria-live="polite" data-testid="attendance-result">
        {'error' in out ? (
          <p class="text-muted">{out.error}</p>
        ) : (
          <>
            <p class="text-sm font-semibold uppercase tracking-wide text-muted">Your attendance</p>
            <p class={`mt-1 text-5xl font-bold tabular-nums ${out.r.safe ? 'text-accent' : 'text-red-700'}`}>{round2(out.r.percent)}%</p>
            {out.r.safe ? (
              <p class="mt-4 text-lg">You can miss <strong data-testid="can-miss">{out.r.canMiss}</strong> more {out.r.canMiss === 1 ? 'class' : 'classes'} in a row and stay at {out.t}%.</p>
            ) : out.r.mustAttend === null ? (
              <p class="mt-4 text-lg">{out.t}% is no longer reachable, even if you attend every class.</p>
            ) : (
              <p class="mt-4 text-lg">Attend the next <strong data-testid="must-attend">{out.r.mustAttend}</strong> {out.r.mustAttend === 1 ? 'class' : 'classes'} in a row to reach {out.t}%.</p>
            )}
            {out.r.plan && (
              <p class="mt-3 border-t border-line pt-3 text-sm text-muted" data-testid="plan">
                {out.r.plan.reachable
                  ? <>Of the {out.r.plan.remaining} classes left, you can miss <strong class="text-ink">{out.r.plan.canMissOfRemaining}</strong> and still finish at {out.t}% or above.</>
                  : <>Even attending all {out.r.plan.remaining} remaining classes, you would finish at {round2(out.r.plan.finalIfAllAttended)}%. Talk to your department about condonation rules.</>}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
