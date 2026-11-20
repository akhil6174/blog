/** Calendar months in India time, for dashboards (pure, unit tested). */
const IST_MS = 330 * 60 * 1000;
export const monthKey = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 7);

/** The last `n` months as "YYYY-MM", oldest first, ending with the current month. */
export function lastMonths(n = 12, now = new Date()): string[] {
  const [y, m] = monthKey(now).split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    return t.toISOString().slice(0, 7);
  });
}

export const monthShort = (key: string) => new Date(`${key}-15T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });
