# Tech Blog

A Medium-style tech blog on Cloudflare's free plan: Astro for the site, D1 for data, R2 for images, Workers AI and the OpenAI Moderation API for community-post screening, Google AdSense for income. The only recurring cost is the domain.

- **Plan:** `../Tech Blog Build Plan v2.md` (architecture, 5-phase roadmap, AdSense playbook)
- **How it works:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Why it is built this way:** [docs/DECISIONS.md](docs/DECISIONS.md)
- **What is done and what is next:** [docs/PROGRESS.md](docs/PROGRESS.md)
- **What changed:** [docs/CHANGELOG.md](docs/CHANGELOG.md)
- **What every file does:** [docs/FILES.md](docs/FILES.md)
- **What to register on each platform and where each key goes:** [docs/SETUP-GUIDE.md](docs/SETUP-GUIDE.md)
- **Rules for Claude Code:** [CLAUDE.md](CLAUDE.md)

## Prerequisites

- Node.js 22.23 or newer (24 is installed), npm, Git
- A Cloudflare account (free) and, for local dev, `npx wrangler login` run once
- Later phases: Google Cloud OAuth client, OpenAI API key, Resend, Sentry, Turnstile keys (see `.dev.vars.example`)

## Commands

```bash
npm install            # install dependencies
npm run dev            # dev server at http://127.0.0.1:4321 with Cloudflare bindings emulated locally
npm run build          # production build into dist/
npm run preview        # serve the production build through workerd (closest to production)
npm run generate-types # regenerate worker-configuration.d.ts after changing wrangler.jsonc
npx wrangler deploy    # manual deploy; normally Workers Builds deploys on push to main
```

`npm run dev` and `npm run preview` need `npx wrangler login` once: the Workers AI binding has no local emulator and is proxied to your account. `npm run build` works without login.

## First-time setup (owner)

The code part of Phase 0 is done. These steps need your accounts; the live checklist is in [docs/PROGRESS.md](docs/PROGRESS.md) and the click-by-click instructions for every platform are in [docs/SETUP-GUIDE.md](docs/SETUP-GUIDE.md).

1. **Accounts:** Cloudflare, GitHub, Google (the Gmail you will keep for AdSense), OpenAI, Resend, Sentry.
2. **Domain:** buy it at Cloudflare Registrar, or point an existing domain's nameservers to Cloudflare.
3. **Log in:** `npx wrangler login`.
4. **Create resources** and paste the ids into `wrangler.jsonc`:
   ```bash
   npx wrangler d1 create tech-blog-db
   npx wrangler kv namespace create CACHE
   ```
   (R2 for image uploads is added in Phase 3; it needs a card on file.)
   Then `npm run generate-types`.
5. **Local secrets:** `copy .dev.vars.example .dev.vars` and fill values as each phase needs them. Never commit `.dev.vars`.
6. **GitHub + Workers Builds:** create a repository, push, then in the Cloudflare dashboard go to Workers & Pages → Create → Import a repository. Build command `npm run build`, deploy command `npx wrangler deploy`. Add a build variable `SITE_URL=https://yourdomain.com`.
7. **Domain on the Worker:** Worker → Settings → Domains & Routes → add `yourdomain.com` and `www`. Set `SITE_URL` in `wrangler.jsonc` `vars` to the same value.
8. **Check:** open `https://yourdomain.com/api/health`; every check should be `true`.
9. **Search Console:** add the domain property now so data starts collecting.

## Project layout

```
src/
  worker.ts              Worker entry: Astro handler + cron + ModeratePost Workflow
  pages/                 Routes (index.astro is static; api/health.ts runs in the Worker)
  layouts/BaseLayout.astro
  lib/site.ts            Site constants
  styles/global.css      Tailwind v4 + design tokens
public/                  robots.txt, icons (copied as-is)
docs/                    ARCHITECTURE, DECISIONS, CHANGELOG, PROGRESS, FILES
wrangler.jsonc           Cloudflare bindings and vars
astro.config.mjs         Astro + adapter config
```

## Free-tier guardrails (read before adding features)

- Pages are static unless they truly need code. Worker CPU is 10 ms per request.
- D1 allows 100K writes/day; KV allows 1K writes/day. No per-request KV writes; sampled view counting.
- Secrets never go in the repo. Non-secret config goes in `wrangler.jsonc` `vars`.
- The AI model id is read from the `settings` table with `AI_MODEL_DEFAULT` as fallback; never hard-code it.
