/** Removed page: permanent redirect (see src/lib/legacy.ts). */
import type { APIRoute } from 'astro';
import { legacyRedirect } from '../../../lib/legacy';

export const prerender = false;
export const GET: APIRoute = ({ url }) => legacyRedirect(url.pathname) ?? new Response(null, { status: 404 });
