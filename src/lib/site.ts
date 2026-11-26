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

const toCat = (name: string) => ({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') });

/** The site's main topics: home page, footer and About (kept to 5 so the site's focus stays clear for readers and AdSense). */
export const MAIN_CATEGORIES = SITE.topics.map(toCat);

/** Every category a writer can pick (D-045): the main topics first, then more specific tech areas. Slugs never change once used. */
export const CATEGORIES = [
  ...MAIN_CATEGORIES,
  ...[
    'Machine learning', 'Data science', 'Mobile development', 'DevOps', 'Cybersecurity', 'Programming languages',
    'Data structures and algorithms', 'Databases', 'System design', 'Open source', 'Computer science basics',
    'Interview preparation', 'Internships and placements', 'UI and UX design', 'Game development', 'IoT and embedded',
    'Blockchain and Web3', 'Tech news and opinion',
  ].map(toCat),
];

/** A writer's own category when none fits, stored as "c:<name>" (2 to 30 characters). */
export const CUSTOM_CATEGORY = /^c:[A-Za-z0-9][A-Za-z0-9 &+.#/'-]{1,29}$/;
export const customCategory = (name: string) => `c:${name.trim().replace(/\s+/g, ' ')}`;

export function isValidCategory(v: string | null | undefined): boolean {
  return !!v && (CATEGORIES.some((c) => c.slug === v) || CUSTOM_CATEGORY.test(v));
}

export function categoryName(slug: string | null | undefined): string | null {
  if (slug && CUSTOM_CATEGORY.test(slug)) return slug.slice(2);
  return CATEGORIES.find((c) => c.slug === slug)?.name ?? null;
}
