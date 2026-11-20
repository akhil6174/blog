/**
 * Images in R2 (D-037): uploads land in R2, images still in KV keep working, the admin "Copy old images to R2"
 * action copies them in batches and is safe to repeat, and only admins can run it.
 * Run against `npm run preview` with dev login:  node tests/e2e/media-r2.e2e.mjs
 * (Seed an old image first: npx wrangler kv key put media:oldkvimage00001 --path public/apple-touch-icon.png
 *  --namespace-id <CACHE id> --metadata '{"type":"image/png"}' --local)
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const H = { origin: BASE };
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  (${detail})` : ''}`); };
const b = await chromium.launch();
const admin = await b.newContext();
await admin.request.post(`${BASE}/api/auth/sign-in/email`, { headers: H, data: { email: 'akhil6174dwivedi@gmail.com', password: 'localtest-password-1' } });

const health = await (await admin.request.get(`${BASE}/api/health`)).json();
check('health check reports R2', health.checks?.r2 === true, JSON.stringify(health.checks));
const up = await (await admin.request.post(`${BASE}/api/media?kind=body`, { headers: { ...H, 'content-type': 'image/png' }, data: readFileSync('public/og-default.png') })).json();
const served = await admin.request.get(`${BASE}${up.url}`);
check('a new upload is served', served.ok() && served.headers()['content-type'] === 'image/png', `${served.status()} ${up.error ?? ''}`);
const old = await admin.request.get(`${BASE}/media/oldkvimage00001.png`);
check('an image still in KV is served (fallback)', old.ok(), String(old.status()));

let cursor = '', copied = 0, skipped = 0, rounds = 0, done = false;
while (!done && rounds < 200) {
  const r = await (await admin.request.post(`${BASE}/api/admin/action`, { headers: H, data: { action: 'copy_media', value: cursor } })).json();
  if (r.error) { check('copy batch', false, r.error); break; }
  copied += r.copied; skipped += r.skipped; cursor = r.cursor ?? ''; done = r.done; rounds++;
}
check('copy finishes', done, `rounds ${rounds}`);
console.log(`      first run: ${copied} copied, ${skipped} already in R2, ${rounds} batches`);
let again = 0, rounds2 = 0; cursor = ''; done = false;
while (!done && rounds2 < 200) {
  const r = await (await admin.request.post(`${BASE}/api/admin/action`, { headers: H, data: { action: 'copy_media', value: cursor } })).json();
  again += r.copied; cursor = r.cursor ?? ''; done = r.done; rounds2++;
}
check('running it again copies nothing (safe to repeat)', again === 0, `${again} copied`);
const reader = await b.newContext();
check('visitors cannot run the copy', (await reader.request.post(`${BASE}/api/admin/action`, { headers: H, data: { action: 'copy_media', value: '' } })).status() === 403);

await b.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
