/**
 * Structured data (JSON-LD) builders. Each returns a plain object; BaseLayout serialises it.
 * Keep these in sync with the SEO checklist in the plan.
 */
import { SITE } from './site';

export type Crumb = { name: string; url: string };

export function websiteJsonLd(siteUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    url: siteUrl,
    description: SITE.description,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}search/?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function personJsonLd(siteUrl: string, a: { name: string; handle: string; bio: string; avatarUrl: string; links: Record<string, string | undefined> }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: a.name,
    url: `${siteUrl}author/${a.handle}/`,
    image: a.avatarUrl,
    description: a.bio,
    sameAs: Object.values(a.links).filter(Boolean),
  };
}

export function articleJsonLd(
  siteUrl: string,
  p: {
    url: string;
    title: string;
    description: string;
    image?: string;
    published: Date;
    updated?: Date;
    authorName: string;
    authorUrl: string;
    tags: string[];
    wordCount: number;
  },
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    mainEntityOfPage: { '@type': 'WebPage', '@id': p.url },
    headline: p.title,
    description: p.description,
    image: p.image ? [p.image] : undefined,
    datePublished: p.published.toISOString(),
    dateModified: (p.updated ?? p.published).toISOString(),
    author: { '@type': 'Person', name: p.authorName, url: p.authorUrl },
    publisher: { '@type': 'Organization', name: SITE.name, url: siteUrl, logo: { '@type': 'ImageObject', url: `${siteUrl}favicon.svg` } },
    keywords: p.tags.join(', '),
    wordCount: p.wordCount,
    inLanguage: SITE.locale,
  };
}

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
  };
}
