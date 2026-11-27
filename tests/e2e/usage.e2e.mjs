/**
 * Tool usage counts (D-049): visits, first use, resume and portfolio downloads, DSA ticks reach /admin/usage;
 * unknown events refused; non-admins cannot see the page. Plus: creating an ambassador code keeps the page where
 * it is and shows the code in its row.
 * Run against `npm run preview` with dev login:  node tests/e2e/usage.e2e.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const H = { origin: BASE };
const RUN = Date.now().toString(36);
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  (${detail})` : ''}`); };
const b = await chromium.launch();
const admin = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
await admin.request.post(`${BASE}/api/auth/sign-in/email`, { headers: H, data: { email: 'akhil6174dwivedi@gmail.com', password: 'localtest-password-1' } });
const hydrated = (p) => p.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);

async function counts() {
  const html = await (await admin.request.get(`${BASE}/admin/usage/`)).text();
  const get = (row, cell) => Number((new RegExp(String.raw`data-row="${row}"[\s\S]*?data-cell="${cell}">([\d,]+)<`).exec(html)?.[1] ?? '-1').replace(/,/g, ''));
  return { get, html };
}
const before = await counts();
check('usage page loads with all tools', before.html.includes('Resume builder') && before.html.includes('DSA sheet') && before.html.includes('Portfolio builder'));

const v = await b.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
const p = await v.newPage();
// Resume: view, use, download
await p.goto(`${BASE}/students/resume-builder/`); await hydrated(p);
await p.locator('input').first().fill('Test Person');
await p.waitForSelector('[data-testid=download]:not([disabled])', { timeout: 20000 });
await Promise.all([p.waitForEvent('download'), p.click('[data-testid=download]')]);
// Portfolio: view, use, zip
await p.goto(`${BASE}/students/portfolio-builder/`); await hydrated(p);
await Promise.all([p.waitForEvent('download'), p.click('[data-testid=download-zip]')]);
// DSA: view, tick
await p.goto(`${BASE}/students/dsa-sheet/`); await hydrated(p);
await p.locator('li[data-id="two-sum"] [data-testid=solve]').check();
// Attendance: view only
await p.goto(`${BASE}/students/attendance-calculator/`); await hydrated(p);
await p.goto(`${BASE}/`); // leave so the last beacon is sent
await p.waitForTimeout(1500);

const after = await counts();
const diff = (row, cell = 'today') => after.get(row, cell) - before.get(row, cell);
check('resume visit counted', diff('resume-builder:view') === 1, String(diff('resume-builder:view')));
check('resume first use counted once', diff('resume-builder:use') === 1, String(diff('resume-builder:use')));
check('resume PDF download counted', diff('resume-builder:download') === 1, String(diff('resume-builder:download')));
check('portfolio zip download counted', diff('portfolio-builder:download_zip') === 1);
check('DSA tick counted', diff('dsa-sheet:solve') === 1);
check('attendance visit counted, not used', diff('attendance-calculator:view') === 1 && diff('attendance-calculator:use') === 0);
check('all-time column grows too', diff('dsa-sheet:solve', 'all') === 1);
check('unknown tool refused', (await v.request.post(`${BASE}/api/track`, { headers: H, data: { tool: 'hack', action: 'view' } })).status() === 400);
check('unknown action refused', (await v.request.post(`${BASE}/api/track`, { headers: H, data: { tool: 'dsa-sheet', action: 'download' } })).status() === 400);
check('non-admins cannot see usage', (await v.request.get(`${BASE}/admin/usage/`, { maxRedirects: 0 })).status() !== 200);
const ap = await admin.newPage();
await ap.goto(`${BASE}/admin/usage/`);
await ap.screenshot({ path: 'test-results/usage.png', fullPage: true });

// Ambassador code: no jump
const college = `Scroll Test College ${RUN}`;
const many = Array.from({ length: 30 }, (_, i) => `${college} ${String(i).padStart(2, '0')}`).join('\n');
await admin.request.post(`${BASE}/api/admin/ambassadors`, { headers: H, data: { action: 'add_colleges', text: many } });
await ap.goto(`${BASE}/admin/ambassadors/?status=open&q=${encodeURIComponent(college)}`);
const target = ap.locator('tr', { hasText: `${college} 25` }).locator('button:has-text("Create code")');
await target.scrollIntoViewIfNeeded();
const y0 = await ap.evaluate(() => scrollY);
await target.click();
await ap.waitForSelector(`tr:has-text("${college} 25") [data-testid=code]`, { timeout: 10000 });
await ap.waitForTimeout(800);
const y1 = await ap.evaluate(() => scrollY);
check('creating a code keeps the page in place', y0 > 200 && Math.abs(y1 - y0) < 5, `${y0} -> ${y1}`);
check('code shown in its row', /^AMB-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test((await ap.locator(`tr:has-text("${college} 25") [data-testid=code]`).textContent()).trim()));
check('message shown as a pop-up', (await ap.locator('#flash').isVisible()) && (await ap.textContent('#flash')).includes('Code created'));
// another action reloads but comes back to the same place
const del = ap.locator('tr', { hasText: `${college} 20` }).locator('button:has-text("Delete college")');
await del.scrollIntoViewIfNeeded();
const y2 = await ap.evaluate(() => scrollY);
ap.once('dialog', (d) => d.accept());
await Promise.all([ap.waitForEvent('load'), del.click()]);
await ap.waitForTimeout(500);
const y3 = await ap.evaluate(() => scrollY);
check('after a reload the page returns to the same place', Math.abs(y3 - y2) < 60, `${y2} -> ${y3}`);
check('message survives the reload', (await ap.textContent('#flash')).includes('deleted'));
check('New code button still works after in-place update', await (async () => {
  const row = ap.locator('tr', { hasText: `${college} 25` });
  const old = (await row.locator('[data-testid=code]').textContent()).trim();
  ap.once('dialog', (d) => d.accept());
  await row.locator('button:has-text("New code")').click();
  await ap.waitForFunction((o) => { const c = [...document.querySelectorAll('[data-testid=code]')].map((x) => x.textContent.trim()); return !c.includes(o); }, old, { timeout: 10000 });
  return true;
})());

// clean up
const html = await (await admin.request.get(`${BASE}/admin/ambassadors/?q=${encodeURIComponent(college)}`)).text();
for (const m of html.matchAll(/<tr data-id="(\d+)"/g)) await admin.request.post(`${BASE}/api/admin/ambassadors`, { headers: H, data: { action: 'delete', id: Number(m[1]) } });

await b.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
