/**
 * GET /api/dsa/companies : public counts of "asked at <company>" reports per problem (src/lib/dsa.ts), for the
 * company filter on /students/dsa-sheet/. Not cached, so a new report shows at once.
 */
import type { APIRoute } from 'astro';
import { companyCounts } from '../../../lib/dsa';

export const prerender = false;

export const GET: APIRoute = async () =>
  Response.json({ counts: await companyCounts() }, { headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
