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

/**
 * ModeratePost: the 5-step moderation pipeline (rules -> harmful content -> spam/quality -> decide -> finalize).
 * Phase 0 ships a stub so the binding, class export and local runtime are proven end to end.
 * Phase 3 fills in each step (see "AI moderation design (v2)" in the plan).
 */
export class ModeratePost extends WorkflowEntrypoint<Env, ModerationParams> {
  async run(event: WorkflowEvent<ModerationParams>, step: WorkflowStep): Promise<ModerationResult> {
    const { postId } = event.payload;

    const rules = await step.do('rules', async () => {
      return { pass: true, reason: 'Phase 0 stub: rule checks not implemented yet' };
    });

    const decision = await step.do('decide', async () => {
      return rules.pass
        ? { verdict: 'unsure' as const, reason: 'Phase 0 stub: holding for admin review' }
        : { verdict: 'reject' as const, reason: rules.reason };
    });

    return { postId, verdict: decision.verdict, reason: decision.reason, qualityScore: null };
  }
}

export default {
  fetch: handle,

  // Hourly housekeeping. Phase 1+: rebuild community sitemap, expire stale drafts, compute Top 10 into KV, send digest.
  async scheduled(controller: ScheduledController, _env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log(`[cron] ${controller.cron} fired at ${new Date(controller.scheduledTime).toISOString()} (Phase 0 stub)`);
  },
} satisfies ExportedHandler<Env>;
