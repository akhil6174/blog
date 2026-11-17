/**
 * Addresses that used to exist and are still in search engines. Each gets a permanent (301) redirect to the closest
 * live page, so Google updates its index instead of reporting errors. Add a line here whenever a public URL is removed.
 */
export const LEGACY_REDIRECTS: Record<string, string> = {
  '/blog/welcome-to-trutiai/': '/about/',
  '/og/welcome-to-trutiai.png': '/og-default.png',
  '/tag/meta/': '/articles/',
  '/tag/announcements/': '/articles/',
};

/** 301 response for a legacy path, or null. Accepts the path with or without a trailing slash. */
export function legacyRedirect(pathname: string): Response | null {
  const key = pathname.endsWith('/') || pathname.includes('.') ? pathname : `${pathname}/`;
  const to = LEGACY_REDIRECTS[key];
  return to ? new Response(null, { status: 301, headers: { location: to, 'cache-control': 'public, max-age=86400' } }) : null;
}
