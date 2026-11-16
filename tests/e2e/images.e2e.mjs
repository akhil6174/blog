/**
 * Image import end-to-end check (step C): importing by URL copies the image to TrutiAI (body and cover),
 * bad addresses are refused with clear messages, and linking as-is remains a visible fallback.
 * Run against `npm run preview` with the dev login. Needs internet access (imports a real public image).
 *
 *   node tests/e2e/images.e2e.mjs [outDir]
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const OUT = process.argv[2] ?? 'test-results/images';
const REMOTE = process.env.REMOTE_IMAGE ?? 'https://trutiai.in/og-default.png';
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { headers: { origin: BASE }, data: { email: 'akhil6174dwivedi@gmail.com', password: 'localtest-password-1' } });

// --- API behaviour ---
const api = async (u) => {
  const r = await ctx.request.get(`${BASE}/api/media/import?url=${encodeURIComponent(u)}`);
  const type = r.headers()['content-type'] ?? '';
  const body = type.includes('json') ? await r.json() : null;
  return { status: r.status(), type, body, size: type.startsWith('image/') ? (await r.body()).length : 0 };
};
const good = await api(REMOTE);
check('import returns the remote image bytes', good.status === 200 && good.type.startsWith('image/'), `${good.status} ${good.type} ${good.size} bytes`);
const html = await api('https://trutiai.in/');
check('a web page is refused as not an image', html.status === 415, `${html.status} ${html.body?.error ?? ''}`);
const local = await api('http://127.0.0.1/secret.png');
check('local addresses are refused before fetching', local.status === 400, `${local.status} ${local.body?.error ?? ''}`);
const meta = await api('http://169.254.169.254/latest/meta-data');
check('cloud metadata address is refused', meta.status === 400, String(meta.status));
const missing = await api('https://trutiai.in/does-not-exist.png');
check('a missing image gives a clear error', missing.status === 502 && /answered 404/.test(missing.body?.error ?? ''), missing.body?.error);
const anon = await browser.newContext().then((c) => c.request.get(`${BASE}/api/media/import?url=${encodeURIComponent(REMOTE)}`));
check('signed-out users cannot use the importer', anon.status() === 401, String(anon.status()));

// --- Body image by URL ---
await page.goto(`${BASE}/write/`);
await page.waitForFunction(() => !!window.__editor);
await page.click('.tiptap');
await page.click('.rail-btn[aria-label="Image"]');
await page.click('[role="dialog"] [role="tab"]:has-text("Import from URL")');
await page.fill('[role="dialog"] input[aria-label="Image address"]', REMOTE);
await page.click('[role="dialog"] button.btn-primary:text-is("Import")');
const preview = await page.waitForSelector('[role="dialog"] img', { timeout: 15000 }).then(() => true).catch(() => false);
check('body: imported image shows a preview', preview);
check('body: preview says where it came from', (await page.textContent('[role="dialog"]')).includes('Imported from trutiai.in'));
check('body: alt text suggested from the file name', (await page.inputValue('[role="dialog"] input[placeholder^="Describe"]')) === 'og default');
await page.click('[role="dialog"] button:has-text("Insert")');
await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 15000 });
const src = await page.evaluate(() => window.__editor.getJSON().content.find((n) => n.type === 'image')?.attrs.src ?? '');
check('body: inserted image is a TrutiAI copy, not a hotlink', /^\/media\//.test(src), src);

// --- Failure path and link fallback ---
await page.click('.rail-btn[aria-label="Image"]');
await page.click('[role="dialog"] [role="tab"]:has-text("Import from URL")');
await page.fill('[role="dialog"] input[aria-label="Image address"]', 'https://trutiai.in/');
await page.click('[role="dialog"] button.btn-primary:text-is("Import")');
const errShown = await page.waitForSelector('[role="dialog"] [role="alert"]', { timeout: 10000 }).then((h) => h.textContent()).catch(() => '');
check('body: clear error for a non-image address', /not a JPG, PNG, WebP or GIF/.test(errShown ?? ''), errShown);
check('body: link-as-is fallback offered after a failed import', await page.isVisible('[role="dialog"] button:has-text("link to it as-is instead")'));
await page.keyboard.press('Escape');

// --- Cover by URL with crop ---
await page.click('aside[aria-label="Article settings"] button:has-text("Add a cover image")');
await page.click('[role="dialog"] [role="tab"]:has-text("Import from URL")');
await page.fill('[role="dialog"] input[aria-label="Image address"]', REMOTE);
await page.click('[role="dialog"] button.btn-primary:text-is("Import")');
const cropper = await page.waitForSelector('[role="dialog"] canvas', { timeout: 15000 }).then(() => true).catch(() => false);
check('cover: imported image opens the crop step', cropper);
await page.fill('[role="dialog"] input[placeholder^="Describe"]', 'TrutiAI share card');
await page.click('[role="dialog"] button:has-text("Use this cover")');
await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 15000 });
const cover = await page.getAttribute('aside[aria-label="Article settings"] img', 'src');
check('cover: saved as a TrutiAI copy', /^\/media\//.test(cover ?? ''), cover);
const dims = await page.evaluate(async (u) => { const b = await (await fetch(u)).blob(); const bmp = await createImageBitmap(b); return `${bmp.width}x${bmp.height}`; }, cover);
check('cover: 1200 x 630', dims === '1200x630', dims);
await page.screenshot({ path: `${OUT}/images-import.png` });

const real = errors.filter((e) => !/415|502|ERR_FAILED/.test(e));
check('no page errors', real.length === 0, real.slice(0, 2).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
