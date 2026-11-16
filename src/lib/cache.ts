/**
 * Edge cache helpers for community pages (Cache API). Rule (plan, Part 2): community post HTML is cached for
 * 10 minutes and purged on edit/publish/unpublish; raises and comments never purge it.
 */
import { env } from 'cloudflare:workers';

const TTL = 600;

function key(path: string): Request {
  return new Request(new URL(path, env.SITE_URL).href, { method: 'GET' });
}

export async function cachedPage(path: string, render: () => Promise<Response>): Promise<Response> {
  const cache = caches.default;
  const k = key(path);
  const hit = await cache.match(k);
  if (hit) {
    const h = new Headers(hit.headers);
    h.set('x-edge-cache', 'HIT');
    return new Response(hit.body, { status: hit.status, headers: h });
  }
  const res = await render();
  // A page rendered for one person (the author or an admin previewing a hidden article) says private/no-store.
  // It must never go into the shared edge cache, or every visitor would see it for 10 minutes.
  const cc = res.headers.get('cache-control') ?? '';
  if (res.status === 200 && !/private|no-store/i.test(cc)) {
    const h = new Headers(res.headers);
    h.set('cache-control', `public, s-maxage=${TTL}, max-age=0, must-revalidate`);
    h.set('x-edge-cache', 'MISS');
    const out = new Response(res.body, { status: 200, headers: h });
    await cache.put(k, out.clone());
    return out;
  }
  return res;
}

export async function purgePaths(paths: string[]): Promise<void> {
  const cache = caches.default;
  await Promise.all(paths.map((p) => cache.delete(key(p))));
}

export async function purgePostCaches(slug: string, authorHandle?: string | null): Promise<void> {
  const paths = [`/p/${slug}/`, '/community/', '/community/page/2/', '/sitemap-community.xml'];
  if (authorHandle) paths.push(`/writer/${authorHandle}/`);
  await purgePaths(paths);
}
