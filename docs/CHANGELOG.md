# Changelog

All notable changes to this project. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Add entries under **Unreleased** with the date; cut a version when a phase completes.

## [Unreleased]

### 2026-11-20 · Sign-in goes home; write page light by default; readable dark hovers

- Signing in without a destination now lands on the home page (was the write page). Links that say "Start writing" still go to the editor.
- The editor opens in the light theme even on dark-mode devices; dark is used only after the writer picks it with the moon button.
- Editor dark theme: hover backgrounds (`tint`, `tint-strong`) are dark too, so light text no longer disappears on hover; text on purple buttons is dark for contrast.
- New test `tests/e2e/theme.e2e.mjs` (5 checks, including contrast of every hovered button in dark mode).

### 2026-11-20 · Writer dashboard, ambassador codes, profile links and photo (D-041)

- `/me` is now a dashboard: this month's articles published, views, upvotes and comments (with all-time totals), and four bar charts for the last 12 months (India time). Charts are plain SVG drawn on the server (`BarChart.astro`), with a hidden table for screen readers.
- Campus ambassadors see their college, how many students from it have joined (profile college matches, any letter case, not counting themselves), how many joined this month, and a joins-per-month chart.
- Ambassador codes: on `/admin/ambassadors` the editor creates a one-time `AMB-XXXX-XXXX` code for an open college (copy button, replace). The student enters it under "Have a Campus Ambassador code?" on `/me` and becomes the ambassador; a reader becomes a writer straight away (the cached session cookie is cleared). Assigning by email still works. The admin table shows students joined per college.
- Edit profile: change or remove the profile photo (cropped to a square and shrunk to 400 px in the browser, uploaded as an avatar, any signed-in user, max 400 KB), GitHub and LinkedIn (username or URL, saved as a clean link), and college picked from the college list. An ambassador's college is locked to the college they represent. GitHub and LinkedIn show on the public writer page.
- Migration `0007_profiles_codes`: `colleges.ambassador_code` (unique), `user.github`, `user.linkedin`.
- `src/pages/api/me.ts` moved to `src/pages/api/me/index.ts`; new `POST /api/me/ambassador`.
- Tests: `tests/profile.test.ts`, `tests/e2e/dashboard.e2e.mjs` (24 browser checks).

### 2026-11-20 · Campus ambassadors (D-040)

- `/admin/ambassadors` (linked from `/admin` and the account menu): add colleges one per line (optionally `Name | City | State`, up to 1,000 at a time), assign one ambassador per college by their Google email, mark certificates sent, remove ambassadors, delete open colleges. One ambassador per college and one college per ambassador are enforced by the database.
- Ambassadors get a **Campus Ambassador · college** badge on their public writer page and on `/me`, a notification, and their profile college filled in.
- Public `/students/campus-ambassadors/`: the role, benefits (certificate, name on the site, internship priority), how to get in touch (email; recruitment is on LinkedIn), current ambassadors with their colleges, and colleges still looking for one, grouped by state. Linked from the Students hub.
- Migration `drizzle/0006_colleges.sql`. Tests: `tests/ambassadors.test.ts` (2), `tests/e2e/ambassadors.e2e.mjs` (22).

### 2026-11-20 · Resume builder: ten templates, colours and section order

- Seven new templates: **Executive** (serif, capitalised name, double rule), **Minimal** (no rules, airy), **Developer** (monospace `// headings`), **Engineer** (coloured bar beside headings), **Academic** (serif, short underlines), **Elegant** (serif, centred headings, coloured name) and **Bold** (large name, headings on a light colour band), plus Classic, Modern and Compact. All single-column with real text.
- Students can pick an accent colour (purple, navy, teal, green, maroon, charcoal) for the six colour templates, and put experience before projects. Choices are saved with the resume.
- The renderer is now a set of style options (`src/lib/resume-pdf.ts`); tests cover every template with every colour (unit 19, browser 29).

