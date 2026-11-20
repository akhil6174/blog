/**
 * Maths for the Students tools (D-038). Pure functions, no browser or server APIs, so they are unit tested
 * (tests/student-tools.test.ts) and shared by the calculator islands.
 */

// ---------- Attendance ----------

export type AttendanceResult = {
  /** Current attendance in percent (0 when no classes held yet). */
  percent: number;
  /** True when the current attendance is at or above the target. */
  safe: boolean;
  /** Classes that can be missed in a row from now and still stay at or above the target (0 if not safe). */
  canMiss: number;
  /** Classes that must be attended in a row to reach the target (0 if already safe; null if impossible). */
  mustAttend: number | null;
  /** With `remaining` classes left this semester: how many of them can be missed and still finish at the target. */
  plan: { remaining: number; canMissOfRemaining: number; reachable: boolean; finalIfAllAttended: number } | null;
};

/**
 * attended and held are class counts; target is a percentage (for example 75); remaining is optional.
 * Uses whole classes and a small tolerance so 75.0% counts as 75%.
 */
export function attendance(attended: number, held: number, target = 75, remaining?: number | null): AttendanceResult {
  if (!Number.isFinite(attended) || !Number.isFinite(held) || attended < 0 || held < 0) throw new Error('Counts must be zero or more.');
  if (attended > held) throw new Error('Attended classes cannot be more than classes held.');
  if (!(target > 0 && target <= 100)) throw new Error('Target must be between 1 and 100.');
  const p = target / 100;
  const eps = 1e-9;
  const percent = held === 0 ? 0 : (attended / held) * 100;
  const safe = held > 0 && attended / held + eps >= p;

  // Missing k more: attended / (held + k) >= p  =>  k <= attended / p - held
  const canMiss = safe ? Math.max(0, Math.floor(attended / p - held + eps)) : 0;

  // Attending x more in a row: (attended + x) / (held + x) >= p  =>  x >= (p*held - attended) / (1 - p)
  let mustAttend: number | null = 0;
  if (!safe) {
    if (p >= 1) mustAttend = attended === held ? 0 : null;
    else mustAttend = Math.max(0, Math.ceil((p * held - attended) / (1 - p) - eps));
    if (held === 0) mustAttend = 1;
  }

  let plan: AttendanceResult['plan'] = null;
  if (remaining !== undefined && remaining !== null && Number.isFinite(remaining) && remaining > 0) {
    const n = Math.floor(remaining);
    const total = held + n;
    // Missing s of the remaining n: (attended + n - s) / total >= p  =>  s <= attended + n - p*total
    const s = Math.floor(attended + n - p * total + eps);
    plan = { remaining: n, canMissOfRemaining: Math.max(0, Math.min(n, s)), reachable: s >= 0, finalIfAllAttended: ((attended + n) / total) * 100 };
  }
  return { percent, safe, canMiss, mustAttend, plan };
}

// ---------- SGPA and CGPA (credit-weighted, 10-point scale) ----------

/** UGC CBCS 10-point letter grades, used by most Indian universities (some use slightly different letters). */
export const GRADE_POINTS: { grade: string; points: number }[] = [
  { grade: 'O (Outstanding)', points: 10 },
  { grade: 'A+ (Excellent)', points: 9 },
  { grade: 'A (Very good)', points: 8 },
  { grade: 'B+ (Good)', points: 7 },
  { grade: 'B (Above average)', points: 6 },
  { grade: 'C (Average)', points: 5 },
  { grade: 'P (Pass)', points: 4 },
  { grade: 'F (Fail)', points: 0 },
];

export type Weighted = { value: number; credits: number };

/** SGPA = sum(grade points x credits) / sum(credits) over a semester's subjects. */
export function sgpa(subjects: { points: number; credits: number }[]): number | null {
  const rows = subjects.filter((s) => Number.isFinite(s.points) && Number.isFinite(s.credits) && s.credits > 0);
  if (!rows.length) return null;
  if (rows.some((s) => s.points < 0 || s.points > 10)) throw new Error('Grade points must be between 0 and 10.');
  const credits = rows.reduce((n, s) => n + s.credits, 0);
  return rows.reduce((n, s) => n + s.points * s.credits, 0) / credits;
}

/**
 * CGPA = sum(SGPA x semester credits) / sum(semester credits). When no semester has credits, a plain average of
 * the SGPAs is used (correct only when every semester has the same credits; the page says so).
 */
export function cgpa(semesters: { sgpa: number; credits?: number | null }[]): { value: number; weighted: boolean } | null {
  const rows = semesters.filter((s) => Number.isFinite(s.sgpa));
  if (!rows.length) return null;
  if (rows.some((s) => s.sgpa < 0 || s.sgpa > 10)) throw new Error('SGPA must be between 0 and 10.');
  const withCredits = rows.filter((s) => s.credits && s.credits > 0);
  if (withCredits.length === rows.length) {
    const credits = rows.reduce((n, s) => n + (s.credits as number), 0);
    return { value: rows.reduce((n, s) => n + s.sgpa * (s.credits as number), 0) / credits, weighted: true };
  }
  return { value: rows.reduce((n, s) => n + s.sgpa, 0) / rows.length, weighted: false };
}

// ---------- CGPA to percentage ----------

export type PercentFormula = { id: string; label: string; formula: string; note: string; apply: (c: number) => number };

/**
 * Only formulas we can state with confidence. Universities change their rules; the page always tells students to
 * use the formula printed on their own grade card or regulations when it differs.
 */
export const PERCENT_FORMULAS: PercentFormula[] = [
  { id: 'times10', label: 'CGPA × 10', formula: 'Percentage = CGPA × 10', note: 'Used by Anna University and many autonomous colleges.', apply: (c) => c * 10 },
  { id: 'vtu', label: '(CGPA − 0.75) × 10', formula: 'Percentage = (CGPA − 0.75) × 10', note: 'Used by VTU (Visvesvaraya Technological University).', apply: (c) => Math.max(0, (c - 0.75) * 10) },
  { id: 'times95', label: 'CGPA × 9.5', formula: 'Percentage = CGPA × 9.5', note: 'The CBSE-style conversion, still asked for by some forms.', apply: (c) => c * 9.5 },
];

export function toPercent(value: number, formula: PercentFormula | { custom: number }): number {
  if (!Number.isFinite(value) || value < 0 || value > 10) throw new Error('CGPA must be between 0 and 10.');
  const pct = 'custom' in formula ? value * formula.custom : formula.apply(value);
  return Math.min(100, Math.max(0, pct));
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
