/**
 * /people/ page: off by default (404), admin adds an intern and an ambassador with a photo, turns the page on,
 * profiles and assigned ambassadors appear, hide/edit/delete work, non-admins are refused, page can be turned off.
 * Run against `npm run preview` with dev login:  node tests/e2e/people.e2e.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const H = { origin: BASE };
const RUN = Date.now().toString(36);
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  (${detail})` : ''}`); };
const b = await chromium.launch();
async function signedIn(email) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.request.post(`${BASE}/api/auth/sign-up/email`, { headers: H, data: { email, password: 'localtest-password-1', name: email.split('@')[0] } });
  await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { headers: H, data: { email, password: 'localtest-password-1' } });
  return ctx;
}
const admin = await signedIn('akhil6174dwivedi@gmail.com');
const api = async (data, ctx = admin) => { const r = await ctx.request.post(`${BASE}/api/admin/people`, { headers: H, data }); return { status: r.status(), ...(await r.json().catch(() => ({}))) }; };
const anon = await b.newContext();
const pub = async () => { const r = await anon.request.get(`${BASE}/people/`); return { status: r.status(), html: await r.text() }; };

await api({ action: 'settings', open: false });
check('page is off: visitors get 404', (await pub()).status === 404);

// Add through the admin page UI
const p = await admin.newPage();
await p.goto(`${BASE}/admin/people/`);
check('admin page shows OFF', (await p.textContent('[data-testid=state]')).trim() === 'OFF');
const form = p.locator('details:has(summary:has-text("Add a profile")) form');
await p.locator('details:has(summary:has-text("Add a profile"))').evaluate((d) => { d.open = true; });
const intern = `Intern ${RUN}`;
await form.locator('[name=name]').fill(intern);
await form.locator('[name=role]').fill('Technical Content Intern');
await form.locator('[name=college]').fill('College of Engineering, Pune');
await form.locator('[name=period]').fill('Jun – Aug 2026');
await form.locator('[name=summary]').fill('Built three projects and published an article on each.');
await form.locator('[name=github]').fill('@intern-dev');
await form.locator('[name=highlightUrl]').fill('https://trutiai.in/blog/example/');
await form.locator('[name=highlightLabel]').fill('Read their article');
const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 300; c.height = 300; const g = c.getContext('2d'); g.fillStyle = '#36c'; g.fillRect(0, 0, 300, 300); return c.toDataURL('image/png').split(',')[1]; });
await form.locator('.photo-file').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
await p.waitForFunction(() => /Uploaded|failed|read/.test(document.querySelector('.photo-msg')?.textContent ?? ''));
check('photo uploads', /^\/media\//.test(await form.locator('[name=photo]').inputValue()), await form.locator('.photo-msg').textContent());
await Promise.all([p.waitForEvent('load'), form.locator('button:has-text("Add profile")').click()]);
check('intern listed on admin page', (await p.textContent('body')).includes(intern));

const amb = `Ambassador ${RUN}`;
check('ambassador added (API)', (await api({ action: 'save', person: { kind: 'ambassador', name: amb, college: 'NIT Trichy', linkedin: 'linkedin.com/in/amb-person', sort: 1 } })).status === 200);
check('bad links refused', (await api({ action: 'save', person: { kind: 'intern', name: 'Bad Link', website: 'javascript:alert(1)' } })).status === 400);
check('photo must be an upload', (await api({ action: 'save', person: { kind: 'intern', name: 'Bad Photo', photo: 'https://evil.example/x.png' } })).status === 400);
const student = await signedIn(`people-${RUN}@example.com`);
check('non-admins refused', (await api({ action: 'settings', open: true }, student)).status === 403);
check('still 404 while off', (await pub()).status === 404);

// Turn on
await p.goto(`${BASE}/admin/people/`);
p.once('dialog', (d) => d.accept());
await Promise.all([p.waitForEvent('load'), p.click('#toggle')]);
check('admin page shows ON', (await p.textContent('[data-testid=state]')).trim() === 'ON');
let page = await pub();
check('page is public when on', page.status === 200, String(page.status));
check('intern shown with details', page.html.includes(intern) && page.html.includes('Internship completed') && page.html.includes('Read their article') && page.html.includes('href="https://github.com/intern-dev"'));
check('intern photo shown', /<img src="\/media\/[a-z0-9]+\.webp" alt="Photo of Intern/.test(page.html));
check('ambassador shown with LinkedIn', page.html.includes(amb) && page.html.includes('href="https://www.linkedin.com/in/amb-person"'));

// Assigned ambassadors appear automatically
const college = `Auto College ${RUN}`;
await admin.request.post(`${BASE}/api/admin/ambassadors`, { headers: H, data: { action: 'add_colleges', text: college } });
const ambPage = await (await admin.request.get(`${BASE}/admin/ambassadors/?q=${encodeURIComponent(RUN)}`)).text();
const cid = Number(new RegExp(String.raw`<tr data-id="(\d+)"[^>]*>\s*<td[^>]*><strong>` + college).exec(ambPage)?.[1]);
await admin.request.post(`${BASE}/api/admin/ambassadors`, { headers: H, data: { action: 'assign', id: cid, email: `people-${RUN}@example.com` } });
await api({ action: 'settings', auto: true });
check('assigned ambassadors listed automatically', (await pub()).html.includes(college));
await api({ action: 'settings', auto: false });
check('automatic list can be switched off', !(await pub()).html.includes(college));

// Hide, edit, delete
const ids = await (await admin.request.get(`${BASE}/admin/people/`)).text();
const internId = Number(new RegExp(String.raw`data-row="(\d+)"[\s\S]{0,600}?` + intern).exec(ids)?.[1]);
check('found intern id', internId > 0);
await api({ action: 'publish', id: internId, published: false });
check('hidden profile not shown', !(await pub()).html.includes(intern));
await api({ action: 'save', person: { id: internId, kind: 'intern', name: `${intern} Edited`, published: true } });
check('edit saves and shows again', (await pub()).html.includes(`${intern} Edited`));
await api({ action: 'delete', id: internId });
check('deleted profile gone', !(await pub()).html.includes(intern));

const m = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await m.goto(`${BASE}/people/`);
await m.screenshot({ path: 'test-results/people.png', fullPage: true });
check('phone: no sideways scrolling', !(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

// Turn off again
await api({ action: 'settings', open: false });
check('turned off: 404 again', (await pub()).status === 404);

// Clean up
const after = await (await admin.request.get(`${BASE}/admin/people/`)).text();
const ambId = Number(new RegExp(String.raw`data-row="(\d+)"[\s\S]{0,600}?` + amb).exec(after)?.[1]);
if (ambId) await api({ action: 'delete', id: ambId });
await admin.request.post(`${BASE}/api/admin/ambassadors`, { headers: H, data: { action: 'remove', id: cid } });
await admin.request.post(`${BASE}/api/admin/ambassadors`, { headers: H, data: { action: 'delete', id: cid } });
await api({ action: 'settings', auto: true });

await b.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
