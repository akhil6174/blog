/**
 * Site-wide constants. Change these once; every page reads from here.
 * SITE_URL for production is set in wrangler.jsonc `vars` and astro.config.mjs `site`.
 */
export const SITE = {
  name: 'TrutiAI',
  domain: 'trutiai.in',
  tagline: 'Practical writing on software, tools and the craft of building things.',
  description:
    'TrutiAI is a tech blog with hands-on tutorials, tool comparisons and explainers, written by developers for developers.',
  /** Public contact address shown on the site. Set up Cloudflare Email Routing so it forwards to your Gmail (SETUP-GUIDE §14). */
  contactEmail: 'hello@trutiai.in',
  /** Where contact-form submissions are delivered (your inbox). Overridable with the CONTACT_TO var. */
  contactTo: 'hello@trutiai.in',
  /** Topics the blog focuses on. Shown on the About page; keep to 3 to 5 for AdSense clarity. */
  topics: ['Web development', 'Developer tools', 'Cloud and hosting', 'AI for developers', 'Careers in tech'],
  author: {
    name: 'Akhil D',
    handle: 'akhil',
  },
  locale: 'en',
  /** Legal pages carry this "last updated" date; bump it when the text changes. */
  legalUpdated: '12 November 2026',
} as const;
