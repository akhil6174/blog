/**
 * Editor end-to-end check (real Chromium, real keyboard). Run against `npm run preview` with the local
 * dev login enabled (.dev.vars: AUTH_DEV_LOGIN=true, SITE_URL=http://127.0.0.1:4321):
 *
 *   node tests/e2e/editor.e2e.mjs [outDir]
 *
 * Exits 1 on any failed check. Screenshots go to outDir (default: ./test-results/editor).
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const OUT = process.argv[2] ?? 'test-results/editor';
const EMAIL = process.env.E2E_EMAIL ?? 'akhil6174dwivedi@gmail.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'localtest-password-1';
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
const alive = async (label) => {
  const t0 = Date.now();
  try {
    await page.evaluate(() => 1, undefined, { timeout: 3000 });
    check(`page responsive ${label}`, true, `${Date.now() - t0} ms`);
  } catch {
    check(`page responsive ${label}`, false, 'main thread blocked');
  }
};
const saves = [];
page.on('response', (r) => r.url().endsWith('/api/posts') && r.request().method() === 'POST' && saves.push(r.status()));

// --- sign in (dev login) ---
let r = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { headers: { origin: BASE }, data: { email: EMAIL, password: PASSWORD } });
if (!r.ok()) r = await ctx.request.post(`${BASE}/api/auth/sign-up/email`, { headers: { origin: BASE }, data: { email: EMAIL, password: PASSWORD, name: 'E2E Writer' } });
check('signed in', r.ok(), String(r.status()));

// --- load ---
await page.goto(`${BASE}/write/`);
await page.waitForSelector('.editor-canvas', { timeout: 15000 });
await page.waitForFunction(() => !!window.__editor);
check('editor loaded', true);
await alive('after load');

// --- title + body typing ---
await page.click('.editor-title');
await page.keyboard.type('Testing the new block editor end to end');
await page.keyboard.press('Enter'); // jumps to subtitle
await page.keyboard.type('A real browser walks through every feature');
await page.keyboard.press('Enter'); // jumps to body
await page.keyboard.type('This first paragraph checks typing in the canvas.');
await alive('after typing');
check('title kept', (await page.inputValue('.editor-title')) === 'Testing the new block editor end to end');
check('subtitle kept (Enter moves to body immediately)', (await page.inputValue('.editor-subtitle')) === 'A real browser walks through every feature', await page.inputValue('.editor-subtitle'));
check('body got the first sentence', (await page.evaluate(() => window.__editor.getText())).startsWith('This first paragraph'));

// --- slash menu ---
await page.keyboard.press('Enter');
await page.keyboard.type('/');
const menuShown = await page.waitForSelector('.slash-menu .slash-item', { timeout: 3000 }).then(() => true).catch(() => false);
check('slash menu opens on "/"', menuShown);
await page.keyboard.type('subhead');
const items = await page.$$eval('.slash-menu .slash-title', (els) => els.map((e) => e.textContent));
check('slash menu filters', items.length > 0 && items.every((t) => /subheading/i.test(t)), items.join(', '));
await page.keyboard.press('Enter');
await page.keyboard.type('Section one');
const types = await page.evaluate(() => window.__editor.getJSON().content.map((n) => n.type + (n.attrs?.level ?? '')));
check('slash command inserted a subheading', types.includes('heading3'), types.join(' '));
check('slash menu closed', !(await page.$('.slash-menu')));
await page.keyboard.press('Enter');
await page.keyboard.type('Body under section one, long enough to select a few words.');
await alive('after slash menu');

// --- bubble menu on selection ---
await page.keyboard.down('Shift');
for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
await page.keyboard.up('Shift');
const bubble = await page.waitForSelector('.bubble-menu', { state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
check('bubble menu appears on selection', bubble);
if (bubble) {
  await page.click('.bubble-menu button[aria-label^="Bold"]');
  const boldHtml = await page.evaluate(() => window.__editor.getHTML());
  check('bubble bold applies', /<strong>/.test(boldHtml));
}
await page.keyboard.press('End');

// --- block operations ---
const before = await page.evaluate(() => window.__editor.getJSON().content.map((n) => n.type));
await page.keyboard.press('Alt+Shift+ArrowUp');
const after = await page.evaluate(() => window.__editor.getJSON().content.map((n) => n.type));
check('move block up (Alt Shift ↑)', JSON.stringify(before) !== JSON.stringify(after), `${before.join(',')} -> ${after.join(',')}`);
await page.keyboard.press('Alt+Shift+ArrowDown');
const count0 = after.length;
await page.keyboard.press('Alt+Shift+D');
const count1 = await page.evaluate(() => window.__editor.getJSON().content.length);
check('duplicate block (Alt Shift D)', count1 === count0 + 1, `${count0} -> ${count1}`);
await page.keyboard.press('Control+Z');
const count2 = await page.evaluate(() => window.__editor.getJSON().content.length);
check('undo', count2 === count0, `${count1} -> ${count2}`);

// --- rail: table + highlight ---
await page.click('.rail-btn[aria-label^="Table"]');
check('table inserted from rail', await page.evaluate(() => window.__editor.isActive('table')));
check('table context bar shown', !!(await page.$('.context-bar[aria-label="Table"]')));
await page.click('.context-bar button:has-text("Row below")');
const rows = await page.evaluate(() => window.__editor.getJSON().content.find((n) => n.type === 'table')?.content.length);
check('table add row', rows === 4, `rows=${rows}`);
await alive('after table');

// --- autosave ---
await page.waitForTimeout(3500);
check('autosave sent', saves.length >= 1, `responses ${saves.join(',')}`);
check('autosave succeeded', saves.length > 0 && saves.every((s) => s === 200));
const savedLabel = await page.textContent('.editor-topbar [role="status"]');
check('save indicator shows saved', /Saved/.test(savedLabel ?? ''), savedLabel?.trim());
check('URL updated with post id', /\?id=/.test(page.url()), page.url());
await alive('after autosave');
await page.screenshot({ path: `${OUT}/01-write-desktop.png`, fullPage: false });

// --- toolbar: no sideways scroll, tooltip outside, stays below the top bar while scrolling ---
check('rail cannot scroll sideways', await page.evaluate(() => { const r = document.querySelector('.editor-rail'); return r.scrollWidth <= r.clientWidth + 1; }));
await page.hover('.rail-btn[aria-label^="Heading"]');
const tipBox = await page.waitForSelector('.rail-tooltip', { timeout: 2000 }).then((h) => h.boundingBox()).catch(() => null);
const railBox = await (await page.$('.editor-rail')).boundingBox();
check('rail tooltip shows beside the rail', !!tipBox && tipBox.x >= railBox.x + railBox.width, tipBox ? `tip x=${Math.round(tipBox.x)} rail right=${Math.round(railBox.x + railBox.width)}` : 'no tooltip');
await page.mouse.wheel(0, 1200);
await page.waitForTimeout(400);
const pos = await page.evaluate(() => ({ rail: document.querySelector('.editor-rail').getBoundingClientRect().top, bar: document.querySelector('.editor-topbar').getBoundingClientRect().bottom, panel: document.querySelector('aside[aria-label="Article settings"] > div')?.getBoundingClientRect().top ?? 999 }));
check('rail stays below the top bar after scrolling', pos.rail >= pos.bar - 1, `rail ${Math.round(pos.rail)} vs bar ${Math.round(pos.bar)}`);
check('settings panel stays below the top bar', pos.panel >= pos.bar - 1, `panel ${Math.round(pos.panel)}`);
await page.mouse.wheel(0, -2400);

// --- word minimum ---
check('word minimum progress bar shown', !!(await page.$('[role="progressbar"][aria-valuemax="600"]')));

// --- body image upload from device ---
const IMG = 'src/assets/images/cover-default.png';
await page.click('.tiptap');
await page.keyboard.press('Control+End');
await page.click('.rail-btn[aria-label="Image"]');
await page.waitForSelector('[role="dialog"][aria-label="Insert image"]');
await page.setInputFiles('[role="dialog"] input[type="file"]', IMG);
await page.waitForSelector('[role="dialog"] img', { timeout: 5000 });
check('body image: preview after choosing a file', true);
check('body image: alt text suggested from file name', (await page.inputValue('[role="dialog"] input[placeholder^="Describe"]')) === 'cover default');
await page.fill('[role="dialog"] input[placeholder^="Describe"]', 'TrutiAI wordmark');
await page.click('[role="dialog"] button:has-text("Insert")');
await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 10000 });
const bodySrc = await page.evaluate(() => window.__editor.getJSON().content.find((n) => n.type === 'image')?.attrs.src ?? '');
check('body image: uploaded and inserted', /^\/media\/[a-z0-9]+\.(webp|jpg)$/.test(bodySrc), bodySrc);
const served = await page.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, type: r.headers.get('content-type'), cache: r.headers.get('cache-control'), size: (await r.arrayBuffer()).byteLength }; }, bodySrc);
check('uploaded image is served', served.status === 200 && /^image\//.test(served.type ?? ''), `${served.status} ${served.type} ${served.size} bytes, ${served.cache}`);
check('uploaded image is compressed', served.size > 0 && served.size < 200_000, `${served.size} bytes (original 22 KB PNG 1600x900)`);
const badUpload = await page.evaluate(async () => (await fetch('/api/media?kind=body', { method: 'POST', body: new Blob(['<svg onload=alert(1)>'], { type: 'image/png' }) })).status);
check('server rejects non-images', badUpload === 415, String(badUpload));

// --- cover upload with crop ---
await page.click('aside[aria-label="Article settings"] button:has-text("Add a cover image")');
await page.waitForSelector('[role="dialog"][aria-label="Cover image"]');
await page.setInputFiles('[role="dialog"] input[type="file"]', IMG);
const cv = await page.waitForSelector('[role="dialog"] canvas', { timeout: 5000 });
const cb = await cv.boundingBox();
await page.fill('[role="dialog"] input[type="range"]', '2');
await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
await page.mouse.down();
await page.mouse.move(cb.x + cb.width / 2 + 80, cb.y + cb.height / 2 + 30, { steps: 5 });
await page.mouse.up();
check('cover: crop canvas shown with zoom and drag', true);
await page.click('[role="dialog"] button:has-text("Use this cover")');
await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 10000 });
const coverSrc = await page.getAttribute('aside[aria-label="Article settings"] img', 'src');
check('cover: uploaded and shown in settings', /^\/media\//.test(coverSrc ?? ''), coverSrc);
const coverDims = await page.evaluate(async (u) => { const b = await (await fetch(u)).blob(); const bmp = await createImageBitmap(b); return `${bmp.width}x${bmp.height}`; }, coverSrc);
check('cover: saved at 1200 x 630', coverDims === '1200x630', coverDims);
await page.screenshot({ path: `${OUT}/07-images.png` });

// --- templates ---
await page.click('.rail-btn[aria-label="Templates"]');
await page.waitForSelector('[role="dialog"]');
await page.click('[role="dialog"] button:has-text("How-to guide")');
await page.click('[role="dialog"] button:has-text("Add at the end")');
const hasTemplate = await page.evaluate(() => window.__editor.getText().includes('The short answer'));
check('template added at the end', hasTemplate);

// --- block handle hover + menu ---
const firstPara = await page.$('.tiptap p');
await firstPara.hover();
const handle = await page.waitForSelector('.block-handle', { timeout: 2000 }).then(() => true).catch(() => false);
check('block handle appears on hover', handle);
if (handle) {
  await page.click('.block-handle button[aria-label="Block options"]');
  check('block menu opens', !!(await page.$('.block-menu')));
  await page.keyboard.press('Escape');
}

// --- preview + split ---
await page.click('button[aria-pressed]:has-text("Preview")');
const pv = await page.textContent('article[aria-label="Preview"] h1');
check('preview shows title', pv === 'Testing the new block editor end to end', pv);
check('preview renders body', !!(await page.$('article[aria-label="Preview"] h3:has-text("Section one")')));
await page.screenshot({ path: `${OUT}/02-preview.png` });
await page.click('button[aria-pressed]:has-text("Split")');
check('split shows editor and preview', !!(await page.$('.editor-canvas')) && !!(await page.$('article[aria-label="Preview"]')));
await page.screenshot({ path: `${OUT}/03-split.png` });
await page.click('button[aria-pressed]:has-text("Write")');

// --- focus + dark ---
const waitFor = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 3000 }).then(() => true).catch(() => false);
await page.click('button[aria-label="Focus mode"]');
check('focus mode hides site header', await waitFor(() => getComputedStyle(document.querySelector('#site-header')).display === 'none'));
await page.keyboard.press('Escape');
check('Esc leaves focus mode', await waitFor(() => getComputedStyle(document.querySelector('#site-header')).display !== 'none'));
await page.click('button[aria-label="Switch to dark theme"]');
check('dark theme applied', await waitFor(() => document.documentElement.classList.contains('editor-dark')));
await page.screenshot({ path: `${OUT}/04-dark.png` });
await page.click('button[aria-label="Switch to light theme"]');
await waitFor(() => !document.documentElement.classList.contains('editor-dark'));

// --- shortcuts dialog ---
await page.click('body', { position: { x: 5, y: 300 } });
await page.keyboard.press('?');
check('"?" opens shortcuts', await waitFor(() => !!document.querySelector('[role="dialog"][aria-label="Keyboard shortcuts"]')));
await page.keyboard.press('Escape');
check('Esc closes dialog', await waitFor(() => !document.querySelector('[role="dialog"]')));

// --- submit validation ---
await page.waitForTimeout(2500);
await page.click('.editor-topbar button:has-text("Submit")');
const notice = await page.waitForSelector('[role="dialog"][aria-label="Before you submit"]', { timeout: 3000 }).then(() => true).catch(() => false);
check('submit blocked with clear reasons', notice);
await page.keyboard.press('Escape');

// --- reload: content persisted, no recovery prompt ---
await page.waitForTimeout(3000);
await page.reload();
await page.waitForFunction(() => !!window.__editor);
const persisted = await page.evaluate(() => window.__editor.getText());
check('content persisted after reload', persisted.includes('Section one') && persisted.includes('The short answer'));
check('no recovery banner after clean save', !(await page.$('text=were kept in this browser')));
check('long title not clipped after reload', await page.evaluate(() => { const t = document.querySelector('.editor-title'); return t.scrollHeight <= t.clientHeight + 2; }));
await alive('after reload');

// --- local recovery when the server is unreachable ---
await page.route('**/api/posts', (route) => route.abort());
await page.click('.tiptap');
await page.keyboard.press('Control+End');
await page.keyboard.type(' Offline sentence.');
await page.waitForTimeout(3000);
check('error state shown when save fails', !!(await page.$('text=Not saved:')));
await page.unroute('**/api/posts');
const ctx2Page = await ctx.newPage();
await ctx2Page.goto(page.url());
await ctx2Page.waitForFunction(() => !!window.__editor);
check('recovery offered in a new tab', !!(await ctx2Page.$('text=were kept in this browser')));
await ctx2Page.click('button:has-text("Restore")');
check('recovery restores text', (await ctx2Page.evaluate(() => window.__editor.getText())).includes('Offline sentence.'));
await ctx2Page.close();

// --- mobile ---
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
check('mobile: split mode hidden', !(await page.isVisible('button[aria-pressed]:has-text("Split")')));
check('mobile: rail docked at bottom', await page.evaluate(() => getComputedStyle(document.querySelector('.editor-rail')).position === 'fixed'));
check('mobile: no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.screenshot({ path: `${OUT}/05-mobile.png` });
await page.click('button[aria-label="Article settings"]');
check('mobile: settings sheet opens', await page.isVisible('.fixed > aside[aria-label="Article settings"] textarea'));
await page.screenshot({ path: `${OUT}/06-mobile-settings.png` });

// The offline check aborts requests on purpose; those network errors are expected.
// ...and the fake-image upload is rejected with 415 on purpose.
const real = errors.filter((e) => !/ERR_FAILED|status of 415/.test(e));
check('no page errors', real.length === 0, real.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
