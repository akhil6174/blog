---
title: "Sample tutorial (draft): deploy an Astro site to Cloudflare Workers"
description: "A draft used to test the article layout: headings, code blocks, images, tables, a table of contents and related posts. Not published in production."
pubDate: 2026-11-10
tags: ["astro", "cloudflare", "tutorial"]
author: akhil
draft: true
---

This draft exists so the article template can be checked locally with realistic content. It is excluded from production builds because `draft: true`.

## Why Cloudflare Workers

Requests for static files are free and unlimited on the Workers free plan. Only requests that run code count toward the 100,000 per day limit. For a blog, that means almost every page view costs nothing.

## Create the project

Run the scaffolder and add the adapter:

```bash
npm create astro@latest my-blog -- --template minimal
cd my-blog
npx astro add cloudflare
```

The adapter writes a `wrangler.jsonc` for you. The important parts look like this:

```jsonc
{
  "name": "my-blog",
  "main": "@astrojs/cloudflare/entrypoints/server",
  "assets": { "directory": "./dist", "binding": "ASSETS" }
}
```

## Choose what runs code

| Page | Rendering | Why |
|---|---|---|
| Articles | Static | Free, fast, crawler-friendly |
| Search API | On demand | Needs the database |

Mark an on-demand page with one line:

```ts
export const prerender = false;
```

## Deploy

Push to GitHub, import the repository in the Cloudflare dashboard, and every push to `main` deploys. The first deploy takes about a minute.

### Checking the result

Open `/api/health` if you added one, or simply load the home page and check the response headers for `cf-ray`.

## What it costs

Nothing until you pass the free limits. The domain is the only bill.
