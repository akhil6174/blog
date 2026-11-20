/**
 * Sign-in lands on the home page; the write page opens light even when the device prefers dark; in the editor's
 * dark theme every visible button and link keeps readable text when hovered.
 * Run against `npm run preview` with dev login:  node tests/e2e/theme.e2e.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const H = { origin: BASE };
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  (${detail})` : ''}`); };
const b = await chromium.launch();

// Sign-in page without ?next= sends people home (local form; Google uses the same destination).
const anonCtx = await b.newContext();
const anon = await anonCtx.newPage();
const who = `theme-${Date.now().toString(36)}@example.com`;
await anonCtx.request.post(`${BASE}/api/auth/sign-up/email`, { headers: H, data: { email: who, password: 'localtest-password-1', name: 'Theme Test' } });
await anonCtx.clearCookies();
await anon.goto(`${BASE}/signin/`);
check('the page passes the home page as the destination', (await anon.content()).includes('"safeNext":"/"') || /safeNext = "\/"/.test(await anon.content()));
await anon.fill('#dev-form input[name=email]', who);
await anon.fill('#dev-form input[name=password]', 'localtest-password-1');
await anon.click('#dev-form button[data-mode=signin]');
await anon.waitForURL((u) => !u.pathname.startsWith('/signin'), { timeout: 15000 }).catch(() => {});
check('after signing in, the user lands on the home page', new URL(anon.url()).pathname === '/', anon.url());

const ctx = await b.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 800 } });
const email = 'akhil6174dwivedi@gmail.com'; // admin test account: can always write
await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { headers: H, data: { email, password: 'localtest-password-1' } });
const p = await ctx.newPage();
await p.goto(`${BASE}/write/`);
await p.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
await p.waitForTimeout(800);
check('write page is light by default, even on a dark device', !(await p.evaluate(() => document.documentElement.classList.contains('editor-dark'))));
await p.screenshot({ path: 'test-results/write-light.png' });

await p.click('button[aria-label="Switch to dark theme"]');
await p.waitForTimeout(300);
check('dark theme can still be switched on', await p.evaluate(() => document.documentElement.classList.contains('editor-dark')));
const low = [];
for (const el of (await p.$$('button:visible, a:visible')).slice(0, 80)) {
  try {
    await el.hover({ timeout: 500 });
    await p.waitForTimeout(40);
    const v = await el.evaluate((e) => {
      const rgb = (c) => (c.match(/[\d.]+/g) || ['0', '0', '0']).map(Number);
      const lum = ([r, g, b2]) => [r, g, b2].map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }).reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i], 0);
      let n = e, bg = 'rgb(17,18,20)';
      while (n) { const c = rgb(getComputedStyle(n).backgroundColor); if ((c[3] ?? 1) > 0.5) { bg = getComputedStyle(n).backgroundColor; break; } n = n.parentElement; }
      const a = lum(rgb(getComputedStyle(e).color)), c = lum(rgb(bg));
      return { t: (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 30), ratio: +((Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05)).toFixed(2) };
    });
    if (v.t && v.ratio < 3) low.push(v);
  } catch { /* hidden or detached */ }
}
check('dark theme: hovered buttons and links keep readable text', low.length === 0, JSON.stringify(low));
await p.mouse.move(5, 5);
await p.screenshot({ path: 'test-results/write-dark.png' });
await p.click('button[aria-label="Switch to light theme"]');

await b.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
