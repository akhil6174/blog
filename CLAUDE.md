# CLAUDE.md — working agreement for this repository

This file is read by Claude Code at the start of every session. Keep it short and current.

## What this project is

A Medium-style tech blog on Cloudflare's free plan, built with Astro. The owner (admin) publishes editorial posts; anyone can sign in with Google and write; community posts pass an AI moderation pipeline. The business goal is Google AdSense approval and income. The only paid item is the domain.

The full plan lives one folder up: `../Tech Blog Build Plan v2.md` (also `.docx`). Read Part 2 (architecture) and the current phase in Part 3 before non-trivial work.

## Where things are tracked (update these as you work)

| File | Purpose | When to update |
|---|---|---|
| `docs/PROGRESS.md` | Phase-by-phase checklist and current status | Tick items as they are finished; move the "Current phase" marker |
| `docs/CHANGELOG.md` | Human-readable history of changes | Every change that lands, under `[Unreleased]` with today's date |
| `docs/DECISIONS.md` | Architecture decision records (why we chose X over Y) | Every non-obvious technical choice, including rejected suggestions |
| `docs/ARCHITECTURE.md` | How the system works: layers, request flows, bindings, data model | When a flow, table or binding changes |
| `docs/FILES.md` | Every file in the repo with a one-line description | Whenever a file is added, renamed or removed |
| `README.md` | Setup, commands, manual checklist for the owner | When commands or setup steps change |

Rule of thumb: a change is not finished until CHANGELOG, FILES (if files changed) and PROGRESS are updated.

## Hard rules

1. **Free tier first.** Pages are pre-rendered static files unless they truly need code (`export const prerender = false`). Worker CPU is 10 ms per request on the free plan: no image processing, no JSON-to-HTML rendering, no heavy loops at request time.
2. **D1 writes are precious (100K/day).** Never write per request without a reason. Views are sampled above 20,000/day; raises are debounced; counters are denormalised on `posts`.
3. **KV writes are rarer still (1K/day).** Only cron or admin actions write to KV.
4. **No secrets in the repo or in chat.** Secrets go in `.dev.vars` locally and `wrangler secret put` in production. Non-secret config goes in `wrangler.jsonc` `vars`.
5. **The AI model id is data, not code.** Read it from the `settings` table with `AI_MODEL_DEFAULT` as fallback. Never hard-code a model id in logic. Llama 3.1 8B and Llama 3.2 1B/3B are deprecated on 20 Nov 2026; do not use them.
6. **AdSense gating.** Community posts are `noindex` and ad-free until moderation sets `index_allowed` / `ads_allowed`. Community publishing is behind the `community_open` flag until AdSense shows "Ready".
7. **Accessibility and SEO are not optional.** Every page has a unique title and description; every image has alt text; contrast stays at or above 4.5:1.

## Conventions

- TypeScript strict. Zod validates every input on the server. Drizzle ORM for D1 (from Phase 3).
- Astro components for static UI; Preact islands (in `src/islands/`) only for interactive parts.
- Design tokens live in `src/styles/global.css` (`@theme`). Use the token utilities (`bg-page`, `text-ink`, `text-muted`, `border-line`, `text-accent`), not raw hex values.
- Routes under `src/pages/api/` are on-demand JSON endpoints and send `x-robots-tag: noindex`.
- Read bindings and vars with `import { env } from 'cloudflare:workers'`. `Astro.locals.runtime.env` no longer exists in Astro 6+ and throws at runtime.
- Local dev: `npm run build` needs no Cloudflare login. `npm run dev` / `npm run preview` do, because the Workers AI binding proxies to the account. To test without login, temporarily remove the `ai` binding from `wrangler.jsonc` and restore it afterwards.
- Commit messages: imperative, one line, optional body. Reference the phase, for example `Phase 1: add legal pages`.

## Commands

```bash
npm run dev            # local dev with Cloudflare bindings emulated (needs `npx wrangler login` once, for the AI binding)
npm run build          # production build into dist/
npm run preview        # serve the production build locally through workerd
npm run generate-types # regenerate worker-configuration.d.ts after editing wrangler.jsonc
npx wrangler deploy    # manual deploy (normally Workers Builds deploys on git push)
```

## Current phase

Phase 1 (foundation site): code complete, waiting on the live domain and owner inputs. See `docs/PROGRESS.md`.