### 2026-11-20 · Resume builder (D-039)

- `/students/resume-builder/`: fill in a form, see the real PDF update as you type, pick **Classic** (serif, centred), **Modern** (sans-serif, purple headings) or **Compact** (tighter, fits more on one page), and download the PDF. Single-column layouts with selectable text and clickable links (ATS-friendly). No sign-up; the resume is saved only in the browser and never uploaded.
- Warns when the resume runs past one page, and when it contains characters the PDF fonts cannot show (for example Hindi). Phones get an "Open preview" link instead of an inline viewer.
- New dependency `pdf-lib` (loaded only when a preview or download is made); lock file regenerated.
- Added to the Students hub and the tool side panel. Tests: `tests/resume.test.ts` (10), `tests/e2e/resume.e2e.mjs` (17).

### 2026-11-20 · Students section with free tools (D-038)

- New `/students/` hub (linked as "Students" in the header and footer) with three free tools that run in the browser, need no sign-in and work on phones:
  - `/students/attendance-calculator/`: attendance, classes you can miss at a target (75% by default), classes needed to recover, and a plan for the classes left this semester.
  - `/students/cgpa-calculator/`: credit-weighted SGPA from subjects (UGC 10-point grades) and CGPA from semesters; entries are remembered in the browser.
  - `/students/cgpa-to-percentage/`: CGPA × 10, VTU's (CGPA − 0.75) × 10, CGPA × 9.5 and a custom multiplier, with a note to use the university's own rule.
- Each tool page has a worked example, visible FAQs and FAQ, tool and breadcrumb structured data. The maths is in `src/lib/student-tools.ts` with unit tests.
- New tests: `tests/student-tools.test.ts` (12) and `tests/e2e/students.e2e.mjs` (21).

### 2026-11-20 · Docs: how TrutiAI was built

- New `docs/HOW-IT-WAS-BUILT.md`: what was built from 12 to 19 November, how each Cloudflare service, GitHub and every framework is used, the main flows (reading, community publishing, editorial publishing, images, deploys, internships) and the free-tier limits.

### 2026-11-19 · robots.txt no longer blocks writer profiles

- `Disallow: /write` matched every path starting with "write", so Google could not crawl writer profiles (`/writer/<handle>/`), which Search Console reported as "Blocked by robots.txt". Rules now end in `/` or `$` (`/write/`, `/write$`, `/search/`, `/search$`).

### 2026-11-17 · Search engine fixes: redirects for removed pages, clean sitemap

- Permanent (301) redirects for addresses Google still has: `/blog/welcome-to-trutiai/` → `/about/`, `/og/welcome-to-trutiai.png` → `/og-default.png`, `/tag/meta/` and `/tag/announcements/` → `/articles/` (`src/lib/legacy.ts`; add a line there whenever a public page is removed).
- Sitemap no longer lists private pages (`/me/…`, `/signin/`), the hidden programme pages, the redirected addresses, or author pages while there are no editorial articles. It had 21 URLs, several of them errors or noindex; it now has 12 clean ones. Community articles stay in `sitemap-community.xml`.

### 2026-11-16 · Welcome article fully removed; community articles on the home page

- Top 10 skips editorial articles that no longer exist (the welcome article was still listed from its view counts). Its leftover statistics row was deleted from the production database.
- Home page: new "From the community" section (server island `src/components/LatestCommunity.astro`) with the latest 6 community articles, shown only while `community_open` is true. With no articles at all it shows the "first articles are on their way" notice.

### 2026-11-16 · Fix: private previews leaked into the edge cache

- When the author or an admin opened a hidden community article (community closed), the 10-minute edge cache stored that private page and served it to every visitor. `cachedPage` now skips any response marked `private` or `no-store`.
- New test `tests/e2e/private-cache.e2e.mjs` (3 checks).

### 2026-11-16 · India time everywhere; one "Published" per article

