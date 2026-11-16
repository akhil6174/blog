/**
 * GET /api/search?q= : the header's live search. Up to 6 matching articles (same matching as /articles), as
 * { results: [{ title, url, description, topic, kind }] }. Edge-cached 5 minutes per query by the middleware.
 */
import type { APIRoute } from 'astro';
import { findArticles } from '../../lib/articles';
import { categoryName } from '../../lib/site';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  const results =
    q.length < 2
      ? []
      : (await findArticles({ q })).slice(0, 6).map((a) => ({
          title: a.title,
          url: a.url,
          description: a.description.slice(0, 140),
          topic: categoryName(a.category) ?? a.tags[0]?.name ?? null,
          kind: a.id.startsWith('editorial:') ? 'editorial' : 'community',
        }));
  return Response.json({ results }, { headers: { 'cache-control': 'public, max-age=60', 'x-robots-tag': 'noindex' } });
};
