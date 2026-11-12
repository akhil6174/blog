# Changelog

All notable changes to this project. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Add entries under **Unreleased** with the date; cut a version when a phase completes.

## [Unreleased]

### 2026-11-12 · Phase 1: foundation site

**Added**
- Content collections (`src/content.config.ts`): `posts` with a strict schema (title, description 50-160 chars, tags 1-5, cover requires alt) and `authors`; one welcome post, two draft sample posts, the author profile.
- Pages: home with featured + latest + pagination, `/page/[page]`, `/blog/[slug]`, `/topics`, `/tag/[slug]`, `/author/[handle]`, `/search` (Pagefind), 404, About, Contact, Privacy, Terms, Disclaimer, Editorial policy, Community guidelines.
- Components: Header, Footer, PostCard, AuthorCard, AdSlot (renders nothing until `ADS_ENABLED=true`), TableOfContents, Pagination; `PageLayout` for text pages.
- SEO: `BaseLayout` emits canonical, robots, Open Graph, Twitter, article dates, JSON-LD; `src/lib/seo.ts` builders; RSS at `/rss.xml`; sitemap filter; `robots.txt` sitemap line; build-time share images via `astro-og-canvas` at `/og/<slug>.png`; `public/og-default.png`.
- `POST /api/contact`: honeypot, Turnstile verification, Resend delivery, clear 503 when not configured.
- `scripts/check-content.mjs` (`npm run check:content`): word counts, missing description/alt, heading order, internal links, thin tags.
- `wrangler.jsonc` vars: `ADSENSE_CLIENT`, `ADS_ENABLED`, `CONTACT_TO`. Pagefind runs as `postbuild`.
- Placeholder images: `src/assets/images/cover-default.png`, `avatar-akhil.png`.
- SETUP-GUIDE §13: Cloudflare Email Routing for `hello@trutiai.in`.

**Changed**
- `src/lib/site.ts`: domain, contact addresses, topics list, legal "last updated" date.
- `global.css`: Typography plugin colours mapped to tokens; `prose-article` utility styles headings, code, tables.

**Verified (local preview, 2026-11-12)**
- 20 routes return the expected status (all 200, unknown path 404); article head has canonical, robots, OG image, published time; JSON-LD contains Article, Person, Organization, BreadcrumbList; `/og/welcome-to-trutiai.png` renders; `/api/contact` returns 503 with guidance while Resend is unconfigured; Pagefind indexes article bodies only.

**Fixed**
- Share image route renamed to `[...slug].ts`: `astro-og-canvas` appends `.png` itself, so the earlier name produced `.png.png`.
- First Workers Builds run failed with `npm ci` "Missing: @emnapi/core ... from lock file": the lock file generated incrementally on Windows lacked the nested dependencies of the wasm fallback packages (sharp, rolldown, Tailwind oxide). Regenerated `package-lock.json` from scratch with `--include=optional`; `npm ci --dry-run` now passes. If this recurs after adding packages on Windows, run `rm -rf node_modules package-lock.json && npm install --include=optional`.


### 2026-11-12 · Phase 0: real Cloudflare resources wired

**Changed**
- `wrangler.jsonc`: real D1 `database_id` and KV `id` pasted; `ADMIN_EMAILS` set to the owner's Gmail; `SITE_URL` set to `https://trutiai.in` (also the default in `astro.config.mjs`).
- `src/lib/site.ts`: site name set to `TrutiAI` after the domain.
- First commit pushed to https://github.com/akhil6174/blog.

**Verified**
- `/api/health` with the account logged in: D1, KV, AI and Workflow all `true`.

### 2026-11-11 · Phase 0: project setup

**Added**
- Astro 7 project scaffolded (`npm create astro` minimal template) with the Cloudflare adapter 14, Tailwind v4 + Typography plugin, Preact and the sitemap integration.
- `wrangler.jsonc` with every binding the plan needs: D1 `DB`, R2 `MEDIA`, KV `CACHE`, Workers AI `AI`, Workflow `MODERATION` (class `ModeratePost`), hourly cron trigger, static assets, and non-secret `vars` (`SITE_URL`, `AI_MODEL_DEFAULT`, `AI_SAFETY_FALLBACK_MODEL`, `ADMIN_EMAILS`).
- `src/worker.ts`: custom Worker entry that re-exports Astro's handler, adds a `scheduled` cron handler and a stub `ModeratePost` Workflow (two steps, returns `unsure`).
- `GET /api/health`: on-demand route reporting D1, KV, R2, AI and Workflow binding status.
- `src/layouts/BaseLayout.astro`, `src/lib/site.ts` and a placeholder home page using the design tokens.
- Design tokens in `src/styles/global.css` (`@theme`): page, surface, ink, muted, line, accent colours; serif/sans/mono stacks; 680 px measure; `prose-article` utility.
- `public/robots.txt` allowing all crawlers (including `Mediapartners-Google`) and blocking `/api`, `/admin`, `/write`, `/drafts`, `/search`.
- `.dev.vars.example` listing every secret the later phases need; `.gitignore` excluding secrets and build output.
- `.claude/launch.json` so the desktop app can start `npm run preview` / `npm run dev`.
- Project tracking: `CLAUDE.md`, `docs/DECISIONS.md` (D-001 to D-012), `docs/PROGRESS.md`, `docs/ARCHITECTURE.md`, `docs/FILES.md`, this changelog, and a rewritten `README.md`.

- `docs/SETUP-GUIDE.md`: platform-by-platform registration guidebook with a credentials vault table (which value comes from where and goes where).
- `wrangler.jsonc` vars: `TURNSTILE_SITE_KEY` and `CF_WEB_ANALYTICS_TOKEN` placeholders (public values; secrets stay in `.dev.vars` / `wrangler secret`).

**Changed**
- R2 `MEDIA` binding and its health check removed until Phase 3 (D-013); enabling R2 needs a card on file and nothing before Phase 3 uses it.
- `astro.config.mjs`: `site` from `SITE_URL`, `output: 'static'`, adapter `imageService: 'compile'` and `prerenderEnvironment: 'node'`, sitemap filter for private routes.

**Fixed**
- `/api/health` first returned 500: Astro 6+ removed `Astro.locals.runtime.env`. Bindings are now read with `import { env } from 'cloudflare:workers'` (this is the convention for every route from now on).

**Verified**
- `npm run build` succeeds and emits `dist/client` (static) and `dist/server` (Worker).
- Local preview: `/` renders (200); `/api/health` reports D1, KV, R2 and Workflow reachable in the local emulator; `robots.txt` and `sitemap-index.xml` served. Details in PROGRESS.md.
- `git init` on branch `main`; nothing committed yet.

**Known limitations (expected at this stage)**
- D1 `database_id` and KV `id` are placeholders until the resources are created with Wrangler (owner task).
- `npm run dev` / `npm run preview` need `npx wrangler login` once because the Workers AI binding proxies to Cloudflare.
- The moderation Workflow is a stub; Phase 3 implements the five real steps.