- Fixed: times on server-rendered pages (notifications, admin, My articles, saved, comments, article dates) were in UTC, 5½ hours behind. They now use India time (`Asia/Kolkata`). Editorial Markdown dates (`pubDate`, `updatedDate`) also use the India calendar day.
- Fixed: editing a live article sent it through review again and announced it as "Published" a second time (notification and email). It now says "Your changes are live" (email subject "Updated: …").
- New test `tests/e2e/notifications.e2e.mjs` (4 checks).

### 2026-11-16 · Editor: inserting an image keeps your place

- Fixed: after inserting an image (or a link), the cursor jumped to the top of the article. The dialog returned focus with a plain DOM `focus()`, which puts the caret at the start; it now uses the editor's own focus, which restores the saved cursor, without scrolling.
- Fixed: the new image stayed selected, so the next keystroke replaced it with text. The cursor now moves to the line below the image (a new empty line is added when the image is last).
- New test `tests/e2e/image-cursor.e2e.mjs` (9 checks: toolbar, "/" menu, last block, cancel).

### 2026-11-16 · Tighter article spacing; no file names under images (D-035)

- Article body spacing tightened in the editor and on published pages: paragraphs 0.85em, dividers 1.5em, list items 0.2em with no extra paragraph gap inside items, tables with compact cells and no paragraph margins inside cells, smaller gaps around headings, quotes, code and images.
- Images: the description (alt text) is no longer pre-filled from the file name, and community articles no longer print the description as a visible caption under the picture. Alt text is still required for accessibility and search.
- Tests: the editor, images and publish tests type a description; the publish test waits for the server reply instead of a background listener (it could miss it).

### 2026-11-16 · Brighter design, live search, account menu, new emails (D-034)

- **Colours:** white page instead of cream, with lavender tint bands (`--color-tint #f6f4fc`, `--color-tint-strong #ece8f9`) and the purple accent; ink `#1f1d29`, muted `#5c596b`, lines `#e6e3ef`.
- **Home page redesigned:** hero with the brand emblem, "Browse by topic" cards with icons and descriptions, featured and latest articles (or a short notice while there are none), and a purple "Start writing" band. New footer with topics, site links, policies and both emails. `BaseLayout` gained a `full` option for full-width pages.
- **Header search box:** type to see up to 6 matching articles instantly (new `/api/search`, edge-cached); Enter or "See all results" opens `/articles/?q=`. On phones the search icon opens a full-width search field. Press `/` to jump to search. Article search logic moved to `src/lib/articles.ts`, shared by `/articles` and `/api/search`.
- **Account area:** signed out shows "Write" and a "Sign in" button. Signed in shows the avatar with an unread badge; hovering (or tapping) opens a menu with My articles, Write, Notifications, Saved, Profile settings, the admin pages for admins, and Sign out. Names are now inserted as text, not HTML.
- Sign-in page says "Sign in or create an account".
- **Removed** the welcome post and its cover image. The 404 page searches `/articles/`.
- **Emails:** main address `akhilendrad@trutiai.in` (shown everywhere, receives contact-form messages and reader reports via `CONTACT_TO`); `trutiai@proton.me` shown alongside it on Contact, About, Privacy and the footer.
- Tests: the report check now uses a community article the test publishes; editor test uses `public/og-default.png` as its sample image; programme test checks the live search.

### 2026-11-16 · New brand: purple and cream, TrutiAI logo and favicon (D-033)

