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

## D-016 · Own Tiptap JSON renderer instead of @tiptap/html

- **Date:** 2026-11-15 · **Status:** accepted
- **Context:** `@tiptap/html` renders through a DOM; its browser build throws in Workers and its server build uses happy-dom, which needs Node's `vm` module that Workers do not provide.
- **Decision:** `src/lib/render-doc.ts` renders the exact node and mark set the editor allows (headings, paragraphs, lists, quotes, code blocks, links, images, YouTube, rules) to HTML and plain text, then `sanitize-html` runs as a second guard. Heading ids are generated for the table of contents.
- **Consequences:** No DOM dependency, deterministic output, unit-tested. Adding a new editor extension means adding a case to the renderer (the test file lists them).

## D-017 · Local auth testing without Google

- **Date:** 2026-11-15 · **Status:** accepted
- **Context:** Google OAuth cannot run against localhost without the owner's client credentials, and Better Auth sets Secure cookies whenever `SITE_URL` is https.
- **Decision:** `.dev.vars` may set `AUTH_DEV_LOGIN=true` (enables Better Auth email/password only in that environment) and override `SITE_URL=http://127.0.0.1:4321`. In production, if `BETTER_AUTH_SECRET` is missing the auth routes answer 503 instead of running on a fallback secret.
- **Consequences:** The whole write/moderate/admin flow is testable with curl or Playwright locally; production never runs with forgeable sessions.

## D-018 · Invite-only writing via roles and an invited-emails setting

- **Date:** 2026-11-15 · **Status:** accepted
- **Context:** The plan tests community publishing with a few invited writers while AdSense reviews the site.
- **Decision:** While `community_invite_only` is true, new sign-ups get the `reader` role; emails in the `invited_emails` setting (or promoted from `/admin`) get `writer`. `community_open` separately controls whether published community posts are visible to the public and indexable.
- **Consequences:** Two independent switches: who may write, and whether the world can read. Both change from `/admin` without a deploy.

## D-019 · Edge caching lives in the middleware, keyed by path

- **Date:** 2026-11-15 · **Status:** accepted
- **Context:** Astro pages cannot easily wrap their own response in the Cache API; the plan wants community HTML cached for 10 minutes and purged on edit.
- **Decision:** The middleware caches GET responses for `/community`, `/p/*`, `/writer/*`, `/top` and the community sitemap (`src/lib/cache.ts`), and publish/edit/unpublish call `purgePostCaches`. Comments load through a server island and raises through JSON, so those never purge (D-007).
- **Consequences:** Worker CPU per cached hit is about a millisecond and D1 is not touched. Personal state on those pages is fetched client-side.

## D-020 · Own block handle instead of Tiptap's drag-handle extension

- **Date:** 2026-11-16 · **Status:** accepted
- **Context:** `@tiptap/extension-drag-handle` (MIT) imports the real-time collaboration package and Yjs at runtime, which we do not use.
- **Decision:** `src/islands/editor/blockOps.ts` implements find/move/duplicate/delete/insert-below on ProseMirror directly, and `BlockHandle.tsx` starts a native drag by setting a node selection and `view.dragging`, so ProseMirror's own drop handling moves the block.
- **Consequences:** No Yjs in the bundle; block operations are shared by the handle menu, the left rail and keyboard shortcuts.

## D-021 · Editor options are built once

- **Date:** 2026-11-16 · **Status:** accepted (bug fix, recorded so it is not reintroduced)
- **Context:** Passing a new extensions array to `useEditor` on each render makes Tiptap destroy and recreate the editor, which renders again: an endless loop that froze the page on the first keystroke.
- **Decision:** Extensions are created with `useMemo(..., [])` and `useEditor(options, [])`. Changing callbacks reach the extensions through refs.
- **Consequences:** Any new editor option that depends on state must also go through a ref, never through the options object. The same applies to `BubbleMenu`'s `shouldShow` (module-level function): a new function per render made it re-register its plugin in a loop that crashed the tab.

## D-022 · Browser end-to-end checks with Playwright

- **Date:** 2026-11-16 · **Status:** accepted
- **Context:** The editor is interactive (keyboard, selection, drag, timers). The desktop app's hidden browser pane throttles timers and cannot drive it reliably.
- **Decision:** `tests/e2e/editor.e2e.mjs` runs headless Chromium against `npm run preview` with the local dev login, checks each feature, and saves screenshots. A localhost-only `window.__editor` hook lets the script read the document.
- **Consequences:** `@playwright/test` is a dev dependency (Chromium downloads once per machine). Run it after every editor change.

