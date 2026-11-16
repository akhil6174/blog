/**
 * Full backup of the production database to backups/trutiai-<date-time>.sql (git-ignored).
 *   npm run db:backup
 * Needs `npx wrangler login` once. Restore guide: docs/SETUP-GUIDE.md, "Backups and restore".
 * Cloudflare also keeps D1 Time Travel (point-in-time restore for the last 7 days on the free plan).
 */
import { execSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';

mkdirSync('backups', { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const out = `backups/trutiai-${stamp}.sql`;
execSync(`npx wrangler d1 export tech-blog-db --remote --output ${out}`, { stdio: 'inherit' });
console.log(`\nSaved ${out} (${Math.round(statSync(out).size / 1024)} KB). Keep a copy outside this computer too (Google Drive, for example).`);
