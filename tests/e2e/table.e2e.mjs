/**
 * Table dialog: the writer chooses rows, columns and whether the first row is a header.
 * Run against `npm run preview` with dev login:  node tests/e2e/table.e2e.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const H = { origin: BASE };
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  (${detail})` : ''}`); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { headers: H, data: { email: 'akhil6174dwivedi@gmail.com', password: 'localtest-password-1' } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${BASE}/write/`);
await page.waitForFunction(() => !!window.__editor);
await page.click('.ProseMirror');

const tables = () => page.evaluate(() => (window.__editor.getJSON().content ?? []).filter((n) => n.type === 'table').map((t) => ({ rows: t.content.length, cols: t.content[0].content.length, header: t.content[0].content.every((c) => c.type === 'tableHeader'), bodyHeaders: t.content.slice(1).some((r) => r.content.some((c) => c.type === 'tableHeader')) })));

await page.click('button[aria-label="Table"]');
check('toolbar button opens the table dialog', await page.isVisible('[data-testid="table-rows"]'));
check('dialog starts at 3 x 3 with header', (await page.inputValue('[data-testid="table-rows"]')) === '3' && (await page.inputValue('[data-testid="table-cols"]')) === '3' && (await page.isChecked('[data-testid="table-header"]')));
await page.fill('[data-testid="table-rows"]', '6');
await page.fill('[data-testid="table-cols"]', '4');
await page.uncheck('[data-testid="table-header"]');
check('preview shows the chosen size', /6 × 4/.test(await page.textContent('form:has([data-testid="table-rows"])')));
await page.click('button:has-text("Insert table")');
let t = await tables();
check('inserts 6 rows x 4 columns without header', t.length === 1 && t[0].rows === 6 && t[0].cols === 4 && !t[0].header, JSON.stringify(t));

// Move the cursor out of the table, then insert a second one through the "/" menu with a header.
await page.evaluate(() => window.__editor.chain().focus('end').insertContent({ type: 'paragraph' }).focus('end').run());
await page.keyboard.type('/table');
await page.keyboard.press('Enter');
check('slash menu opens the same dialog, remembering the last size', (await page.inputValue('[data-testid="table-rows"]')) === '6' && !(await page.isChecked('[data-testid="table-header"]')));
await page.fill('[data-testid="table-rows"]', '2');
await page.fill('[data-testid="table-cols"]', '5');
await page.check('[data-testid="table-header"]');
await page.click('button:has-text("Insert table")');
t = await tables();
check('inserts 2 x 5 with a header row', t.length === 2 && t[1].rows === 2 && t[1].cols === 5 && t[1].header && !t[1].bodyHeaders, JSON.stringify(t));

await page.evaluate(() => window.__editor.chain().focus('end').insertContent({ type: 'paragraph' }).focus('end').run());
await page.click('button[aria-label="Table"]');
await page.fill('[data-testid="table-rows"]', '500');
await page.fill('[data-testid="table-cols"]', '99');
await page.click('button:has-text("Insert table")');
if (await page.isVisible('[data-testid="table-rows"]')) {
  // The browser's own min/max validation blocked it: good. Use the largest allowed values instead.
  await page.fill('[data-testid="table-rows"]', '50');
  await page.fill('[data-testid="table-cols"]', '10');
  await page.click('button:has-text("Insert table")');
}
t = await tables();
check('sizes are limited to 50 x 10', t.length === 3 && t[2].rows === 50 && t[2].cols === 10, JSON.stringify(t[2]));
await page.click('.ProseMirror table td');
check('toolbar table button is disabled inside a table', await page.isDisabled('button[aria-label="Table"]'));
await page.screenshot({ path: 'test-results/table-dialog.png' });
check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
