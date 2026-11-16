/**
 * Audit log: one D1 row per admin action (and a few account-level actions), shown on /admin.
 * Never throws: a failed audit write must not fail the action itself.
 */
import { db, auditLog } from './db';

export async function audit(actorId: string | null, action: string, targetId?: string | null, detail?: string | null): Promise<void> {
  try {
    await db().insert(auditLog).values({ actorId, action, targetId: targetId ?? null, detail: detail ? detail.slice(0, 500) : null });
  } catch {
    /* ignore */
  }
}
