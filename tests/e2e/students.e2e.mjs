/**
 * Students section: hub page, the three calculators with real typing, FAQ structured data, mobile layout.
 * Run against `npm run preview`:  node tests/e2e/students.e2e.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  (${detail})` : ''}`); };
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
// Astro removes the `ssr` attribute once an island's JavaScript has taken over; typing before that is lost.
const ready = (page = p) => page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
const text = (sel) => p.textContent(sel).then((t) => (t ?? '').replace(/\s+/g, ' ').trim());

// Hub
await p.goto(`${BASE}/students/`);
check('hub page lists the three tools', (await p.locator('a[href="/students/attendance-calculator/"]').count()) > 0 && (await p.locator('a[href="/students/cgpa-calculator/"]').count()) > 0 && (await p.locator('a[href="/students/cgpa-to-percentage/"]').count()) > 0);
check('header links to Students', (await p.locator('#site-header a[href="/students/"]').count()) > 0);
await p.screenshot({ path: 'test-results/students-hub.png', fullPage: true });

// Attendance
await p.goto(`${BASE}/students/attendance-calculator/`);
await p.waitForSelector('[data-testid="attendance-result"]');
await ready();
check('attendance: example shows 80.95% and 3 classes to spare', /80\.95%/.test(await text('[data-testid="attendance-result"]')) && (await text('[data-testid="can-miss"]')) === '3');
await p.fill('[data-testid="attended"]', '20'); await p.fill('[data-testid="held"]', '40');
check('attendance: 20 of 40 needs 40 classes to recover', (await text('[data-testid="must-attend"]')) === '40', await text('[data-testid="attendance-result"]'));
await p.fill('[data-testid="attended"]', '30'); await p.fill('[data-testid="left"]', '20');
check('attendance: plan for the rest of the semester', /can miss 5 and still finish/.test(await text('[data-testid="plan"]')), await text('[data-testid="plan"]'));
await p.fill('[data-testid="attended"]', '50');
check('attendance: impossible input explained', /cannot be more than/.test(await text('[data-testid="attendance-result"]')));
const ld = await p.$$eval('script[type="application/ld+json"]', (s) => s.map((x) => JSON.parse(x.textContent)['@type']));
check('attendance: FAQ, tool and breadcrumb structured data', ['FAQPage', 'WebApplication', 'BreadcrumbList'].every((t) => ld.includes(t)), ld.join(','));

// SGPA / CGPA
await p.goto(`${BASE}/students/cgpa-calculator/`);
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForSelector('[data-testid="sgpa"]');
await ready();
// Example: 4x9 + 4x8 + 3x8 + 2x10 = 36+32+24+20 = 112 / 13 = 8.615
check('SGPA: example subjects give 8.62', (await text('[data-testid="sgpa"]')) === '8.62', await text('[data-testid="sgpa"]'));
await p.selectOption('[data-testid="grade-0"]', '10');
check('SGPA: changing a grade updates it (9.92 -> 8.92)', (await text('[data-testid="sgpa"]')) === '8.92', await text('[data-testid="sgpa"]'));
await p.click('[data-testid="tab-cgpa"]');
// Example: 8.2x22 + 8.6x24 = 180.4 + 206.4 = 386.8 / 46 = 8.4087
check('CGPA: example semesters give 8.41 (credit-weighted)', (await text('[data-testid="cgpa"]')) === '8.41', await text('[data-testid="cgpa"]'));
await p.fill('[data-testid="sem-credits-0"]', ''); await p.fill('[data-testid="sem-credits-1"]', '');
check('CGPA: without credits it is a simple average (8.40)', (await text('[data-testid="cgpa"]')) === '8.40');
await p.reload(); await ready(); await p.click('[data-testid="tab-cgpa"]');
check('CGPA: entries are remembered in this browser', (await p.inputValue('[data-testid="sem-credits-0"]')) === '');

// Percentage
await p.goto(`${BASE}/students/cgpa-to-percentage/?cgpa=8`);
await p.waitForSelector('[data-testid="pct"]');
await ready();
check('percentage: CGPA from the link, ×10 gives 80%', (await text('[data-testid="pct"]')) === '80.00%', await text('[data-testid="pct"]'));
await p.check('[data-testid="f-vtu"]');
check('percentage: VTU formula gives 72.50%', (await text('[data-testid="pct"]')) === '72.50%');
await p.check('[data-testid="f-times95"]');
check('percentage: ×9.5 gives 76.00%', (await text('[data-testid="pct"]')) === '76.00%');
await p.fill('[data-testid="cgpa-in"]', '12');
check('percentage: out-of-range CGPA explained', /between 0 and 10/.test(await text('[data-testid="pct"] + p')));

// Phone
const m = await b.newPage({ viewport: { width: 390, height: 844 } });
m.on('pageerror', (e) => errors.push(e.message));
for (const path of ['/students/', '/students/attendance-calculator/', '/students/cgpa-calculator/', '/students/cgpa-to-percentage/']) {
  await m.goto(`${BASE}${path}`);
  await m.waitForTimeout(300);
  check(`phone: no sideways scrolling on ${path}`, !(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
}
await m.goto(`${BASE}/students/attendance-calculator/`); await m.waitForTimeout(400);
await m.screenshot({ path: 'test-results/students-attendance-phone.png', fullPage: false });
check('no page errors', errors.length === 0, errors.join(' | '));

await b.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
