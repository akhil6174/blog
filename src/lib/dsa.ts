/**
 * DSA sheet storage (D-042): a signed-in student's progress. The problem list itself is static (src/lib/dsa-sheet.ts).
 */
import { and, eq } from 'drizzle-orm';
import { db, dsaProgress } from './db';
import { PROBLEM_IDS, type Progress } from './dsa-sheet';

export class DsaError extends Error {}

export async function getProgress(userId: string): Promise<Progress[]> {
  const rows = await db().select().from(dsaProgress).where(eq(dsaProgress.userId, userId));
  return rows
    .filter((r) => PROBLEM_IDS.has(r.problemId))
    .map((r) => ({ id: r.problemId, solvedAt: r.solvedAt ? r.solvedAt.getTime() : null, revise: r.revise }));
}

/** Set solved and/or revise for one problem. A row with neither is deleted (keeps the table small). */
export async function setProgress(userId: string, id: string, change: { solved?: boolean; revise?: boolean }): Promise<Progress> {
  if (!PROBLEM_IDS.has(id)) throw new DsaError('Unknown problem.');
  const d = db();
  const cur = await d.query.dsaProgress.findFirst({ where: and(eq(dsaProgress.userId, userId), eq(dsaProgress.problemId, id)) });
  const solvedAt = change.solved === undefined ? cur?.solvedAt ?? null : change.solved ? cur?.solvedAt ?? new Date() : null;
  const revise = change.revise ?? cur?.revise ?? false;
  if (!solvedAt && !revise) {
    if (cur) await d.delete(dsaProgress).where(and(eq(dsaProgress.userId, userId), eq(dsaProgress.problemId, id)));
  } else {
    await d.insert(dsaProgress).values({ userId, problemId: id, solvedAt, revise, updatedAt: new Date() })
      .onConflictDoUpdate({ target: [dsaProgress.userId, dsaProgress.problemId], set: { solvedAt, revise, updatedAt: new Date() } });
  }
  return { id, solvedAt: solvedAt ? solvedAt.getTime() : null, revise };
}

/**
 * Progress saved on the device before signing in is added to the account. Existing account rows win; only
 * problems the account has not touched are inserted. Rows go in groups of 15 (5 values each, under D1's 100).
 */
export async function mergeProgress(userId: string, items: Progress[]): Promise<number> {
  const have = new Set((await getProgress(userId)).map((p) => p.id));
  const now = Date.now();
  const rows = items
    .filter((p) => PROBLEM_IDS.has(p.id) && !have.has(p.id) && (p.solvedAt || p.revise))
    .slice(0, PROBLEM_IDS.size)
    .map((p) => ({
      userId,
      problemId: p.id,
      // Never accept future dates from the device.
      solvedAt: p.solvedAt ? new Date(Math.min(Number(p.solvedAt) || now, now)) : null,
      revise: !!p.revise,
      updatedAt: new Date(),
    }));
  for (let i = 0; i < rows.length; i += 15) await db().insert(dsaProgress).values(rows.slice(i, i + 15)).onConflictDoNothing();
  return rows.length;
}

