# Writing page redesign: analysis and plan

Status: **steps A, B and C done** (C completed 2026-11-16 with URL import). Steps D and E pending.
Earlier: **steps A and B done** (B: 2026-11-16, 25/25 settings checks with the real model).
Previous status: **step A done** (2026-11-16, 50/50 browser checks in `tests/e2e/editor.e2e.mjs`). Steps B to E pending. Defaults approved by the owner: R2 if enabled else D1 storage, editorial posts from the editor, selection-only AI assistant.
Source: the owner's 10-section brief for a Notion/Medium-style block editor.

## Verdict in one paragraph

The brief is good and almost all of it fits the free tier, because Tiptap (already installed) provides every block and formatting feature under the MIT licence. Five points need a different answer than the brief gives: an H1 inside the article body, free text alignment, two separate summary fields, an AI assistant that writes whole sections, and saving on every keystroke. Each is explained below with the better alternative. One decision changes the work a lot: image uploads need storage, and R2 (D-013) is still off.

## 1. What to adopt as written

| Brief item | How it will work |
|---|---|
| Block canvas, no textarea | Already Tiptap; redesigned as a clean document canvas at the 680 px reading width |
| Left sticky toolbar | Compact icon rail (56 px) with tooltips and shortcut hints; stays visible while scrolling |
| Slash menu, keyboard shortcuts, undo/redo | `@tiptap/suggestion` for `/`; Tiptap history; shortcuts listed in a `?` help popover |
| Block handle: drag, move up/down, duplicate, delete | `@tiptap/extension-drag-handle-react` (MIT): a ⋮⋮ handle appears beside the hovered block with a small menu |
| Bubble menu on selection | Bold, italic, link, highlight, inline code, "Ask AI" appear above selected text (contextual formatting) |
| Tables, highlight, underline, inline code, divider, code blocks | Tiptap MIT extensions; code highlighting with a trimmed language set to keep the bundle small |
| Templates | Seven templates (tutorial, how-to, review, comparison, opinion, project showcase, news) inserted as editable headings with one-line hints |
| Writing stats | Words, characters, reading time, headings, last saved, in a footer bar |
| Write / Preview / Split modes | Preview uses **the same renderer the server uses** (`render-doc.ts`) and the same article CSS, so it is genuinely what readers see |
| Distraction-free mode | Hides both sidebars and the header; `Esc` exits |
| Draft recovery | Every change is also kept in the browser; if a server save fails or the tab crashes, the editor offers to restore the newer local copy |
| Status and feedback | A status chip (Draft, In review, Published, Declined, Hidden) and a banner with the editor's feedback on declined posts, with Edit and Resubmit |
| Confirmations | Before deleting a block with content, leaving with unsaved changes, submitting, and publishing |
| Responsive | Desktop: three columns. Tablet: canvas plus a slide-over settings panel. Mobile: Write and Preview tabs, formatting bar above the keyboard, settings as a bottom sheet |
| Dark theme | Editor-only light/dark toggle (follows the system by default). The public site stays light, as designed |
| Accessibility | `role="toolbar"`, `aria-pressed`, visible focus, every icon button labelled, all actions reachable by keyboard |

## 2. Where a different approach is better

| Brief item | Problem | Better approach |
|---|---|---|
| **H1 inside the article** | The article title is already the page's H1. A second H1 in the body is weak for SEO and accessibility, and the renderer clamps headings to H2-H4 for that reason. | Offer **Heading (H2), Subheading (H3), Minor heading (H4)** with friendly labels. The title field stays the only H1. |
| **Text alignment** | Centred or justified body text hurts readability and makes community articles look inconsistent next to editorial ones. | Keep body text left-aligned. Allow alignment only for images (inline, wide, full width) and centred captions. |
| **"AI SEO summary" and "SEO meta description" as two fields** | They are the same 150-160 characters; two fields confuse writers and drift apart. | One **Summary** field (AI-generated, editable) used as the meta description and card excerpt, plus an optional **SEO title** override (up to 60 characters) that defaults to the article title. |
| **AI "expand content", "generate introduction/conclusion"** | AI-written sections are the top AdSense rejection reason ("low value content"), our editorial policy and moderation reject unedited AI text, and each call spends the shared 10,000 neurons/day. | Assistant works **on selected text only** and always shows a suggestion with Accept / Discard: fix grammar, improve readability, simplify, rewrite; plus title ideas, heading ideas and an SEO check. **Repetition detection runs locally in the browser** (free). Intro/conclusion become *outline hints* (bullet suggestions), not finished prose. |
| **Autosave on every change** | Each save currently writes about 10 D1 rows (post, revision, tags, cleanup). Saving every few seconds would burn the 100,000 writes/day allowance with a handful of active writers. | Save 2 s after typing stops but write **only the post row**; tags only when they change; a revision snapshot at most every 5 minutes and on submit. About 1 row per save instead of 10. |
| **Editable slug** | Changing a URL after publishing breaks links and loses search ranking. | Editable until first publish; locked afterwards (admin can change it, with a redirect). |
| **Featured option in the writer's sidebar** | Writers cannot feature their own posts. | Visible only to the admin, in the sidebar and in `/admin`. |
| **Scheduled publication for everyone** | Community posts go through moderation, so the publish time is not the writer's to set. | Admin only: pick a date and time; the existing hourly cron publishes due posts. |
| **Category and tags** | Free-form categories fragment the site. | **Category** = one required choice from the site's fixed topics (the same list as the About page), **tags** = up to 5 free tags. Categories become topic hub pages later, which also helps AdSense show a clear site focus. |

