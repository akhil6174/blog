/**
 * Better Auth handler: /api/auth/* (sign-in, callback, session, sign-out ...).
 */
import type { APIRoute } from 'astro';
import { auth, isAuthConfigured } from '../../../lib/auth';

export const prerender = false;

export const ALL: APIRoute = async ({ request }) => {
  if (!isAuthConfigured()) return Response.json({ error: 'Sign-in is not configured yet (BETTER_AUTH_SECRET missing).' }, { status: 503 });
  return auth().handler(request);
};
