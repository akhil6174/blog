/**
 * Build-time social share images: /og/<post-id>.png (1200x630) for every published post.
 * The file is named [...slug].ts on purpose: astro-og-canvas appends ".png" to the route itself.
 * Generated with astro-og-canvas during `astro build`, so no Worker CPU is spent per request (D-009).
 */
import { OGImageRoute } from 'astro-og-canvas';
import { getPublishedPosts } from '../../lib/posts';
import { SITE } from '../../lib/site';

const posts = await getPublishedPosts();
const pages = Object.fromEntries(posts.map((p) => [p.id, { title: p.data.title, description: p.data.description, tags: p.data.tags }]));

export const { getStaticPaths, GET } = await OGImageRoute({
  param: 'slug',
  pages,
  getImageOptions: (_path, page: (typeof pages)[string]) => ({
    title: page.title,
    description: page.description,
    bgGradient: [[250, 250, 250]],
    border: { color: [26, 137, 23], width: 24, side: 'block-end' },
    padding: 72,
    font: {
      title: { size: 60, weight: 'Bold', color: [41, 41, 41], lineHeight: 1.15, families: ['Inter', 'Segoe UI', 'Arial'] },
      description: { size: 28, color: [107, 107, 107], lineHeight: 1.4, families: ['Inter', 'Segoe UI', 'Arial'] },
    },
    logo: undefined,
    cacheDir: './node_modules/.astro-og-canvas',
  }),
});