## 3. Cover image: one pipeline for both methods

Both "upload from device" and "import from URL" end in the same place, which keeps the server cheap:

1. **From device:** the file is read in the browser.
   **From URL:** the browser asks `/api/media/import?url=…`; the Worker fetches the image (public internet only, already enforced by the `global_fetch_strictly_public` flag), checks the type is JPEG/PNG/WebP and the size is under 8 MB, and passes the bytes back. This avoids hotlinking other people's images and the CORS problems of fetching them directly.
2. The browser shows the **crop and reposition** tool (`react-easy-crop`, MIT) locked to 1.91:1, then compresses to a 1200×630 WebP (usually 60-150 KB) on a canvas. No image processing happens in the Worker, so the 10 ms CPU limit is never at risk.
3. The result uploads to `/api/media`, which validates type and size again and stores it. Alt text is required for covers.
4. The same uploader inserts images into the article body (max 1600 px wide).
5. Moderation already sends cover and body image URLs to OpenAI's image check.

**Storage (decided 2026-11-16, D-023):** KV until R2 is enabled. Original options considered:
- **R2 (recommended).** Needs a card on file to enable; ₹0 within 10 GB. Images served from a `media.trutiai.in` custom domain with long caching.
- **No card:** store compressed images in a D1 table (cap 300 KB each, about 15,000 images in the free 5 GB), served by the Worker with edge caching. Works, but uses D1 space and Worker requests; migrate to R2 later.

## 4. AI summary behaviour

- Generated with the existing Workers AI model when the writer clicks **Generate**, or automatically the first time the article passes 300 words and the summary is empty.
- Shows a live character counter: green 120-160, amber outside, red over 160.
- Remembers whether the current summary came from AI or from the writer. If the article changes significantly (more than 30 % of the text since the summary was made), it shows "Your article changed. Refresh the summary?" and **never** overwrites a summary the writer edited without that confirmation.
- Costs about 45 neurons per generation; capped per writer per day (setting in `/admin`) so moderation always has budget.

## 5. Your own articles (affects Phase 2 speed)

Today your editorial articles are Markdown files in the repository, which means writing in a code editor and pushing with git. With the new editor it would be far easier to write them in the browser. Proposal:

- Posts you write as admin get `kind = editorial`, skip moderation, and publish at **`/blog/<slug>/`** with full SEO, alongside the existing Markdown posts.
- `/blog/<slug>/` becomes an on-demand page with the same 10-minute edge cache as community posts, so cost stays negligible, and it renders either the Markdown post or the editor post.
- Featured, scheduled and "Publish now" buttons appear only for you.

## 6. Decisions needed from the owner

1. **Image storage:** enable R2 with a card (₹0) or use the D1 fallback.
2. **Write your own articles in the new editor** (section 5) or keep Markdown files.
3. **AI assistant scope:** the trimmed, selection-only version above, or the brief's full list including generated sections.

Defaults if the owner just says "go": R2 if enabled by then, otherwise D1 fallback; yes to section 5; trimmed AI assistant.

## 7. Build order

| Step | Contents | Sessions |
|---|---|---|
| A | New layout, icon rail, bubble menu, slash menu, block handle, tables/highlight/underline, templates, stats, cheaper autosave + local recovery, write/preview/split, focus mode, status banner, confirmations, mobile layout, editor dark mode | 1-2 |
| B | Settings panel: AI summary, SEO title, slug rules, category, tags, featured/schedule (admin); D1 migration for `seo_title`, `category`, `summary_source`, `summary_hash`, `scheduled_at`, `featured` | 1 |
| C | Image pipeline: device + URL import, crop, compress, storage, alt text, in-body images | 1 |
| D | AI assistant (selection actions with Accept/Discard, title and heading ideas, SEO check, local repetition check, per-user caps, admin on/off) | 1 |
| E | Admin editorial publishing at `/blog/`, publish now, scheduling via cron | 1 |

Each step ends with a build, unit tests for any new renderer nodes, a local end-to-end run, docs updates and a push.

## 8. Renderer and safety changes that come with it

- `render-doc.ts` gains underline (`<u>`), highlight (`<mark>`), tables, image width variants and captions; the sanitizer allow-list gains the same tags only.
- Unit tests extend to every new node so preview, server output and moderation stay identical.
- The editor bundle loads only on `/write` (about 300-400 KB gzipped with tables and code highlighting); public pages are unaffected.
