/**
 * Resume builder: example loads, preview updates as you type, templates switch, the download is a real PDF with
 * the right name, long resumes and non-Latin text get warnings, entries are remembered, and phones get an
 * "Open preview" link instead of an inline viewer. Run against `npm run preview`:  node tests/e2e/resume.e2e.mjs
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  (${detail})` : ''}`); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('dialog', (d) => d.accept());
const ready = () => p.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
const status = () => p.textContent('[data-testid="pdf-status"]').then((t) => (t ?? '').trim());
const waitStatus = (re) => p.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-testid="pdf-status"]')?.textContent ?? ''), re.source, { timeout: 15000 }).then(() => true).catch(() => false);

await p.goto(`${BASE}/students/resume-builder/`);
await p.evaluate(() => localStorage.clear());
await p.reload();
await ready();
check('example builds a one-page PDF', await waitStatus(/^1 page$/), await status());
// Browsers with a built-in PDF viewer show it inline; the test browser has none, so it gets the "Open preview" link.
const hasViewer = await p.evaluate(() => navigator.pdfViewerEnabled !== false);
check('preview: inline viewer, or an "Open preview" link where the browser has none', hasViewer ? await p.isVisible('[data-testid="preview"]') : await p.isVisible('text=Open preview'));
check('the PDF library loads only when needed (not in the page HTML)', !(await p.content()).includes('pdf-lib'));

await p.fill('[data-testid="r-name"]', 'Asha Verma');
await p.waitForTimeout(900);
await waitStatus(/page/);
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-testid="download"]')]);
const file = await dl.path();
const bytes = readFileSync(file);
check('download is named after the person', dl.suggestedFilename() === 'Asha_Verma_Resume.pdf', dl.suggestedFilename());
check('download is a real PDF', bytes.subarray(0, 5).toString() === '%PDF-' && bytes.length > 2000, `${bytes.length} bytes`);
const parsed = await PDFDocument.load(bytes);
check('the name is in the PDF', parsed.getTitle() === 'Asha Verma – Resume' && parsed.getPageCount() === 1, parsed.getTitle());

for (const t of ['modern', 'compact', 'classic']) {
  await p.click(`label:has([data-testid="tpl-${t}"])`);
  check(`template "${t}" builds`, await waitStatus(/^1 page$/), await status());
}

// Long resume: many projects push it to two pages.
await p.locator('summary:has-text("Projects")').click();
for (let i = 0; i < 6; i++) await p.click('text=+ Add project');
const n = await p.locator('[data-testid^="r-project-"]').count();
for (let i = 0; i < n; i++) {
  if (!(await p.inputValue(`[data-testid="r-project-${i}"]`))) await p.fill(`[data-testid="r-project-${i}"]`, `Project number ${i + 1} with a long description`);
}
const areas = p.locator('details:has(summary:has-text("Projects")) textarea');
const count = await areas.count();
for (let i = 0; i < count; i++) { if (!(await areas.nth(i).inputValue())) await areas.nth(i).fill('Built the feature end to end and measured the result carefully\nWrote tests and documented the setup for other students\nDeployed it and collected feedback from real users'); }
check('long resume runs to 2 pages', await waitStatus(/^2 pages$/), await status());
check('long resume shows the one-page advice', await p.isVisible('[data-testid="too-long"]'));

await p.fill('[data-testid="r-name"]', 'अशा Verma');
await p.waitForTimeout(700);
check('non-Latin text shows a warning', await p.isVisible('[data-testid="non-latin"]'));

await p.click('[data-testid="clear"]');
check('start blank empties the form', (await p.inputValue('[data-testid="r-name"]')) === '' && (await waitStatus(/^1 page$/)));
await p.fill('[data-testid="r-name"]', 'Remembered Name');
await p.waitForTimeout(300);
await p.reload(); await ready();
check('entries are remembered in this browser', (await p.inputValue('[data-testid="r-name"]')) === 'Remembered Name');
await p.screenshot({ path: 'test-results/resume-desktop.png' });

// Phone
const phone = await b.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', isMobile: true, hasTouch: true });
const m = await phone.newPage();
m.on('pageerror', (e) => errors.push(e.message));
await m.goto(`${BASE}/students/resume-builder/`);
await m.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
await m.waitForSelector('text=Open preview', { timeout: 15000 });
check('phone: "Open preview" instead of an inline viewer', (await m.locator('[data-testid="preview"]').count()) === 0);
check('phone: no sideways scrolling', !(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
await m.screenshot({ path: 'test-results/resume-phone.png' });
check('no page errors', errors.length === 0, errors.join(' | '));

await b.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