- Colours: accent green → purple `#6a5cb1` (hover `#574a98`); page background → cream `#f0ede6`, cards `#f8f6f1`, lines `#ddd8cd`; grey text darkened to `#625e57` so it stays above 4.5:1 contrast on cream. Status chips that were green now use the purple accent. Editor dark mode accent is a light purple.
- Logo in the header and footer (`public/logo.svg`, the owner's logo with its white parts drawn in the ink colour for light backgrounds; the original is kept as `public/logo-white.svg`).
- Favicon from the owner's design: `public/favicon.svg` (dark emblem on light browser tabs, white on dark ones), new `favicon.ico` (16/32/48) and `apple-touch-icon.png`.
- Share images: the default share image, the default cover and every article's generated share image use the logo, cream background and purple bar. `npm run brand` (`scripts/render-brand.mjs`) regenerates the PNGs.
- Removed things that read as placeholder or machine-made: the placeholder author bio (replaced with a factual one), the two sample draft articles, the "Written by people, edited by people" footer line, an emoji on writer pages, and the "meta" tag on the welcome post (now "announcements"). The monogram avatar is purple until a real photo is added.

### 2026-11-16 · Internship codes (D-032)

- **`/admin/internships`** (big "Internships" button at the top of `/admin`): add an intern with name and Google email to get a unique code (`INT-XXXX-XXXX`); the intern can write at once (or on first sign-in). Interns are grouped as Ready for certificate, In progress and Certificate sent, with their articles and a published count against the target (`internship_articles`, default 3). "Mark certificate sent" after you email it. A ready-to-copy welcome message is on the page.
- **Editor:** an "Internship code" box above "Submit for review". A wrong code, or another person's code, blocks submitting with a clear message; only the code owner's own articles count.
- Interns are recruited and given projects off-site (LinkedIn, email): the internship application form on `/join-us` and `/api/apply` were removed; `/join-us` now points to LinkedIn and email.
- Fixed: announcements to more than 25 people failed (D1 allows 100 values per statement); batches are now 20 rows. Queries with long id lists (explore page, saved articles, competition refresh, reward ledger, community tag pages) now run in chunks or as subqueries so they keep working past 100 items (`src/lib/db/chunk.ts`).
- Migration `drizzle/0005_intern_codes.sql`: table `intern_codes`, column `posts.intern_code`.
- New test `tests/e2e/internship.e2e.mjs` (18 checks).

### 2026-11-16 · Editor: choose the table size

- The Table button (toolbar and "/" menu) now opens a dialog: rows (1 to 50), columns (1 to 10) and a "First row is a header" checkbox, with a small preview. It remembers the last size used in the session. Rows and columns can still be added or removed later from the table menu.
- New test `tests/e2e/table.e2e.mjs` (9 checks); `editor.e2e.mjs` updated for the dialog.

### 2026-11-16 · Campus Writers Programme and reader features (D-031)

- **Explore page** `/articles`: search across title, summary, text, tags and writer; filter by topic and several tags; sort by newest, most upvoted, most viewed; 12 per page. Linked as "Explore" in the header.
- **Readers:** Save (bookmark), Share and Copy link under every article; `/me/saved`; take back an upvote ("Undo"); writers can no longer upvote their own article; edit and delete your own comments (edits are checked again; a deleted comment with replies keeps its place).
- **Notifications** (`/me/notifications`, count on `/me`): article decisions, comments and replies on your articles, rewards, results and announcements.
- **Profiles:** optional college and interests; writer pages show article and raise totals and competition placings.
- **Campus Writers Programme**, behind the `programme_open` switch (off by default, admins can preview): `/campus-writers`, `/join-us` with an internship application form, `/leaderboard`, `/reward-policy` (built from the live settings).
- **Rewards:** ₹200 first-article reward credited once as pending; monthly competition with editor scores (accuracy, depth, originality, clarity) plus genuine upvotes, one prize per writer, ₹1,000 cap with automatic cut, tie-breaking; suspicious-vote flags (young accounts, single-writer voters); reward ledger (pending, confirmed, paid with reference, cancelled, adjustments). Payment details are never stored on the site.
- **Programme admin** `/admin/programme`: switch and rules, money overview, competition steps (refresh, score, finalise, reopen, publish), ledger actions, applications, announcements. Exports for rewards and applications. All actions audited.
- Migration `drizzle/0004_programme.sql`: tables `bookmarks`, `notifications`, `competitions`, `competition_entries`, `rewards`, `applications`; columns `user.college`, `user.interests`, `comments.edited_at`.
- New test `tests/e2e/programme.e2e.mjs` (33 checks).

### 2026-11-16 · Fix: promoted writers still saw "Writing is invite-only"

- Writer checks (`/write`, saving, image upload, AI summary) now use `canWrite()` in `src/lib/auth.ts`. For readers it re-reads the role from the database, because the sign-in cookie caches the role for 5 minutes, so an admin promotion now works at once.
- Readers who signed up while writing was invite-only become writers automatically once `community_invite_only` is set to false or their email is invited.
- New test `tests/e2e/writer-access.e2e.mjs` (5 checks).

### 2026-11-16 · Essential improvements (reliability, editorial flow, admin)

Reviewed the "Essential Product Improvements" list against the code (D-030). Most of it already existed; these were missing and worth building now.

**Added**
- Editor: **Version history** (clock button): lists the last 20 saved versions and restores one; the current state is kept first, so a restore can be undone.
- Editor: **conflict protection**. Every save carries the version it started from; a save from an out-of-date tab or device is refused and the writer chooses "Load the latest" or "Keep mine". Autosave pauses until then.
- **Technical details** (optional, settings panel): difficulty, languages and frameworks, versions, tested on, code repository, last verified date. Shown in a box above the article on `/blog/` and `/p/` pages, and written into the Markdown front matter of editor-published articles.
- **Report a problem** on articles: readers pick a reason (code does not work, outdated, incorrect, broken link, spam, copied, harmful, other) and add details. Technical reports never hide an article; they email the editor and the community author (when Resend is set up).
- **My articles** rebuilt: totals (published, views, raises, comments, words), sections (needs attention, drafts, in review, scheduled, published, hidden, trash), Withdraw, Delete to trash (30 days), Restore, and a public profile form (name, bio, website shown on the writer page).
- Admin: **Request changes** (new `changes_requested` status, writer is emailed and sees the note); reasons are required for rejecting and requesting changes; **audit log** of every admin action; **trash** with restore; **export** of articles, writers, reports and the audit log as JSON; **bulk invitations** (up to 50 emails); one-click **emergency switches** to pause submissions or comments (`submissions_open`, `comments_open`).
- `npm run db:backup`: full production database export to `backups/` (git-ignored). SETUP-GUIDE §16 covers backups and restore.
- Migration `drizzle/0003_essentials.sql`: `posts.tech_meta`, `posts.version`, `user.website`, `audit_log` table.
- `tests/e2e/essentials.e2e.mjs` (33 checks).

**Fixed**
- A save without an address no longer gets the address "post" (a second untitled draft showed "address already taken").
- The hourly cleanup deleted any draft untouched for 180 days, not just untitled ones as documented; it now only deletes untitled drafts.
- The admin queue's "Trust writer" button called an action that did not exist; it now sets the trusted role.

### 2026-11-16 · Editor step E: publish your articles from the editor

**Added**
- "Publish to blog" for the admin: validates, converts the article to Markdown and commits it to `src/content/posts/`; the site rebuilds and the article is live at `/blog/<url>/` in 2 to 3 minutes, on the home page, topics, RSS, sitemap and search. "Update article", "Unpublish", "Publish again".
- Scheduling with a date and time; the cron runs every 15 minutes and publishes due articles.
- Content schema: `coverUrl` (uploaded covers), `seoTitle`, `category`; blog pages and cards render uploaded covers and use the SEO title.
- `drizzle/0002_step_e_scheduling.sql`, `POST /api/editorial`, `src/lib/{markdown,github,editorial}.ts`, tests, SETUP-GUIDE §15 (GitHub token).

**Changed**
- Admin articles are editorial and never go through community moderation; community pages list only community posts.
- Cron: `*/15 * * * *` (hourly jobs still run once an hour).


### 2026-11-16 · Plan change

- Step D (AI writing assistant) dropped by the owner: no AI writing in the article body (D-028). The AI summary in the settings panel stays.


### 2026-11-16 · Editor step C completed: import images by URL

**Added**
- "Import from URL" in the image and cover dialogs copies the image to TrutiAI (crop, compress, upload) instead of linking to it; GIF accepted (converted to WebP). Linking as-is is offered only if an import fails.
- `GET /api/media/import` with address checks, public-only fetching, redirect re-checks, timeout and an 8 MB cap; unit tests (`tests/media.test.ts`) and `tests/e2e/images.e2e.mjs`.


### 2026-11-16 · Editor step B: article settings

**Added**
- AI summary: "Generate with AI" / "Regenerate", automatic first summary at 300 words, silent refresh of AI summaries after big rewrites, a "refresh?" note (never an overwrite) for hand-written summaries, confirmation before replacing a hand-written one, length guidance (120 to 160).
- Search result preview, SEO title (60-character guidance), editable URL slug (follows the title until edited, locked after publishing), category (one of the five site topics, required to submit), admin-only Featured.
- Community pages: SEO title in `<title>` and share cards, category label and breadcrumb, category filter, featured posts pinned first.
- Migration `0001_step_b_seo_fields`; `POST /api/ai/summary`; unit and browser tests.

**Changed**
- gpt-oss output budget raised to 900 tokens for summaries and the moderation quality step (hidden reasoning used up the old budget).
- `posts.ts` line endings normalised.


### 2026-11-16 · Image uploads, 600-word minimum, toolbar fixes

**Added**
- Upload images from the device for the cover and the article body (picker, drag-and-drop, or paste into the article). Images are compressed in the browser; covers get a crop and zoom step at 1200 × 630. The image-URL option stays. Alt text is required.
- `POST /api/media` and `GET /media/<id>.<ext>`; files stored in KV until R2 (D-023).
- Word-count progress bar toward the minimum in the editor.

**Changed**
- Minimum article length raised from 300 to 600 words; no maximum (D-024). Community guidelines and the content check updated; the check now fails editorial posts under 600 words.
- Cover image field accepts uploaded `/media/` paths; moderation sends absolute image URLs to the image check.

**Fixed**
- Toolbar scrolled sideways into blank space: tooltips now render outside it.
- Toolbar and settings panel slid under the editor top bar while scrolling: they now stick below it.


### 2026-11-16 · Editor redesign, step A

**Added**
- New block editor in `src/islands/editor/` replacing `src/islands/Editor.tsx`: sticky left rail (headings H2-H4, paragraph, bold, italic, underline, strike, highlight, inline code, lists, quote, code block with language picker, link, image by URL, table, divider, undo/redo, move/duplicate/delete block, templates, shortcuts), selection bubble, "/" block menu, block handle with drag-and-drop, table and code context bars, seven templates, live stats, Write/Split/Preview modes (preview uses the server renderer), focus mode, editor dark theme, status chip with editor feedback, confirmations, keyboard shortcuts dialog, mobile layout (bottom rail, settings sheet).
- Local draft recovery: every change is kept in the browser and offered back if a save failed or the tab closed.
- Renderer and sanitizer support underline (`<u>`), highlight (`<mark>`) and tables; unit test added (11 tests).
- `tests/e2e/editor.e2e.mjs` (Playwright) and `test-results/` in `.gitignore`.
- `BaseLayout` `wide` option; `#site-header` / `#site-footer` ids (focus mode hides them).

**Changed**
- Autosave: 2 s after typing stops (at most 30 s apart) and writes only the post row; tags only when changed; a revision at most every 5 minutes (was about 10 D1 writes per save).

**Fixed**
- Endless re-render that froze the editor on the first keystroke (D-021).
- `/` menu no longer rebuilds its list on hover.

### 2026-11-15 · Phase 3: community publishing behind the flag

**Added**
- Data layer: `src/lib/db/schema.ts` (Drizzle, D1), `drizzle/0000_init.sql`, `src/lib/db/settings.ts` (runtime settings with defaults and 60 s cache), `drizzle.config.ts`.
- Auth: `src/lib/auth.ts` (Better Auth + Drizzle adapter, Google, roles, invite-only, dev login), `src/pages/api/auth/[...all].ts`, `src/middleware.ts` (session, route protection, edge cache for public community routes), `src/pages/signin.astro`, `src/pages/me/index.astro`, `src/pages/api/me.ts`.
- Writing: `src/islands/Editor.tsx` (Tiptap on Preact), `src/pages/write/index.astro`, `src/pages/write/status/[id].astro`, `src/pages/api/posts.ts`, `src/pages/api/posts/[id]/status.ts`, `src/lib/content.ts` + `src/lib/render-doc.ts` (DOM-free Tiptap JSON → sanitised HTML), `src/lib/turnstile.ts`.
- Moderation: `src/lib/moderation/{types,rules,harmful,quality,parse,decide,index}.ts`, the real `ModeratePost` Workflow in `src/worker.ts`, `src/lib/email.ts` (Resend), `src/cron/hourly.ts` (Top 10 → KV, purges, stale drafts).
- Community: `src/lib/community.ts`, `src/lib/cache.ts`, `src/components/{CommunityCard,CommentList}.astro`, `src/islands/{CommentForm,RaiseButton,ReportButton}.tsx`, pages `/community`, `/p/[slug]`, `/writer/[handle]`, `/top`, `/sitemap-community.xml`, APIs `/api/comments`, `/api/raise`, `/api/view`, `/api/report`.
- Admin: `src/pages/admin/index.astro`, `src/pages/api/admin/action.ts`.
- Tests: `vitest.config.ts`, `tests/render-doc.test.ts`, `tests/moderation.test.ts`; scripts `test`, `deploy` (migrations + deploy), `db:generate`, `db:migrate:local`.
- Editorial posts now have comments, raises, report and the view beacon (interaction id `editorial:<slug>`); header shows the signed-in state; `robots.txt` lists the community sitemap.

**Changed**
- `astro.config.mjs`: Preact `compat: true` (Tiptap's React bindings).
- `wrangler.jsonc`/types: no new bindings; secrets listed in `.dev.vars.example` (`SITE_URL` and `AUTH_DEV_LOGIN` are local-only overrides).

**Fixed during the build**
- `@tiptap/html` needs a DOM (and its server build needs Node `vm`), neither of which exists in Workers: replaced with a small deterministic renderer (D-016).
- Node prerender cannot load `cloudflare:workers`: middleware and the comments island import the runtime lazily (D-003).
- Better Auth marks cookies Secure when `SITE_URL` is https: local `.dev.vars` overrides `SITE_URL` (D-017).

**Deployed**
- Live on trutiai.in after regenerating `package-lock.json` (the Windows-generated lock again lacked Linux optional packages; rule: after adding packages, run `rm -rf node_modules package-lock.json && npm install --include=optional` before pushing). Owner applied the D1 migration and set the auth secrets.

**Verified (local preview, 2026-11-15)**
- Full submit → Workflow run in about 5 s with all five steps logged; community pages cached and purged as designed; raise cap; view counts; comment moderation (publish and reject); Top 10 via cron; admin gating and actions; 10 unit tests green; production build green.


### 2026-11-12 · Phase 0 complete: live on trutiai.in

**Deployed**
- Workers Builds connected to github.com/akhil6174/blog; first successful deploy after (1) regenerating the lock file, (2) renaming the Worker to `trutiai`, (3) deleting GoDaddy's parking A and www CNAME records so the custom domains could be created.

**Verified (live)**
- 14 routes return 200 on both `trutiai.in` and `www`, unknown path 404, `/api/health` all true, static pages served from Cloudflare cache.

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
- Worker renamed from `tech-blog` to `trutiai` in `wrangler.jsonc` to match the Workers Builds project name; Workers Builds rejects deploys when the two differ.


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
