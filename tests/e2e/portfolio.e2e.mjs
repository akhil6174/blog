/**
 * Portfolio builder: live preview, 12 templates, custom colours, reuse resume details, photo, zip and HTML
 * downloads, launch guide, students hub link, phone width. Saves a screenshot of every template.
 * Run against `npm run preview`:  node tests/e2e/portfolio.e2e.mjs
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  (${detail})` : ''}`); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(`${BASE}/students/portfolio-builder/`);
await p.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
const preview = () => p.getAttribute('[data-testid=preview]', 'srcdoc');

check('preview shows the sample portfolio', (await preview()).includes('<title>Your Name'));
check('12 templates offered', (await p.locator('[data-template]').count()) === 12, String(await p.locator('[data-template]').count()));
await p.locator('label:has-text("Name") input').first().fill('Asha Verma');
check('typing updates the preview', (await preview()).includes('<h1>Asha Verma</h1>'));

for (const t of await p.locator('[data-template]').evaluateAll((els) => els.map((e) => e.dataset.template))) {
  await p.click(`[data-template="${t}"]`);
  const html = await preview();
  const f = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await f.setContent(html);
  await f.screenshot({ path: `test-results/portfolio-${t}.png` });
  const wide = await f.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  await f.setViewportSize({ width: 375, height: 800 });
  const phone = await f.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  check(`template ${t}: renders, fits desktop and phone`, html.includes(`(${t})`) && !wide && !phone, `${wide} ${phone}`);
  await f.context().close();
}

await p.click('[data-template="minimal"]');
await p.click('[data-testid=colours] summary');
await p.locator('[data-colour=bg]').evaluate((el) => { el.value = '#123456'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await p.locator('[data-colour=accent]').evaluate((el) => { el.value = '#ffcc00'; el.dispatchEvent(new Event('input', { bubbles: true })); });
let html = await preview();
check('custom background colour applied', html.includes('--bg:#123456'));
check('button text turns dark on a light button colour', html.includes('--a:#ffcc00') && html.includes('--on-a:#111111'));
await p.reload(); await p.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
await p.waitForTimeout(300);
check('choices saved in the browser', (await preview()).includes('--bg:#123456') && (await preview()).includes('Asha Verma'));
await p.click('[data-testid=colours] summary');
await p.click('text=Reset to the template’s colours');
check('reset restores template colours', (await preview()).includes('--bg:#ffffff'));

// Reuse resume details
await p.evaluate(() => localStorage.setItem('trutiai-resume-v1', JSON.stringify({ data: { name: 'Ravi From Resume', headline: 'ML student', projects: [{ name: 'Crop Doctor', tech: 'Python', link: 'github.com/ravi/crop', points: 'Detects leaf disease' }] } })));
await p.click('[data-testid=use-resume]');
html = await preview();
check('fills in from the resume builder', html.includes('Ravi From Resume') && html.includes('Crop Doctor') && html.includes('href="https://github.com/ravi/crop"'));

// Photo
const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 500; c.height = 300; const g = c.getContext('2d'); g.fillStyle = '#2a7'; g.fillRect(0, 0, 500, 300); return c.toDataURL('image/png').split(',')[1]; });
await p.setInputFiles('[data-testid=photo]', { name: 'me.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
await p.waitForFunction(() => document.querySelector('[data-testid=preview]').getAttribute('srcdoc').includes('class="photo"'));
check('photo embedded in the page', (await preview()).includes('src="data:image/jpeg;base64,'));

// Downloads
const [zipDl] = await Promise.all([p.waitForEvent('download'), p.click('[data-testid=download-zip]')]);
const zip = readFileSync(await zipDl.path());
check('zip download named after the student', zipDl.suggestedFilename() === 'ravi-from-resume-portfolio.zip', zipDl.suggestedFilename());
check('zip contains index.html and README.md', zip.readUInt32LE(0) === 0x04034b50 && zip.includes(Buffer.from('index.html')) && zip.includes(Buffer.from('README.md')) && zip.includes(Buffer.from('Ravi From Resume')));
const [htmlDl] = await Promise.all([p.waitForEvent('download'), p.click('[data-testid=download-html]')]);
check('index.html download', htmlDl.suggestedFilename() === 'index.html' && readFileSync(await htmlDl.path(), 'utf8').startsWith('<!doctype html>'));

const page = await p.content();
check('launch guide covers Netlify and Vercel', page.includes('id="launch"') && page.includes('app.netlify.com/drop') && page.includes('vercel.com/new') && page.includes('npx vercel'));
check('students hub links the builder', (await (await ctx.request.get(`${BASE}/students/`)).text()).includes('/students/portfolio-builder/'));
check('no script errors', errors.length === 0, errors.join(' | '));
await p.screenshot({ path: 'test-results/portfolio-builder.png' });

const m = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await m.goto(`${BASE}/students/portfolio-builder/`);
check('phone: no sideways scrolling', !(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

await b.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
