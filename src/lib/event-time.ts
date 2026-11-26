/** Event dates (D-047): the admin types India time; it is stored as UTC and shown in India time. Pure, unit tested. */
const IST = 330 * 60_000;

/** "2026-12-05T10:00" (India time, from <input type="datetime-local">) -> Date, or null if invalid. */
export function fromIstInput(v: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec((v ?? '').trim());
  if (!m) return null;
  const ms = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!) - IST;
  return Number.isNaN(ms) ? null : new Date(ms);
}

/** Date -> "2026-12-05T10:00" in India time, for the admin form. */
export function toIstInput(d: Date | null | undefined): string {
  if (!d) return '';
  return new Date(d.getTime() + IST).toISOString().slice(0, 16);
}

const day = (d: Date) => d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const time = (d: Date) => d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
const sameDay = (a: Date, b: Date) => new Date(a.getTime() + IST).toISOString().slice(0, 10) === new Date(b.getTime() + IST).toISOString().slice(0, 10);

/** "Sat, 5 Dec 2026 · 10:00 am – 1:00 pm IST" or "Sat, 5 Dec 2026, 10:00 am – Sun, 6 Dec 2026, 6:00 pm IST". */
export function eventWhen(start: Date, end?: Date | null): string {
  if (!end) return `${day(start)} · ${time(start)} IST`;
  if (sameDay(start, end)) return `${day(start)} · ${time(start)} – ${time(end)} IST`;
  return `${day(start)}, ${time(start)} – ${day(end)}, ${time(end)} IST`;
}

/** Upcoming until it has ended (or, without an end, until the start day is over in India). */
export function isUpcoming(start: Date, end: Date | null | undefined, now = new Date()): boolean {
  if (end) return end.getTime() >= now.getTime();
  const s = new Date(start.getTime() + IST);
  const startDayEnd = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() + 1) - IST;
  return startDayEnd > now.getTime();
}

/** Short badge for the card: "Today", "Tomorrow", "In 5 days", "Live now" or "". */
export function eventBadge(start: Date, end: Date | null | undefined, now = new Date()): string {
  if (start <= now && (end ? end >= now : false)) return 'Live now';
  const d0 = Math.floor((now.getTime() + IST) / 86_400_000), d1 = Math.floor((start.getTime() + IST) / 86_400_000);
  const n = d1 - d0;
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n > 1 && n <= 14) return `In ${n} days`;
  return '';
}
