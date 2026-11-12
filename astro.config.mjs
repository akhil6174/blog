// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';

// Production URL. Replace with https://yourdomain.com once the domain is connected (Phase 0, manual task 2).
// It drives canonical URLs, the sitemap and Open Graph tags.
const SITE_URL = process.env.SITE_URL ?? 'https://trutiai.in';

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
    preact(),
    sitemap({
      // Never list these in the sitemap (see SEO checklist in the plan).
      filter: (page) => !/\/(api|admin|write|drafts|search)(\/|$)/.test(page),
    }),
  ],
});
