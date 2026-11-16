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
  /** Main public address, shown everywhere on the site. */
  contactEmail: 'akhilendrad@trutiai.in',
  /** Second public address, shown next to the main one on Contact, About, Privacy and the footer. */
  altEmail: 'trutiai@proton.me',
  /** Where contact-form submissions and reader reports are delivered. Overridable with the CONTACT_TO var. */
  contactTo: 'akhilendrad@trutiai.in',
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

/** Article categories: one per article, from the site's fixed topics (keeps the site's focus clear for readers and AdSense). */
export const CATEGORIES = SITE.topics.map((name) => ({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }));

export function categoryName(slug: string | null | undefined): string | null {
  return CATEGORIES.find((c) => c.slug === slug)?.name ?? null;
}
