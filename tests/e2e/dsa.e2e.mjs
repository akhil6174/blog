/**
 * DSA sheet: renders every topic, ticks and stars saved in the browser when signed out, merged into the account
 * on sign-in, saved to the account, filters, badges, /me dashboard section, phone width.
 * Run against `npm run preview` with dev login:  node tests/e2e/dsa.e2e.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const H = { origin: BASE };
const RUN = Date.now().toString(36);
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  (${detail})` : ''}`); };
const b = await chromium.launch();
const hydrated = (p) => p.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
const ready = (p) => p.waitForFunction(() => document.querySelector('[data-mode]')?.getAttribute('data-mode') !== 'loading');
const row = (p, id) => p.locator(`li[data-id="${id}"]`).first();

// Signed out: device storage
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
await p.goto(`${BASE}/students/dsa-sheet/`);
await hydrated(p); await ready(p);
const html = await p.content();
check('page lists problems in the HTML (good for Google)', html.includes('Trapping Rain Water') && html.includes('Median of Two Sorted Arrays'));
check('all topics shown', (await p.locator('details[id]').count()) === 18, String(await p.locator('details[id]').count()));
check('signed-out note shown', (await p.textContent('body')).includes('saved in this browser only'));
await row(p, 'two-sum').locator('[data-testid=solve]').check();
await row(p, 'valid-anagram').locator('[data-testid=solve]').check();
await row(p, 'trapping-rain-water').locator('[data-testid=revise]').click();
check('ring shows 2 solved', (await p.locator('svg[aria-label="2 of 172 solved"]').count()) === 1);
check('first-step badge earned', (await p.locator('[data-badge=first]').getAttribute('data-earned')) === '1');
check('streak starts at 1', (await p.textContent('[data-testid=streak]')).trim() === '1');
await p.reload(); await hydrated(p); await ready(p);
check('ticks survive a reload (saved on the device)', await row(p, 'two-sum').locator('[data-testid=solve]').isChecked());
await p.selectOption('[data-testid=status]', 'revise');
check('"Starred to revise" filter shows only starred', (await p.locator('li[data-id]').count()) === 1);
await p.selectOption('[data-testid=status]', 'all');
await p.fill('#dsa-q', 'island');
check('search filters problems', (await p.locator('li[data-id]').count()) === 1 && (await row(p, 'number-of-islands').count()) === 1);
await p.fill('#dsa-q', '');

// Sign in: device progress merges into the account
const email = `dsa-${RUN}@example.com`;
await ctx.request.post(`${BASE}/api/auth/sign-up/email`, { headers: H, data: { email, password: 'localtest-password-1', name: 'Dsa Student' } });
await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { headers: H, data: { email, password: 'localtest-password-1' } });
await p.goto(`${BASE}/students/dsa-sheet/`); await hydrated(p); await ready(p);
check('signed-in mode', (await p.getAttribute('[data-mode]', 'data-mode')) === 'account');
let api = await (await ctx.request.get(`${BASE}/api/me/dsa`)).json();
check('device ticks merged into the account', api.progress.filter((x) => x.solvedAt).length === 2 && api.progress.some((x) => x.id === 'trapping-rain-water' && x.revise), JSON.stringify(api.progress));
check('device copy cleared after merge', (await p.evaluate(() => localStorage.getItem('trutiai-dsa-v1'))) === null);
await row(p, 'binary-search').locator('[data-testid=solve]').check();
await p.waitForTimeout(500);
await row(p, 'two-sum').locator('[data-testid=solve]').uncheck();
await p.waitForTimeout(500);
api = await (await ctx.request.get(`${BASE}/api/me/dsa`)).json();
check('ticks and unticks are saved to the account', api.progress.some((x) => x.id === 'binary-search' && x.solvedAt) && !api.progress.some((x) => x.id === 'two-sum'), JSON.stringify(api.progress));

check('company-wise section removed', !(await p.textContent('body')).includes('Asked at') && (await p.locator('#dsa-company').count()) === 0);
await p.screenshot({ path: 'test-results/dsa-sheet.png', fullPage: false });

// Dashboard
const me = await (await ctx.request.get(`${BASE}/me/`)).text();
check('/me shows the DSA section with solved count', me.includes('data-testid="dsa"') && /data-testid="dsa-solved">2</.test(me), /data-testid="dsa-solved">(\d+)/.exec(me)?.[1]);
check('/me shows earned badges', me.includes('🏅 First step'));
check('students hub links the sheet', (await (await ctx.request.get(`${BASE}/students/`)).text()).includes('/students/dsa-sheet/'));

const m = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await m.goto(`${BASE}/students/dsa-sheet/`); await hydrated(m);
check('phone: no sideways scrolling', !(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

await b.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
