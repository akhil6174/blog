# Architecture

Short, code-level view of how the blog works. The reasoning and the full design are in `../Tech Blog Build Plan v2.md` (Part 2); decisions are in `DECISIONS.md`.

## One picture

```
People / bots  ──►  Cloudflare edge (HTTPS, cache, Turnstile)
                        │
                        ├── static file?  ──►  dist/client/*  (free, unlimited, no code runs)
                        │
                        └── otherwise     ──►  Worker (src/worker.ts → Astro handler)
                                                  │  on-demand pages + /api/* routes
                                                  ├── D1  (DB)        users, posts, comments, stats, log, settings
                                                  ├── R2  (MEDIA)     images
                                                  ├── KV  (CACHE)     flags, settings cache, Top 10 lists
                                                  ├── AI              spam/quality verdict (gpt-oss-20b)
                                                  ├── MODERATION      Workflow: 5-step moderation pipeline
                                                  └── cron (hourly)   sitemap, stale drafts, Top 10, digest
Outside: Google (AdSense, Search Console, sign-in), OpenAI Moderation, Resend, Sentry
```

## Rendering rule

| Route type | Rendering | Caching |
|---|---|---|
| Home, editorial posts, tags, authors, legal pages, feeds | Pre-rendered at build (`output: 'static'` default) | Served as files; `/_astro/*` immutable |
| Community posts and listing | On-demand (`prerender = false`) | Edge cache 10 min; purged on edit |
| Comment lists, raise counts | On-demand server island / JSON | Never cached |
| Search, write, admin, auth, `/api/*` | On-demand | Never cached; `x-robots-tag: noindex` |
| `/top` | On-demand | Reads pre-computed JSON from KV |

## Bindings (wrangler.jsonc)

| Binding | Service | Used for | Free limit that matters |
|---|---|---|---|
| `ASSETS` | Static assets | Everything in `dist/client` | Unlimited |
| `DB` | D1 | All relational data | 5M reads/day, 100K writes/day, 5 GB |
| `MEDIA` | R2 (added in Phase 3, D-013) | Uploaded images (WebP) | 10 GB, 1M writes/month |
| `CACHE` | KV | Flags, settings cache, rate limits, Top 10 | 100K reads/day, **1K writes/day** |
| `SESSION` | KV (auto-added by the adapter) | Astro sessions | Same as KV |
| `AI` | Workers AI | Quality verdict, fallback safety model | 10,000 neurons/day |
| `MODERATION` | Workflows | `ModeratePost` pipeline | 3,000 steps/day |
| cron `0 * * * *` | Triggers | Hourly housekeeping | Free |

Non-secret settings are `vars` in `wrangler.jsonc`; secrets are listed in `.dev.vars.example`.

## Request flows (summary)

1. **Editorial post read:** static file from the edge. No code, no database.
2. **Community post read:** Worker → edge cache hit (about 1 ms) or D1 read + render + cache (10 min). Comments load afterwards from an uncached server island.
3. **Writer submits:** browser compresses images → signed R2 upload → `POST /api/posts` validates (Zod), inserts `status='submitted'`, starts `MODERATION` Workflow → steps: rules → OpenAI moderation → Workers AI quality → decide → finalize (log, email, purge cache, sitemap).
4. **Raise:** `RaiseButton` island debounces 1 s, sends a delta → upsert `raises` (cap 50), bump `posts.raises_count` and `post_stats`. No cache purge.
5. **View:** beacon after 10 s → bump `posts.views_count` and `post_stats` (sampled 1 in 5 above 20K/day).
6. **Hourly cron:** Top 10 lists (today, month, year) from `post_stats` → KV; community sitemap; stale drafts; digest.

## Data model (D1)

`users`, `sessions`/`accounts`/`verifications` (Better Auth), `posts` (with `body_json`, `body_html`, `status`, `kind`, `quality_score`, `index_allowed`, `ads_allowed`, `views_count`, `raises_count`, `comments_count`), `post_stats` (per post per day), `raises` (user × post, 1..50), `post_revisions`, `tags`, `post_tags`, `comments`, `reports`, `moderation_log`, `settings`.
Migrations live in `drizzle/` (Phase 3).

## Phase 0 reality check

What exists today: the Worker entry, the bindings, a stub Workflow, the health route, the design tokens and a placeholder home. Every flow above except "editorial post read" and "/api/health" is implemented in Phases 1 to 3.
