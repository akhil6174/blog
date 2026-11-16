/**
 * Settings panel end-to-end check (step B): AI summary, overwrite protection, auto-refresh after big changes,
 * search preview, SEO title, slug rules, category, featured. Run against `npm run preview` with the dev login.
 * If the AI binding is unreachable locally, the AI endpoint is mocked for the UI checks and that is reported.
 *
 *   node tests/e2e/settings.e2e.mjs [outDir]
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const OUT = process.argv[2] ?? 'test-results/settings';
mkdirSync(OUT, { recursive: true });
const SLUG = `astro-cloudflare-guide-${Date.now().toString(36)}`; // unique per run
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
let aiCalls = 0;
page.on('request', (r) => r.url().endsWith('/api/ai/summary') && aiCalls++);
const waitFor = (fn, arg, timeout = 5000) => page.waitForFunction(fn, arg, { timeout }).then(() => true).catch(() => false);
const summaryVal = () => page.inputValue('#summary');

await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { headers: { origin: BASE }, data: { email: 'akhil6174dwivedi@gmail.com', password: 'localtest-password-1' } });

// Real AI or mock?
const probe = await ctx.request.post(`${BASE}/api/ai/summary`, { headers: { origin: BASE }, data: { title: 'Probe', text: 'Cloudflare Workers serve static assets for free and only code requests count toward the limit. '.repeat(12) } });
const probeBody = await probe.json().catch(() => ({}));
const realAI = probe.ok() && typeof probeBody.summary === 'string';
check(realAI ? 'AI endpoint answers with the real model' : 'AI endpoint unreachable locally: UI checks use a mock', true, realAI ? `"${probeBody.summary}" (${probeBody.summary.length} chars)` : `${probe.status()} ${probeBody.error ?? ''}`);
let mockN = 0;
if (!realAI) {
  await page.route('**/api/ai/summary', async (route) => {
    mockN++;
    const { text } = JSON.parse(route.request().postData() ?? '{}');
    const { basisOf } = await import('../../src/lib/fingerprint.ts');
    const basis = basisOf(text ?? '');
    await route.fulfill({ json: { summary: `Mock summary ${mockN}: how to deploy an Astro blog on Cloudflare Workers and keep it on the free plan.`, basis } });
  });
}

await page.goto(`${BASE}/write/`);
await page.waitForFunction(() => !!window.__editor);

// Title drives the slug and search preview
await page.click('.editor-title');
await page.keyboard.type('Deploying Astro on Cloudflare Workers for free');
const slugVal = () => page.inputValue('input[aria-label="URL slug"]');
check('slug follows the title', (await slugVal()) === 'deploying-astro-on-cloudflare-workers-for-free', await slugVal());
check('search preview shows the title', (await page.textContent('[aria-label="Search result preview"]')).includes('Deploying Astro on Cloudflare Workers for free'));

// Body: 320 words so the automatic summary kicks in
const para = 'Cloudflare Workers serve static assets for free, and only requests that run code count toward the daily limit of one hundred thousand. ';
await page.evaluate((p) => {
  const ed = window.__editor;
  const blocks = [];
  for (let i = 0; i < 14; i++) blocks.push({ type: 'paragraph', content: [{ type: 'text', text: `${p}Section ${i + 1} adds its own concrete detail about caching, D1 queries and deployment number ${i + 1}.` }] });
  ed.commands.setContent({ type: 'doc', content: blocks });
  ed.commands.focus('end');
}, para);
await page.keyboard.type(' End.');
const autoOk = await waitFor(() => (document.querySelector('#summary')?.value ?? '').length > 40, null, 25000);
check('summary generated automatically at 300+ words', autoOk, (await summaryVal()).slice(0, 80));
check('summary marked as AI written', await waitFor(() => document.body.innerText.includes('AI written')));
const len = (await summaryVal()).length;
check('summary within 160 characters', len > 0 && len <= 160, `${len} chars`);
check('search preview shows the summary', (await page.textContent('[aria-label="Search result preview"]')).includes((await summaryVal()).slice(0, 30)));

