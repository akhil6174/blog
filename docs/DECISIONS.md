# Architecture decision records

One entry per non-obvious choice. Newest at the bottom. Status is `accepted`, `superseded by D-xxx`, or `rejected`.
Format: context (the situation), decision (what we do), consequences (what it costs or enables).

---

## D-001 · Astro with hybrid rendering on Cloudflare Workers static assets

- **Date:** 2026-11-11 · **Status:** accepted
- **Context:** Requests for static files on Workers are free and unlimited; Worker code requests are capped at 100,000/day and 10 ms CPU on the free plan. AdSense reviewers and Googlebot favour fast, plain HTML.
- **Decision:** Astro with `output: 'static'` by default. Editorial pages, listings, legal pages and feeds are pre-rendered. Only community posts, search, write/submit, admin, auth and API routes opt into on-demand rendering with `export const prerender = false`.
- **Consequences:** Most traffic never counts against the daily limit. Editorial publishing requires a rebuild (about one minute via Workers Builds). Community pages need edge caching to stay cheap.

## D-002 · Custom Worker entry (`src/worker.ts`) wrapping Astro's handler

- **Date:** 2026-11-11 · **Status:** accepted
- **Context:** Cloudflare Workflows classes and cron handlers must be exported from the Worker's `main` module. The adapter's default entry exports only `{ fetch }`.
- **Decision:** `wrangler.jsonc` points `main` at `src/worker.ts`, which re-exports Astro's `handle` as `fetch`, adds a `scheduled` handler, and exports the `ModeratePost` Workflow class.
- **Consequences:** One Worker hosts the site, the cron job and the moderation pipeline. Astro's request handling is unchanged. The adapter already strips `workflows`/`triggers` from its internal prerender worker config, so this is a supported shape.

## D-003 · Prerender in Node, not workerd

- **Date:** 2026-11-11 · **Status:** accepted
- **Context:** With the default `prerenderEnvironment: 'workerd'`, `astro build` starts a Cloudflare remote session because the Workers AI binding has no local emulator. That fails without a logged-in account or `CLOUDFLARE_API_TOKEN`.
- **Decision:** `prerenderEnvironment: 'node'` in the adapter options. Static pages never use bindings, so nothing is lost.
- **Consequences:** Builds work anywhere, including CI, without Cloudflare credentials. `npm run dev` and `npm run preview` still proxy the AI binding to Cloudflare and therefore need `npx wrangler login` once.

## D-004 · Workers AI model id lives in the `settings` table with an env fallback

- **Date:** 2026-11-11 · **Status:** accepted (rejects the suggestion to hard-code `@cf/meta/llama-3.1-8b-instruct` in an env var)
- **Context:** Cloudflare retires models with notice; Llama 3.1 8B and Llama 3.2 1B/3B are scheduled for deprecation on 20 Nov 2026. Changing an env var still requires a deploy; the admin should be able to swap models instantly.
- **Decision:** Read `ai_quality_model` from D1 `settings` (cached in KV), falling back to `AI_MODEL_DEFAULT` from `wrangler.jsonc` (`@cf/openai/gpt-oss-20b`). Safety fallback model: `@cf/meta/llama-guard-3-8b`.
- **Consequences:** A model swap is an admin-page edit plus a fixture run. The deprecated Llama 3.1 8B is never the default.

## D-005 · Store Tiptap JSON *and* pre-rendered HTML

- **Date:** 2026-11-11 · **Status:** accepted (partial adoption of the "JSON only, use `json_extract`" suggestion)
- **Context:** D1 (SQLite) supports JSON functions. Rendering JSON to HTML per request would consume most of the 10 ms CPU budget and defeat caching.
- **Decision:** `posts.body_json` is the editable source of truth; `posts.body_html` is rendered once on save with Tiptap's `generateHTML` and sanitised. `json_extract` is used only for cheap lookups (first image, headings, word count).
- **Consequences:** Slightly larger rows; zero rendering cost at read time; the editor always reloads exact state.

## D-006 · Denormalised counters plus a per-day `post_stats` table

- **Date:** 2026-11-11 · **Status:** accepted (extends the "add count columns" suggestion)
- **Context:** Top 10 lists must be Daily, Monthly and Yearly; a single lifetime counter cannot provide that. D1 allows 100K writes/day.
- **Decision:** `posts.views_count / raises_count / comments_count` for display; `post_stats(post_id, day, views, raises, comments)` for time windows; hourly cron writes the three Top 10 lists to KV. Views are counted by a beacon after 10 s on page, sampled 1 in 5 above 20,000 views/day.
- **Consequences:** The Top page costs one KV read. Write volume stays well under the free limit.

## D-007 · Raises and comments never purge the cached article

- **Date:** 2026-11-11 · **Status:** accepted (modifies the "re-render on edit/comment/raise" suggestion)
- **Context:** Purging on every clap would re-render popular posts constantly.
- **Decision:** Community article HTML is edge-cached and purged only on edit. The comment list is an Astro server island (uncached); the raise count is fetched by a small JSON call from the `RaiseButton` island.
- **Consequences:** Fresh comments and counts with stable cache hit rates.

