/**
 * Sitemap for pages that change at runtime (on-demand, edge-cached, purged on change). Listed in robots.txt:
 * indexable community posts, published event pages, and /people/ while that page is switched on.
 */
import type { APIRoute } from 'astro';
import { and, desc, eq } from 'drizzle-orm';
import { db, events, posts } from '../lib/db';
import { getSettingBool } from '../lib/db/settings';

export const prerender = false;

export const GET: APIRoute = async ({ site }) => {
  const base = (site ?? new URL('https://trutiai.in/')).href;
  const open = await getSettingBool('community_open');
  const rows = open ? await db().select({ slug: posts.slug, updatedAt: posts.updatedAt }).from(posts).where(and(eq(posts.status, 'published'), eq(posts.kind, 'community'), eq(posts.indexAllowed, true))).orderBy(desc(posts.publishedAt)).limit(5000) : [];
  const entries = rows.map((r) => ({ loc: `${base}p/${r.slug}/`, lastmod: r.updatedAt }));
  const evs = await db().select({ id: events.id, updatedAt: events.updatedAt }).from(events).where(eq(events.published, true)).orderBy(desc(events.startsAt)).limit(500);
  entries.push(...evs.map((e) => ({ loc: `${base}events/${e.id}/`, lastmod: e.updatedAt })));
  if (await getSettingBool('people_page_open')) entries.push({ loc: `${base}people/`, lastmod: new Date() });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map((r) => `  <url><loc>${r.loc}</loc><lastmod>${r.lastmod.toISOString()}</lastmod></url>`)
    .join('\n')}\n</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