// Writer edits -> protected from regeneration
await page.fill('#summary', 'My own summary of deploying an Astro blog on Cloudflare Workers without paying for hosting, written by hand.');
check('editing marks it as written by you', await waitFor(() => document.body.innerText.includes('Written by you')));
await page.click('button:has-text("Regenerate")');
check('regenerate asks before replacing your summary', await waitFor(() => !!document.querySelector('[role="dialog"][aria-label="Replace your summary?"]')));
await page.click('[role="dialog"] button:has-text("Cancel")');
check('cancel keeps your summary', (await summaryVal()).startsWith('My own summary'));

// Big rewrite -> stale banner for a user summary (never auto-overwritten)
const callsBefore = aiCalls;
await page.evaluate(() => {
  const ed = window.__editor;
  const blocks = [];
  for (let i = 0; i < 14; i++) blocks.push({ type: 'paragraph', content: [{ type: 'text', text: `Python virtual environments isolate packages for each project, number ${i}, and pip installs into whichever environment is active right now.` }] });
  ed.commands.setContent({ type: 'doc', content: blocks });
});
// (Focus returns to the Regenerate button after the dialog closes, so click into the article before typing.)
await page.click('.tiptap');
await page.keyboard.press('Control+End');
await page.keyboard.type(' Changed.');
const stale = await waitFor(() => document.body.innerText.includes('changed a lot since this summary'), null, 9000);
check('big rewrite flags a hand-written summary', stale);
check('hand-written summary not replaced automatically', (await summaryVal()).startsWith('My own summary') && aiCalls === callsBefore, `ai calls ${callsBefore} -> ${aiCalls}`);

// SEO title counter
await page.fill('input[aria-label="SEO title"]', 'Astro on Cloudflare Workers: a free hosting guide for 2026 and beyond');
check('SEO title over 60 warns', (await page.textContent('aside[aria-label="Article settings"]')).includes('may be cut in search results'));
await page.fill('input[aria-label="SEO title"]', 'Astro on Cloudflare Workers: free hosting guide');
check('search preview uses the SEO title', (await page.textContent('[aria-label="Search result preview"]')).includes('Astro on Cloudflare Workers: free hosting guide'));

// Slug edit, category, featured
await page.fill('input[aria-label="URL slug"]', 'Astro Cloudflare Guide!');
check('slug is cleaned while typing', (await slugVal()).startsWith('astro-cloudflare-guide'), await slugVal());
await page.fill('input[aria-label="URL slug"]', SLUG);
await page.click('.editor-title');
await page.keyboard.press('End');
await page.keyboard.type(' today');
check('edited slug no longer follows the title', (await slugVal()) === SLUG);
await page.selectOption('select[aria-label="Category"]', 'cloud-and-hosting');
check('featured option shown to admin', await page.isVisible('text=Pin at the top of the community page'));
await page.check('input[aria-label="Featured"]');

// Persist and reload
await page.waitForTimeout(3500);
await page.keyboard.press('Control+s');
await page.waitForTimeout(1500);
await page.reload();
await page.waitForFunction(() => !!window.__editor);
check('slug persisted', (await slugVal()) === SLUG, await slugVal());
check('category persisted', (await page.inputValue('select[aria-label="Category"]')) === 'cloud-and-hosting');
check('SEO title persisted', (await page.inputValue('input[aria-label="SEO title"]')) === 'Astro on Cloudflare Workers: free hosting guide');
check('summary source persisted', (await page.textContent('aside[aria-label="Article settings"]')).includes('Written by you'));
check('featured persisted', await page.isChecked('input[aria-label="Featured"]'));
await page.screenshot({ path: `${OUT}/settings-panel.png` });
check('settings panel does not overflow its column', await page.evaluate(() => { const box = document.querySelector('aside[aria-label="Article settings"] > div'); return box.scrollWidth <= box.clientWidth + 1; }));

// Submit requires a category
await page.selectOption('select[aria-label="Category"]', '');
await page.click('.editor-topbar button:has-text("Submit")');
check('submit asks for a category', await waitFor(() => document.querySelector('[role="dialog"]')?.textContent?.includes('Choose a category')));

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
