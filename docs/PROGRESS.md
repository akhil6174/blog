# Progress tracker

**Current phase: 0 — Accounts, domain and project setup.**
Phases, goals and "done when" criteria come from `../Tech Blog Build Plan v2.md` (Part 3). Tick a box only when the item is verified, not just written.

| Phase | Goal | Status |
|---|---|---|
| 0 | Accounts, domain, Astro project | In progress (code done, owner tasks pending) |
| 1 | Foundation site: layout, legal pages, SEO plumbing, search, analytics | Not started |
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
- [x] Buy the domain: **trutiai.in** bought at GoDaddy (2026-11-12). Nameservers switched to Cloudflare, propagation pending
- [x] Run `npx wrangler login` once on this PC (done 2026-11-11)
- [x] Create resources and paste the ids into `wrangler.jsonc` (D1 `tech-blog-db` and KV `CACHE` created 2026-11-11; ids pasted and `ADMIN_EMAILS` set 2026-11-12)
  - R2 bucket: deferred to Phase 3 (needs a card on file; see D-013)
- [ ] Create a Google Cloud project and an OAuth client (Web application); keep the id and secret in a password manager (used in Phase 3)
- [x] GitHub repository created: https://github.com/akhil6174/blog (pushed 2026-11-12)
- [ ] Connect it in Cloudflare → Workers & Pages → Create → Import a repository (Workers Builds). Build command `npm run build`, deploy command `npx wrangler deploy`
- [ ] Add the custom domain to the Worker (Settings → Domains & Routes) once the zone is Active. `SITE_URL=https://trutiai.in` is already set in `wrangler.jsonc`; set the same build variable in Workers Builds
- [ ] Create the Search Console property for the domain (DNS verification)
- [ ] Exclude `tech-blog/node_modules`, `dist`, `.wrangler` from OneDrive sync, or move the repo to a non-synced folder (see D-012)

### Phase 0 done when
- [ ] `https://yourdomain.com/` shows the placeholder home with a valid HTTPS padlock
- [ ] `https://yourdomain.com/api/health` returns `"ok": true` with every check `true`
- [ ] A `git push` to `main` triggers a Workers Builds deploy

## Phase 1 (preview of the checklist; full list in the plan)
- [ ] Layout and design system applied site-wide
- [ ] About, Contact (Turnstile + Resend), Privacy, Terms, Disclaimer, Editorial Policy, Community Guidelines
- [ ] Post pages, listings, tag and author pages, pagination
- [ ] SEO head tags, JSON-LD, sitemap, RSS, robots with sitemap line, 404
- [ ] Build-time share images (`/og/[slug].png`)
- [ ] Pagefind search
- [ ] Cloudflare Web Analytics, Sentry
- [ ] PageSpeed mobile ≥ 90, link checker clean, sitemap "Success" in Search Console

## Verification log

| Date | Check | Result |
|---|---|---|
| 2026-11-11 | `npm run build` | Pass: `dist/client/index.html`, `sitemap-index.xml`, `robots.txt`, `dist/server/entry.mjs` |
| 2026-11-11 | `npm run preview` → `GET /` | 200, home renders with design tokens (screenshot checked) |
| 2026-11-11 | `npm run preview` → `GET /api/health` | `{"d1":true,"kv":true,"r2":true,"workflow":true,"ai":false}`. AI was false only because the binding was temporarily removed for an unauthenticated local run (it proxies to Cloudflare and needs `wrangler login`). Binding restored afterwards. Expect `ai: true` after login. |
| 2026-11-11 | `GET /robots.txt`, `GET /sitemap-index.xml` | 200, 200 |
| 2026-11-12 | `npm run preview` → `GET /api/health` with Wrangler logged in and real ids | `{"ok":true,"checks":{"d1":true,"kv":true,"ai":true,"workflow":true}}` |
