/**
 * Sitemap for indexable community posts (on-demand, edge-cached, purged on publish). Listed in robots.txt.
 */
import type { APIRoute } from 'astro';
import { and, desc, eq } from 'drizzle-orm';
import { db, posts } from '../lib/db';
import { getSettingBool } from '../lib/db/settings';

export const prerender = false;

export const GET: APIRoute = async ({ site }) => {
  const base = (site ?? new URL('https://trutiai.in/')).href;
  const open = await getSettingBool('community_open');
  const rows = open ? await db().select({ slug: posts.slug, updatedAt: posts.updatedAt }).from(posts).where(and(eq(posts.status, 'published'), eq(posts.kind, 'community'), eq(posts.indexAllowed, true))).orderBy(desc(posts.publishedAt)).limit(5000) : [];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows
    .map((r) => `  <url><loc>${base}p/${r.slug}/</loc><lastmod>${r.updatedAt.toISOString()}</lastmod></url>`)
    .join('\n')}\n</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