## D-023 · Uploaded images live in KV until R2 is enabled

- **Date:** 2026-11-16 · **Status:** accepted (supersedes the "D1 fallback" idea in EDITOR-PLAN.md)
- **Context:** Writers need to upload images from their device. R2 needs a card on file (D-013). D1 can store blobs but returns them as number arrays that cost Worker CPU to convert; KV stores binary natively.
- **Decision:** The browser resizes and compresses (WebP, JPEG fallback; covers cropped to 1200 × 630, body images max 1600 px wide). `POST /api/media` checks the real file type from its first bytes, caps size at 2 MB and uploads at 40 per writer per day, and stores the file in the `CACHE` KV namespace as `media:<id>`. `GET /media/<id>.<ext>` serves it with a one-year immutable edge cache.
- **Consequences:** Free up to 1 GB (about 6,000 images) and 1,000 KV writes a day (two per upload). When R2 is enabled, move the files and switch the two routes; image paths stay the same. Image URLs pasted as links still hotlink the original site.

## D-024 · Minimum 600 words, no maximum

- **Date:** 2026-11-16 · **Status:** accepted (owner request)
- **Context:** AdSense rejects thin content; the site already required 600 words before a community article is indexable.
- **Decision:** `min_words` default is 600 for submission, the editor shows a progress bar toward it, and `npm run check:content` fails editorial posts under 600. Article length has no upper limit (only title, subtitle and summary are capped, for search-result display).
- **Consequences:** Every published article meets the indexing length. The welcome post (241 words) must be expanded before the AdSense application.

## D-025 · AI summary: one field, writer's edits are protected

- **Date:** 2026-11-16 · **Status:** accepted
- **Context:** The brief asked for an AI-generated SEO summary that refreshes when the article changes but never overwrites the writer's own text.
- **Decision:** One summary field (meta description and card text). `POST /api/ai/summary` uses the settings model with a generous output budget and one retry; answers are cleaned (forbidden openers, dangling endings, cut at a sentence or clause under 160 characters). The post stores `summary_source` (`ai` or `user`) and `summary_basis` (sentence fingerprints). After a 4-second pause the editor generates the first summary at 300 words, silently refreshes an AI summary when more than 30 % of the sentences changed (at most every 2 minutes), and only shows a "refresh?" note for a writer's own summary. Manual regenerate over a writer's summary asks first. 30 generations per writer per day.
- **Consequences:** About 45 to 90 neurons per generation. gpt-oss needs a large output budget because hidden reasoning counts against it; the moderation quality step was raised to the same budget.

## D-026 · URL slug follows the title until edited, locked after publishing

- **Date:** 2026-11-16 · **Status:** accepted
- **Context:** Changing a published URL breaks links and loses search ranking.
- **Decision:** The editor derives the slug from the title until the writer edits it; the server applies requested slugs only while `published_at` is empty, and a taken slug keeps the previous one with a warning instead of failing the save. No redirects yet, so even admins cannot change a published slug.
- **Consequences:** Stable public URLs. A redirect table can be added later if admins need to rename published posts.

## D-027 · Image URLs are imported, not hotlinked

- **Date:** 2026-11-16 · **Status:** accepted
- **Context:** Hotlinked images break when the other site changes, let that site track readers, and skip our compression.
- **Decision:** `GET /api/media/import?url=` (signed-in writers) fetches the image server-side and returns the bytes; the browser then crops/compresses it and uploads a copy through the normal `POST /api/media`. Safety: http(s) on standard ports only, no credentials, no IP literals or local names (`checkImportUrl`), the Worker's `global_fetch_strictly_public` flag blocks private destinations, redirects re-checked (max 3), 10 s timeout, 8 MB cap enforced while streaming, real file type checked (JPG, PNG, WebP, GIF; GIF becomes WebP). Linking as-is stays available only after a failed import, with a warning.
- **Consequences:** Imported images count toward the writer's daily upload limit and KV storage (D-023). Writers are reminded to use only images they have the right to publish.

## D-028 · No AI writing assistant in the article body

