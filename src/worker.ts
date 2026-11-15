/**
 * Worker entry point.
 *
 * Astro's Cloudflare adapter normally supplies the whole Worker. We wrap it so the same Worker can also:
 *   - export the moderation Workflow class (Cloudflare requires Workflow classes to be exported from `main`)
 *   - handle hourly cron triggers
 *
 * Request handling is delegated unchanged to Astro's handler.
 */
import { handle } from '@astrojs/cloudflare/handler';
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { getSettings } from './lib/db/settings';
import { loadTarget, logStep, markChecking, applyDecision } from './lib/moderation';
import { runRules } from './lib/moderation/rules';
import { runHarmful } from './lib/moderation/harmful';
import { runQuality } from './lib/moderation/quality';
import { decide } from './lib/moderation/decide';
import { hasRole } from './lib/auth';
import { db, user } from './lib/db';
import { eq } from 'drizzle-orm';
import { runHourly } from './cron/hourly';

export type ModerationParams = {
  postId: string;
  kind: 'post' | 'comment';
};

export type ModerationResult = {
  postId: string;
  verdict: 'publish' | 'reject' | 'unsure';
  reason: string;
  qualityScore: number | null;
};

const RETRY = { retries: { limit: 3, delay: '10 seconds' as const, backoff: 'exponential' as const }, timeout: '2 minutes' as const };

/**
 * ModeratePost: the 5-step moderation pipeline (rules -> harmful content -> spam/quality -> decide -> finalize).
 * Every step is durable: a timeout at OpenAI or Workers AI is retried, and nothing is lost.
 */
export class ModeratePost extends WorkflowEntrypoint<Env, ModerationParams> {
  async run(event: WorkflowEvent<ModerationParams>, step: WorkflowStep): Promise<ModerationResult> {
    const { postId: id, kind } = event.payload;
    const ownHost = new URL(this.env.SITE_URL).hostname;

    const target = await step.do('load', RETRY, async () => {
      await markChecking(kind, id);
      const t = await loadTarget(kind, id);
      if (!t) throw new Error(`target ${kind}:${id} not found`);
      return t;
    });

    const rules = await step.do('rules', RETRY, async () => {
      const r = await runRules(target, ownHost);
      await logStep(kind, id, r);
      return r;
    });

    // Short-circuit: a rule failure needs no AI spend.
    const harmful = rules.verdict === 'reject'
      ? { step: 'harmful' as const, verdict: 'pass' as const, reason: 'skipped (rules failed)' }
      : await step.do('harmful', RETRY, async () => {
          const r = await runHarmful(target);
          await logStep(kind, id, r);
          return r;
        });

    const quality = rules.verdict === 'reject' || harmful.verdict === 'reject'
      ? { step: 'quality' as const, verdict: 'unsure' as const, reason: 'skipped', score: null }
      : await step.do('quality', RETRY, async () => {
          const r = await runQuality(target);
          await logStep(kind, id, r);
          return { ...r, quality: undefined };
        });

    const decision = await step.do('decide', RETRY, async () => {
      const s = await getSettings();
      const author = await db().query.user.findFirst({ where: eq(user.id, target.authorId) });
      const dec = decide(rules, harmful, quality, {
        words: target.words,
        trusted: hasRole(author, 'trusted'),
        publishMin: Number(s.quality_publish_min),
        indexMin: Number(s.quality_index_min),
        indexMinWords: Number(s.index_min_words),
        kind,
      });
      await logStep(kind, id, { step: 'decide', verdict: dec.status === 'published' ? 'publish' : dec.status === 'rejected' ? 'reject' : 'unsure', reason: dec.reason, provider: 'code', score: dec.qualityScore });
      return dec;
    });

    await step.do('finalize', RETRY, async () => {
      await applyDecision(kind, id, decision, { notify: kind === 'post' });
      await logStep(kind, id, { step: 'finalize', verdict: 'pass', reason: `status=${decision.status} index=${decision.indexAllowed}`, provider: 'code' });
      return true;
    });

    return { postId: id, verdict: decision.status === 'published' ? 'publish' : decision.status === 'rejected' ? 'reject' : 'unsure', reason: decision.reason, qualityScore: decision.qualityScore };
  }
}

export default {
  fetch: handle,

  // Hourly housekeeping: Top 10 lists into KV, community sitemap purge, re-check reported items, stale drafts.
  async scheduled(controller: ScheduledController, _env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runHourly(new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
