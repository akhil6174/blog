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
- Anything imported by a pre-rendered page must not import `cloudflare:workers` at module top level (use `await import()` inside the handler/component). The build's Node prerender fails otherwise.
- After adding npm packages on Windows, regenerate the lock file before pushing: `rm -rf node_modules package-lock.json && npm install --include=optional` (Workers Builds runs `npm ci` on Linux and fails on a Windows-only lock).
- Editor (`src/islands/editor/`): never pass new objects or functions to `useEditor` or `BubbleMenu` per render (D-021). After any editor change run `npm run build`, `npm run preview` and `node tests/e2e/editor.e2e.mjs`. If the preview cannot reach Cloudflare for the AI binding, remove the `ai` binding temporarily for the local run and restore it before committing.
- Schema changes: edit `src/lib/db/schema.ts`, run `npm run db:generate`, then `npm run db:migrate:local`; production applies them through `npm run deploy`.
- Local testing of auth flows: `.dev.vars` with `AUTH_DEV_LOGIN=true` and `SITE_URL=http://127.0.0.1:4321`; sign up through `/api/auth/sign-up/email` (send an `Origin` header from scripts).
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

Phase 3 (community publishing) is built and tested locally; Phase 1 is live at https://trutiai.in. Waiting on owner tasks: production D1 migration (`npm run deploy` as the Workers Builds deploy command), `BETTER_AUTH_SECRET` + Google OAuth secrets, OpenAI key, bio/photo, Email Routing, Resend/Turnstile/analytics keys. Phase 2 (articles) is the owner's writing. See `docs/PROGRESS.md`.
