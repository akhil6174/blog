# Progress tracker

**Current phase: 1 — Foundation site live at https://trutiai.in (2026-11-12); owner inputs pending, then Phase 2 writing and Phase 3 build.**
Phases, goals and "done when" criteria come from `../Tech Blog Build Plan v2.md` (Part 3). Tick a box only when the item is verified, not just written.

| Phase | Goal | Status |
|---|---|---|
| 0 | Accounts, domain, Astro project | **Complete** (2026-11-12, site live at https://trutiai.in) |
| 1 | Foundation site: layout, legal pages, SEO plumbing, search, analytics | Code done; owner inputs and live checks pending |
| 2 | 25 to 30 original posts, indexed | Not started |
| 3 | AdSense application + community features behind a flag | Not started |
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

## Verification log

| Date | Check | Result |
|---|---|---|
| 2026-11-11 | `npm run build` | Pass: `dist/client/index.html`, `sitemap-index.xml`, `robots.txt`, `dist/server/entry.mjs` |
| 2026-11-11 | `npm run preview` → `GET /` | 200, home renders with design tokens (screenshot checked) |
| 2026-11-11 | `npm run preview` → `GET /api/health` | `{"d1":true,"kv":true,"r2":true,"workflow":true,"ai":false}`. AI was false only because the binding was temporarily removed for an unauthenticated local run (it proxies to Cloudflare and needs `wrangler login`). Binding restored afterwards. Expect `ai: true` after login. |
| 2026-11-11 | `GET /robots.txt`, `GET /sitemap-index.xml` | 200, 200 |
| 2026-11-12 | `npm run preview` → `GET /api/health` with Wrangler logged in and real ids | `{"ok":true,"checks":{"d1":true,"kv":true,"ai":true,"workflow":true}}` |
| 2026-11-12 | Live: 14 routes on https://trutiai.in and https://www.trutiai.in | All 200, unknown path 404, health all true, CF-Cache-Status HIT on home, canonical + robots correct on the article |
