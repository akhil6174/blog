import { defineConfig } from 'drizzle-kit';

// Used only to GENERATE SQL migrations into ./drizzle. They are applied with Wrangler:
//   npx wrangler d1 migrations apply tech-blog-db --local    (dev)
//   npx wrangler d1 migrations apply tech-blog-db --remote   (production)
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
});
