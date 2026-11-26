// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import { existsSync, readdirSync } from 'node:fs';

// Production URL. Replace with https://yourdomain.com once the domain is connected (Phase 0, manual task 2).
// It drives canonical URLs, the sitemap and Open Graph tags.
const SITE_URL = process.env.SITE_URL ?? 'https://trutiai.in';
// Author pages are noindex until the author has an article, so they join the sitemap only once articles exist.
const POSTS_DIR = new URL('./src/content/posts/', import.meta.url);
const HAS_EDITORIAL = existsSync(POSTS_DIR) && readdirSync(POSTS_DIR).some((f) => f.endsWith('.md') && !f.startsWith('_'));

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,

  // Default: every page is pre-rendered to a static file (free, unlimited on Workers).
  // Pages that must run code opt out with `export const prerender = false;` (see src/pages/api/health.ts).
  output: 'static',

  adapter: cloudflare({
    // Images are optimised at build time with Sharp; no Worker CPU spent per request.
    imageService: 'compile',
    // Pre-render static pages in Node rather than in workerd. Static pages never use bindings, and this
    // avoids the Workers AI binding forcing a remote Cloudflare session during `astro build`.
    prerenderEnvironment: 'node',
  }),

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [
    // compat: lets Tiptap's React bindings run on Preact (D-008).
    preact({ compat: true }),
    sitemap({
      // Never list these in the sitemap (see SEO checklist in the plan).
      // Private pages (account, sign-in), hidden programme pages and old redirected addresses are left out too:
      // a sitemap that lists redirects, "not found" or noindex pages makes Search Console report errors.
      // When the Campus Writers Programme is switched on, remove its pages from this list.
      filter: (page) =>
        !/\/(api|admin|write|drafts|search|me|signin|campus-writers|join-us|leaderboard|reward-policy|people)(\/|$)/.test(new URL(page).pathname) &&
        !/\/(blog\/welcome-to-trutiai|tag\/meta|tag\/announcements)\/?$/.test(new URL(page).pathname) &&
        (HAS_EDITORIAL || !/\/author\//.test(new URL(page).pathname)),
    }),
  ],
});
