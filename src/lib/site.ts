/**
 * Site-wide constants. Change these once; every page reads from here.
 * SITE_URL for production is set in wrangler.jsonc `vars` and astro.config.mjs `site`.
 */
export const SITE = {
  name: 'TrutiAI',
  tagline: 'Practical writing on software, tools and the craft of building things.',
  description:
    'A tech blog with hands-on tutorials, tool comparisons and explainers, written by developers for developers.',
  author: {
    name: 'Akhil D',
    handle: 'akhil',
  },
  locale: 'en',
} as const;
