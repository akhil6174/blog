import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { SITE } from '../lib/site';
import { getPublishedPosts, postUrl } from '../lib/posts';

export const GET: APIRoute = async (context) => {
  const posts = await getPublishedPosts();
  return rss({
    title: SITE.name,
    description: SITE.description,
    site: context.site ?? 'https://trutiai.in',
    trailingSlash: true,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.pubDate,
      link: postUrl(p),
      categories: p.data.tags,
    })),
    customData: `<language>${SITE.locale}</language>`,
  });
};
