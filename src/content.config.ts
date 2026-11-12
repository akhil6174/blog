/**
 * Content collections (Astro content layer).
 * - posts:   editorial articles as Markdown in src/content/posts/<slug>.md
 * - authors: one JSON file per author in src/content/authors/<handle>.json
 *
 * Every published post must have a description (meta tag) and, if it has a cover, a coverAlt.
 * The build fails on schema errors, which is intended: thin or incomplete posts never reach production.
 */
import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(10).max(90),
      description: z.string().min(50).max(160),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      cover: image().optional(),
      coverAlt: z.string().optional(),
      tags: z.array(z.string().min(2)).min(1).max(5),
      author: reference('authors'),
      draft: z.boolean().default(false),
      featured: z.boolean().default(false),
    })
    .refine((d) => !d.cover || !!d.coverAlt, { message: 'coverAlt is required when cover is set' }),
});

const authors = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/authors' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      handle: z.string(),
      role: z.string(),
      bio: z.string().min(40),
      avatar: image(),
      avatarAlt: z.string(),
      links: z
        .object({
          github: z.string().url().optional(),
          linkedin: z.string().url().optional(),
          x: z.string().url().optional(),
          website: z.string().url().optional(),
        })
        .default({}),
    }),
});

export const collections = { posts, authors };
