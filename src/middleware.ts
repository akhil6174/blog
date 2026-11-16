/**
 * Middleware for on-demand routes (pre-rendered pages never reach it).
 *  1. Edge cache for public community pages (Cache API, 10 min, purged on edit): /community, /p/*, /writer/*, /top.
 *  2. Session loading + protection for /write, /me, /admin and the write APIs.
 *
 * `lib/auth` and `lib/cache` are imported lazily: they pull in `cloudflare:workers`, which does not exist in the
 * Node prerender environment used at build time (D-003).
 */
import { defineMiddleware } from 'astro:middleware';

const PROTECTED = /^\/(write|admin|me|api\/(posts|comments|raise|report|upload|media|ai|editorial|admin|me|bookmarks|notifications))(\/|$|\?)/;
const CACHEABLE = /^\/(community(\/|$)|p\/|writer\/|top(\/|$)|articles(\/|$)|api\/search$|sitemap-community\.xml$)/;

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered) return next();
  const path = context.url.pathname;

  if (context.request.method === 'GET' && CACHEABLE.test(path)) {
    const { cachedPage } = await import('./lib/cache');
    context.locals.user = null;
    context.locals.session = null;
    const res = await cachedPage(path + context.url.search, () => next());
    return res;
  }

  if (!PROTECTED.test(path)) {
    context.locals.user = null;
    context.locals.session = null;
    return next();
  }

  const { auth, hasRole } = await import('./lib/auth');
  const s = await auth().api.getSession({ headers: context.request.headers });
  context.locals.user = s?.user ?? null;
  context.locals.session = (s?.session as Record<string, unknown>) ?? null;
  const u = context.locals.user;
  const isApi = path.startsWith('/api/');

  if (u?.bannedAt) {
    return isApi
      ? Response.json({ error: 'Account suspended.' }, { status: 403 })
      : new Response('Your account is suspended. Contact akhilendrad@trutiai.in if you think this is a mistake.', { status: 403 });
  }

  if (path.startsWith('/admin') || path.startsWith('/api/admin')) {
    if (!hasRole(u, 'admin')) {
      return isApi ? Response.json({ error: 'Admin only.' }, { status: 403 }) : context.redirect(`/signin/?next=${encodeURIComponent(path)}`);
    }
  }

  if (!isApi && !u) {
    return context.redirect(`/signin/?next=${encodeURIComponent(path)}`);
  }

  const res = await next();
  if (!isApi) res.headers.set('x-robots-tag', 'noindex, follow');
  res.headers.set('cache-control', 'private, no-store');
  return res;
});
