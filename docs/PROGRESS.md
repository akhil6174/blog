# Progress tracker

**Current phase: 3 — Community publishing built behind the flag (code complete 2026-11-15); Phase 2 writing runs in parallel; owner tasks below unlock testing on trutiai.in.**
Phases, goals and "done when" criteria come from `../Tech Blog Build Plan v2.md` (Part 3). Tick a box only when the item is verified, not just written.

| Phase | Goal | Status |
|---|---|---|
| 0 | Accounts, domain, Astro project | **Complete** (2026-11-12, site live at https://trutiai.in) |
| 1 | Foundation site: layout, legal pages, SEO plumbing, search, analytics | Code done; owner inputs and live checks pending |
| 2 | 25 to 30 original posts, indexed | Not started |
| 3 | AdSense application + community features behind a flag | Code done (2026-11-15); production migration, secrets and writer tests pending; AdSense application waits for Phase 2 content |
| 4 | Ads live, community opens gradually | Not started |
| 5 | Growth and monetization ladder | Not started |

## Phase 0

### Done by Claude Code (2026-11-11)
- [x] Astro project created with Cloudflare adapter, Tailwind + Typography, Preact, sitemap
- [x] `wrangler.jsonc` with D1, R2, KV, AI, Workflows, cron, assets and vars
- [x] Custom Worker entry with cron handler and stub `ModeratePost` Workflow
- [x] `/api/health` route
- [x] Placeholder home page on the design tokens
- [x] `robots.txt`, `.dev.vars.example`, `.gitignore`, `.claude/launch.json`
- [x] Tracking docs: CLAUDE.md, DECISIONS, CHANGELOG, PROGRESS, ARCHITECTURE, FILES, README
- [x] `npm run build` passes
- [x] Local preview verified for `/` and `/api/health` (result recorded below)
- [x] `git init` done (branch `main`); first commit pending the owner's go-ahead

### Owner tasks (cannot be done by Claude: accounts, payments, OAuth)
Click-by-click instructions for each item are in [SETUP-GUIDE.md](SETUP-GUIDE.md).
- [ ] Create accounts: Cloudflare, GitHub, Google (the Gmail you will keep for AdSense), OpenAI, Resend, Sentry
- [x] Buy the domain: **trutiai.in** bought at GoDaddy (2026-11-12). Nameservers active on Cloudflare (anton/zelda.ns.cloudflare.com) since 2026-11-12 evening
- [x] First deploy via Workers Builds (2026-11-12 23:15 IST) after deleting GoDaddy's parking A/CNAME records; custom domains attached by `wrangler.jsonc` routes
- [x] Run `npx wrangler login` once on this PC (done 2026-11-11)
- [x] Create resources and paste the ids into `wrangler.jsonc` (D1 `tech-blog-db` and KV `CACHE` created 2026-11-11; ids pasted and `ADMIN_EMAILS` set 2026-11-12)
  - R2 bucket: deferred to Phase 3 (needs a card on file; see D-013)
- [ ] Create a Google Cloud project and an OAuth client (Web application); keep the id and secret in a password manager (used in Phase 3)
- [x] GitHub repository created: https://github.com/akhil6174/blog (pushed 2026-11-12)
- [x] Connect it in Cloudflare → Workers & Pages → Create → Import a repository (Workers Builds). Build command `npm run build`, deploy command `npx wrangler deploy`
- [x] Custom domains `trutiai.in` and `www` attached; `SITE_URL` set
- [ ] Create the Search Console property for the domain (DNS verification)
- [ ] Exclude `tech-blog/node_modules`, `dist`, `.wrangler` from OneDrive sync, or move the repo to a non-synced folder (see D-012)

### Phase 0 done when
- [ ] `https://yourdomain.com/` shows the placeholder home with a valid HTTPS padlock
- [ ] `https://yourdomain.com/api/health` returns `"ok": true` with every check `true`
- [x] Push to `main` triggers a Workers Builds deploy

## Phase 1

### Done by Claude Code (2026-11-12)
- [x] Design system applied: tokens in `global.css`, Typography plugin mapped to tokens, 680 px measure, serif body
- [x] Layout: sticky header with nav + search, footer with legal links, skip link, `PageLayout` for text pages
- [x] Content collections: `posts` (Markdown, strict schema) and `authors` (JSON); drafts excluded in production
- [x] Pages: home (featured + latest + pagination), `/page/N/`, `/blog/[slug]/`, `/topics/`, `/tag/[slug]/` (noindex under 3 posts), `/author/[handle]/` (noindex with 0 posts), `/search/` (Pagefind), 404
- [x] Article page: byline, dates, reading time, TOC over 1,200 words, author box, prev/next, related posts, ad slot placeholders (render nothing until Phase 4)
- [x] SEO: unique titles/descriptions, canonical, robots, Open Graph, Twitter, JSON-LD (WebSite, Article, Person, BreadcrumbList), RSS, sitemap (private routes filtered), robots.txt with sitemap line
- [x] Share images generated at build time at `/og/<slug>.png`; branded fallback `/og-default.png`
- [x] Legal and policy pages: About, Contact, Privacy (with Google's required advertising disclosures), Terms, Disclaimer, Editorial policy, Community guidelines
- [x] Contact form: honeypot, Turnstile (when configured), Resend delivery (when configured), graceful 503 otherwise
- [x] Analytics (Cloudflare Web Analytics) and AdSense meta tag render only when their vars are set
- [x] `npm run check:content` quality script
- [x] All routes verified locally (status codes, head tags, JSON-LD, share image)

### Owner inputs needed (then Claude finishes Phase 1)
- [ ] A real bio (2 to 3 sentences) and photo for `src/content/authors/akhil.json` (the placeholder text says "PLACEHOLDER BIO")
- [ ] Confirm or change the five topics in `src/lib/site.ts` (`SITE.topics`)
- [ ] Set up Email Routing for `hello@trutiai.in` (SETUP-GUIDE §13) or tell Claude a different public address
- [ ] Resend: domain verified, API key → `npx wrangler secret put RESEND_API_KEY`
- [ ] Turnstile widget: site key into `wrangler.jsonc` vars, secret → `npx wrangler secret put TURNSTILE_SECRET_KEY`
- [ ] Web Analytics token into `wrangler.jsonc` vars
- [ ] Sentry DSN (error alerts are wired in Phase 3 together with the first interactive code)

### Phase 1 done when (checked on the live domain)
- [ ] Every page in the navigation and footer loads with no broken links
- [ ] Contact form delivers an email to your inbox
- [ ] PageSpeed Insights mobile score 90 or higher
- [ ] Search Console: sitemap submitted and status "Success"

## Phase 3

### Done by Claude Code (2026-11-15)
- [x] D1 schema (Drizzle): Better Auth tables + posts, post_revisions, post_stats, raises, tags, post_tags, comments, reports, moderation_log, settings; migration `drizzle/0000_init.sql`
- [x] Better Auth: Google sign-in (when configured), roles reader/writer/trusted/admin, admin from `ADMIN_EMAILS`, invite-only mode, dev email login for local tests, production guard when `BETTER_AUTH_SECRET` is missing
- [x] `/signin`, `/me` (my articles, sign out, delete account), `/write` (Tiptap on Preact: autosave every 10 s, submit), `/write/status/<id>` (live status)
- [x] `POST /api/posts`: validation (Zod), slugs, revisions, tags, daily limits, Turnstile, starts the Workflow
- [x] Moderation Workflow (5 durable steps): rules → OpenAI Moderation (Llama Guard fallback) → Workers AI quality (gpt-oss-20b, strict JSON) → decide → finalize (status, index flag, log, cache purge, email)
- [x] Community: `/community` (hidden until `community_open`), `/p/<slug>` (edge-cached 10 min), `/writer/<handle>`, `/top` (from KV), `/sitemap-community.xml`
- [x] Comments: server island on community and editorial posts, Preact form, same pipeline with lighter rules, one reply level
- [x] Raises: island with 50 cap and 1 s debounce; `GET/POST /api/raise`; counts per post and per day
- [x] View beacon after 10 s with 1-in-5 sampling above the threshold; reports with auto-hide at 3; hourly cron (Top 10 → KV, cache purge, stale drafts)
- [x] Admin dashboard `/admin`: counters, article and comment queues with the AI reasons, reports, writers (invite/promote/trust/ban), settings editor, moderation log, "run hourly job"
- [x] Header shows Write / account / Admin from the live session
- [x] Unit tests (`npm test`): renderer safety, decision logic, verdict parser (10 tests)
- [x] Local end-to-end: sign-in, draft, submit → Workflow decided in ~5 s (rules pass, Llama Guard fallback pass, gpt-oss-20b rejected a repetitive test post); community listing and article cached (MISS → HIT, still HIT after a comment); raise capped at 50; views counted; clean comment published and spam comment rejected; Top 10 populated by the cron; admin gated (anon → sign-in, reader → 403)

### Owner tasks before testing on trutiai.in
- [x] Production D1 migrated by the owner on 2026-11-15 (`wrangler d1 migrations apply --remote`)
- [ ] Change the Workers Builds **deploy command** to `npm run deploy` so future migrations apply automatically
- [x] Production secrets set by the owner on 2026-11-15: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Google sign-in URL generates on the live site)
- [ ] `npx wrangler secret put OPENAI_API_KEY` (until then the harmful-content check uses Llama Guard on Workers AI, which costs neurons)
- [x] Owner signed in with Google on trutiai.in and `/admin` works (2026-11-16; first attempt hit `redirect_uri_mismatch` until `https://trutiai.in/api/auth/callback/google` was saved in the Google client)
- [ ] Invite 3 to 5 test writers from `/admin` and have them submit real articles; review the queue and the moderation log
- [ ] Keep `community_open = false` until AdSense shows "Ready" (plan, Phase 4)

### Phase 3 done when
- [ ] An invited writer goes from sign-in to a published article in under five minutes on trutiai.in
- [ ] A spammy test post is rejected with a reason; a borderline post lands in `/admin`
- [ ] Community URLs send `noindex` while `community_open` is false (check with `curl -I`)
- [ ] Resend notifications arrive (needs `RESEND_API_KEY`)

### Deferred inside Phase 3
- Image uploads to R2 (D-013): writers can embed images by URL for now
- Playwright browser tests: covered by the curl-based end-to-end run; add when the editor UI settles

## Writing page redesign (docs/EDITOR-PLAN.md)

- [x] Step A: block editor (rail, bubble, slash menu, block handle, tables/highlight/underline, templates, stats, cheaper autosave + local recovery, write/split/preview, focus mode, dark theme, status and feedback, confirmations, mobile layout) — 2026-11-16
- [x] Step B: settings panel with AI summary (auto at 300 words, refresh after big changes, writer edits protected), search preview, SEO title, slug rules, category, featured for admin (2026-11-16). Scheduling moves to step E
- [ ] Production: apply migration `0001_step_b_seo_fields` before the step B code is pushed
- [x] Step C (main part): cover and body image upload from the device with crop, zoom and compression, plus paste/drop into the article (2026-11-16). Completed 2026-11-16: image URLs are imported and copied to TrutiAI (cover and body), with link-as-is only as a fallback
- [~] Step D: AI writing assistant — **dropped by the owner (2026-11-16)**: no AI writing inside the article body (D-028)
- [x] Step E: publish your articles from the editor to /blog/ (Markdown commit, static page), update, unpublish, schedule (cron every 15 min) — built 2026-11-16
- [ ] Production: apply migration `0002_step_e_scheduling` and set the `GITHUB_TOKEN` secret (SETUP-GUIDE §15), then push

## Essential improvements (D-030)

- [x] Version history with restore, conflict protection between tabs/devices (2026-11-16)
- [x] Technical details box and front matter; reader "Report a problem" with technical reasons and email notice
- [x] My articles: totals, sections, withdraw, trash/restore, profile with website
- [x] Admin: request changes, required reasons, audit log, trash, export, bulk invites, pause submissions/comments
- [x] `npm run db:backup` and backup/restore guide (SETUP-GUIDE §16)
- [x] Local tests: essentials 33/33, editor 64/64, settings 25/25, images 16/16, publish 22/22, unit 28/28
- [ ] Production: apply migration `0003_essentials` (`npx wrangler d1 migrations apply tech-blog-db --remote`) before or right after the push
- [ ] Owner: turn on Google 2-Step Verification for the admin Google account; run `npm run db:backup` once a week

## Campus Writers Programme and reader features (D-031)

- [x] Explore page `/articles` with search, topic, tags, sort and pages (2026-11-16)
- [x] Bookmarks, share, copy link, upvote undo, no self-upvotes, edit/delete own comments, notifications
- [x] Programme pages behind `programme_open`: campus writers, join us (internship form), leaderboard, reward policy
- [x] Rewards: first-article reward, monthly competition, cap, one prize per writer, suspicious votes, ledger, programme admin
- [x] Local tests: programme 33/33, essentials 33/33, editor 64/64, writer access 5/5
- [ ] Production: apply migration `0004_programme` (`npx wrangler d1 migrations apply tech-blog-db --remote`) before or right after the push
- [ ] Owner: decide programme dates and budget, then set them in `/admin/programme` and switch it on (SETUP-GUIDE §17)

## Verification log

| Date | Check | Result |
|---|---|---|
| 2026-11-11 | `npm run build` | Pass: `dist/client/index.html`, `sitemap-index.xml`, `robots.txt`, `dist/server/entry.mjs` |
| 2026-11-11 | `npm run preview` → `GET /` | 200, home renders with design tokens (screenshot checked) |
| 2026-11-11 | `npm run preview` → `GET /api/health` | `{"d1":true,"kv":true,"r2":true,"workflow":true,"ai":false}`. AI was false only because the binding was temporarily removed for an unauthenticated local run (it proxies to Cloudflare and needs `wrangler login`). Binding restored afterwards. Expect `ai: true` after login. |
| 2026-11-11 | `GET /robots.txt`, `GET /sitemap-index.xml` | 200, 200 |
| 2026-11-12 | `npm run preview` → `GET /api/health` with Wrangler logged in and real ids | `{"ok":true,"checks":{"d1":true,"kv":true,"ai":true,"workflow":true}}` |
| 2026-11-12 | Live: 14 routes on https://trutiai.in and https://www.trutiai.in | All 200, unknown path 404, health all true, CF-Cache-Status HIT on home, canonical + robots correct on the article |
| 2026-11-15 | Local: submit → Workflow | rules pass (7 ms), harmful pass via Llama Guard fallback (1.4 s), quality reject by gpt-oss-20b score 20 (0.9 s), decide, finalize; status visible to the writer in ~5 s |
| 2026-11-15 | Local: community | /community MISS→HIT; /p/<slug> 200 indexable, HIT after a comment; raise 60 → capped 50; 3 view beacons counted; clean comment published, spam rejected; /top filled by cron; sitemap-community lists the post; writer page 200 |
| 2026-11-15 | Local: admin | anon → 302 to sign-in; reader → 302 / API 403; admin 200 with queues, settings, log; run_cron, set_settings, invite OK |
| 2026-11-15 | `npm test` | 10 unit tests pass |
| 2026-11-16 | Editor step A, `node tests/e2e/editor.e2e.mjs` (headless Chromium) | 50/50: typing stays responsive, slash menu, bubble, block move/duplicate/undo, tables, autosave (one request, URL gains id), templates, block handle, preview/split, focus, dark, shortcuts, submit validation, reload persistence, offline error + local recovery, mobile layout. Found and fixed: endless re-render freeze, BubbleMenu re-registration loop, subtitle focus race, clipped title, mobile Split button, dialog Escape race |
| 2026-11-16 | `npm test` | 11 unit tests pass |
| 2026-11-16 | Step E: `npm test` 28; `tests/e2e/publish.e2e.mjs` 22/22 (dry run: publish, Markdown front matter and body, URL lock, not-live note, update with updatedDate, unpublish, publish again, validation, schedule and cancel, non-admin 403, no community review for editorial); scheduler published a due article via the cron handler; the generated Markdown built into a real static page (on home, RSS, sitemap, share image, 879 words); editor 64/64, settings 25/25 (AI mocked), images 16/16 |
| 2026-11-16 | Step C import: `npm test` 23 unit tests; `tests/e2e/images.e2e.mjs` 16/16 (real image from trutiai.in imported for body and cover, cover 1200×630, web page refused 415, 127.0.0.1 and 169.254.169.254 refused 400, 404 explained, signed-out 401, link fallback after failure); editor 64/64, settings 25/25 |
| 2026-11-16 | Step B: `npm test` 19 unit tests; `tests/e2e/settings.e2e.mjs` 25/25 twice with the real gpt-oss-20b (auto summary at 300 words, 125-158 chars, overwrite confirm, stale note for hand-written summary without auto-overwrite, SEO title counter, search preview, slug follows title then sticks, category and featured persist, submit needs a category, no panel overflow); editor e2e 64/64; local publish check: SEO title in title/og, category label, Featured pin, category filter, slug locked after publish |
| 2026-11-16 | Editor e2e after toolbar/upload/minimum changes | 64/64: rail cannot scroll sideways, tooltip outside the rail, rail and settings stay below the top bar after scrolling, 600-word progress bar, body image upload (12.9 KB WebP served with immutable cache), non-image rejected with 415, cover cropped and saved at 1200×630 |
| 2026-11-15 | Live Phase 3 on https://trutiai.in | `/signin` 200; `/api/auth/get-session` → null (auth configured); Google sign-in URL generated; `/admin` and `/write` → 302 to sign-in; `/community` 404 (flag closed); `/top`, `/sitemap-community.xml`, `/api/raise` 200; comments island present on editorial posts. First Phase 3 build had failed on `npm ci` until the lock file was regenerated. |