- **Date:** 2026-11-16 · **Status:** accepted (owner decision; cancels step D of EDITOR-PLAN.md)
- **Context:** The plan proposed a selection-only assistant (grammar, rewrite, simplify, titles, headings). The owner does not want AI writing inside articles.
- **Decision:** The article body stays entirely human-written; no assistant is built. AI remains only where it does not write article text: the summary/meta description in the settings panel (D-025) and moderation (D-004).
- **Consequences:** Simpler editor and no extra Workers AI spend. Supports the editorial policy and AdSense's preference for original, human-edited content. Revisit only if the owner asks.

## D-029 · Your articles are published from the editor as Markdown commits

- **Date:** 2026-11-16 · **Status:** accepted
- **Context:** Writing 25 to 30 articles as Markdown files with git is slow for the owner; the editor is far easier. Serving editor articles from D1 at `/blog/` would mean making the home page, topics, RSS, sitemap and search dynamic.
- **Decision:** Admin articles are `kind = editorial`. "Publish to blog" saves, validates with the same rules the content collection enforces, converts the Tiptap document to Markdown (`src/lib/markdown.ts`) with front matter, and commits `src/content/posts/<slug>.md` through the GitHub Contents API (`src/lib/github.ts`, fine-grained token on this repo only). The push triggers Workers Builds; the article becomes a normal static page with listings, RSS, sitemap, Pagefind and a share image. Update re-commits (adds `updatedDate`); Unpublish deletes the file (the slug stays reserved). Scheduling stores `scheduled_at`; the cron now runs every 15 minutes and publishes due articles (Top 10 and housekeeping still once an hour). Files carry an editor marker so a hand-written Markdown post with the same name is never overwritten. `GITHUB_DRY_RUN=true` (local only) keeps everything off GitHub for testing.
- **Consequences:** Two to three minutes from Publish to live. The repository is the record of published articles; the D1 row stays the editable source. Hand-written Markdown posts (like the welcome post) are not editable in the editor.

## D-030 · Essential improvements: what was built, what already existed, what waits

- **Date:** 2026-11-16 · **Status:** accepted
- **Context:** The owner shared a 16-section "Essential Product Improvements" list and asked to add whatever was missing and worth it. The site is AdSense-first with one admin and community posting closed (D-005), on the free plan.
- **Already in place:** Tiptap editor with Markdown shortcuts, tables, lists, quotes, code; autosave with status and local recovery; image upload with alt text, captions and compression; preview, word count, reading time, focus mode, shortcuts, templates; submission, AI moderation and review queue; scheduling; Better Auth sessions, backend role checks, Zod validation, HTML sanitising, Turnstile, per-user limits; canonical URLs, sitemaps, robots.txt, Article and Breadcrumb structured data, Open Graph images, clean locked slugs, noindex for unpublished and unapproved content; RSS; search (Pagefind); related articles; comments, replies, raises, reports; Top 10.
- **Built now:** version history and restore, optimistic locking (`posts.version`), technical metadata and reader technical reports with email notice, contributor dashboard sections, withdraw, trash and restore, profile and website link, request changes with required reasons, audit log, export, bulk invites, emergency switches, database backup script.
- **Waiting, and why:**
  - Extra roles (Super Admin, Editor, Moderator): there is one admin; the four existing roles cover it. Add when a second editor joins.
  - Reviewer assignment, inline editorial comments: need more than one editor.
  - Newsletter, notification centre, follows, bookmarks, reading history: need Resend and an audience; revisit after AdSense approval.
  - Media library with duplicate and unused detection: KV listing costs list operations and images are few; revisit when uploads grow or R2 is enabled (D-013).
  - Redirect manager: published slugs are locked (D-026), so nothing redirects yet.
  - Staging environment: a second Worker plus D1 database doubles setup for one person; local preview with dry-run publishing covers it for now.
  - Admin two-factor: sign-in is Google-only, so turn on Google 2-Step Verification for the admin account instead (SETUP-GUIDE §16).
  - AVIF conversion: the browser already compresses to WebP before upload; Workers cannot convert images within the free CPU limit.
  - Everything in the list's "postpone" section (RAG, knowledge graph, playgrounds, AI writing agents, Q&A, gamification).
- **Consequences:** One more migration (`0003_essentials`) for production. The trash is purged by the hourly cron after 30 days. Technical reports go to `CONTACT_TO` by email once `RESEND_API_KEY` is set; until then they appear only on `/admin`.