## D-008 · Preact for all interactive islands, including the editor

- **Date:** 2026-11-11 · **Status:** accepted
- **Context:** Interactive parts are small (raise button, comment form, report button) plus the Tiptap editor. React would add about 40 KB; Preact adds about 3 KB and runs Tiptap's React bindings through `preact/compat`.
- **Decision:** `@astrojs/preact`; islands live in `src/islands/`; everything else is plain Astro HTML.
- **Consequences:** Minimal JavaScript on article pages, which protects Core Web Vitals.

## D-009 · Social share images generated at build time

- **Date:** 2026-11-11 · **Status:** accepted (modifies the "dynamic `/og/[slug].png` with `@vercel/og`" suggestion)
- **Context:** `@vercel/og` targets Vercel; its engine (Satori) runs anywhere, but rendering an image per request can exceed the free Worker's 10 ms CPU.
- **Decision:** `astro-og-canvas` generates `/og/[slug].png` for editorial posts during the build. Community posts use their cover image resized through Cloudflare Images (5,000 transformations/month free) with a branded static fallback.
- **Consequences:** Zero request-time cost; community share images are slightly less customised.

## D-010 · Tailwind v4 with design tokens in `@theme`

- **Date:** 2026-11-11 · **Status:** accepted
- **Context:** `astro add tailwind` installs Tailwind v4 (`@tailwindcss/vite`), which configures through CSS rather than `tailwind.config.js`.
- **Decision:** Tokens (`#FAFAFA` page, `#292929` ink, `#6B6B6B` muted, `#E6E6E6` line, `#1A8917` accent, serif body 20 px / 1.65, 680 px measure) are declared once in `src/styles/global.css` under `@theme`, and the Typography plugin is loaded with `@plugin`.
- **Consequences:** No JS config file; utilities such as `bg-page` and `text-ink` are generated from tokens; dark mode later is a token override.

## D-011 · AdSense first, community second

- **Date:** 2026-11-11 · **Status:** accepted
- **Context:** Google holds the site owner responsible for all content, including user-generated pages; "low value content" is the top rejection reason.
- **Decision:** Apply with 25 to 30 editorial posts (end of Phase 2). Build community features behind the `community_open` flag during review. Open community posting only after status "Ready", and gate `index_allowed` / `ads_allowed` per post on moderation quality.
- **Consequences:** Income starts earlier and the approval risk from user content is removed from the first review.

## D-012 · Project folder lives inside OneDrive for now

- **Date:** 2026-11-11 · **Status:** accepted with a caveat
- **Context:** The owner's working folder is under OneDrive. `node_modules` and `dist` generate thousands of small files that OneDrive tries to sync, which slows installs and can lock files.
- **Decision:** Keep the project here so it sits next to the plan. Recommended follow-up: exclude `tech-blog/node_modules`, `dist` and `.wrangler` from OneDrive sync, or move the repository to a non-synced folder such as `C:\dev\tech-blog` once it is on GitHub.
- **Consequences:** Possible slow `npm install` until the folder is excluded or moved.

## D-013 · R2 deferred to Phase 3

- **Date:** 2026-11-11 · **Status:** accepted
- **Context:** Enabling R2 requires a payment method on file even though the 10 GB allowance is free. R2 is used only for community image uploads, which arrive in Phase 3. The owner prefers not to add a card yet.
- **Decision:** Remove the `MEDIA` binding and its health check until Phase 3. Editorial images stay in the repo and are optimised at build time. Re-add the binding when community uploads are built.
- **Consequences:** Phases 0 to 2 need no card anywhere. Phase 3 starts with a 5-minute R2 enablement step. If the owner still declines a card then, the fallback is an outside free image host (Cloudinary free tier) behind the same upload route.

## D-014 · Public contact address on the domain, forwarded to Gmail

- **Date:** 2026-11-12 · **Status:** accepted
- **Context:** AdSense reviewers expect visible, working contact details. Putting the owner's personal Gmail on every page invites spam and ties the site to a personal account.
- **Decision:** Show `hello@trutiai.in` on the site; forward it to the owner's Gmail with Cloudflare Email Routing (free). The contact form delivers to `CONTACT_TO` (the Gmail) through Resend.
- **Consequences:** One 5-minute owner task (SETUP-GUIDE §13). Until it is done, mail to the public address bounces, so the task is on the Phase 1 checklist.

## D-015 · Ad units render nothing until approval

- **Date:** 2026-11-12 · **Status:** accepted
- **Context:** Placeholder ad boxes before approval are a known rejection trigger, yet layouts must reserve space to avoid layout shift later.
- **Decision:** `AdSlot` is placed in the article template now but outputs no HTML unless `ADS_ENABLED=true` and `ADSENSE_CLIENT` are set. The verification meta tag is likewise emitted only when `ADSENSE_CLIENT` is set.
- **Consequences:** Phase 4 is a config change plus slot ids, not a template change.
