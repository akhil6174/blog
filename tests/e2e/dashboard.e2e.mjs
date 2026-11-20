/**
 * Writer dashboard (/me): this-month tiles and 12-month charts, ambassador codes (admin creates, student redeems),
 * students-joined count, profile editor (GitHub, LinkedIn, photo upload/remove) and links on the writer page.
 * Run against `npm run preview` with dev login:  node tests/e2e/dashboard.e2e.mjs
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
const api = async (data, ctx = admin) => { const r = await ctx.request.post(`${BASE}/api/admin/ambassadors`, { headers: H, data }); return { status: r.status(), ...(await r.json().catch(() => ({}))) }; };
const html = async (ctx, path) => (await ctx.request.get(`${BASE}${path}`)).text();
// The profile form always sends every field, so the API replaces the whole profile; send a name each time.
const patchMe = async (ctx, data) => { const r = await ctx.request.patch(`${BASE}/api/me`, { headers: H, data: { name: 'Test Person', ...data } }); return { status: r.status(), ...(await r.json().catch(() => ({}))) }; };

// Dashboard basics
const student = await signedIn(`dash-${RUN}@example.com`);
const me = await html(student, '/me/');
check('dashboard shows this-month tiles', me.includes('data-testid="month-tiles"') && /Articles published/.test(me) && /Upvotes/.test(me) && /Comments/.test(me) && /Views/.test(me));
check('dashboard shows four charts', (me.match(/<svg[^>]*role="img"/g) ?? []).length >= 4, String((me.match(/<svg[^>]*role="img"/g) ?? []).length));
check('non-ambassadors see the code box', me.includes('data-testid="amb-code"'));

// Profile links
check('GitHub username is accepted and normalised', (await patchMe(student, { github: '@octo-cat', linkedin: 'https://www.linkedin.com/in/octo-cat-123/' })).status === 200);
check('a bad GitHub value is refused', (await patchMe(student, { github: 'https://evil.example.com/x' })).status === 400);
const links = { github: '@octo-cat', linkedin: 'https://www.linkedin.com/in/octo-cat-123/' };
const session = await (await student.request.get(`${BASE}/api/auth/get-session`)).json();
const handle = session.user.handle;

// Ambassador code flow
const C = `Gamma Engineering College ${RUN}`;
await api({ action: 'add_colleges', text: `${C} | Nagpur | Maharashtra` });
const adminPage = await html(admin, `/admin/ambassadors/?q=${encodeURIComponent(RUN)}`);
const id = Number(new RegExp(String.raw`<tr data-id="(\d+)"[^>]*>\s*<td[^>]*><strong>` + C).exec(adminPage)?.[1]);
check('college added', id > 0);
const made = await api({ action: 'create_code', id });
check('admin creates a code', /^AMB-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(made.code ?? ''), JSON.stringify(made));
check('code shown on admin page', (await html(admin, `/admin/ambassadors/?q=${encodeURIComponent(RUN)}`)).includes(made.code));
check('non-admins cannot create codes', (await api({ action: 'create_code', id }, student)).status === 403);
const bad = await student.request.post(`${BASE}/api/me/ambassador`, { headers: H, data: { code: 'AMB-ZZZZ-ZZZZ' } });
check('a wrong code is refused', bad.status() === 400);
const ok = await student.request.post(`${BASE}/api/me/ambassador`, { headers: H, data: { code: made.code.toLowerCase() } });
check('student redeems the code (any letter case)', ok.status() === 200, await ok.text());
const reuse = await (await signedIn(`dash2-${RUN}@example.com`)).request.post(`${BASE}/api/me/ambassador`, { headers: H, data: { code: made.code } });
check('reader becomes writer at once (cached session cleared)', (await (await student.request.get(`${BASE}/api/auth/get-session`)).json()).user.role === 'writer' && (await html(student, '/me/')).includes('role: writer'));
check('a used code cannot be used again', reuse.status() === 400);

// Students who joined from the college
for (const n of [1, 2]) { const c = await signedIn(`classmate${n}-${RUN}@example.com`); await patchMe(c, { college: C.toUpperCase() }); }
const ambMe = await html(student, '/me/');
check('ambassador section on /me', ambMe.includes(`Campus Ambassador · ${C}`) && ambMe.includes('id="ambassador"'));
check('students joined counted (case-insensitive, not counting the ambassador)', /data-testid="amb-students">2</.test(ambMe), /data-testid="amb-students">(\d+)/.exec(ambMe)?.[1]);
check('ambassador college is locked on the profile', /data-testid="college"[^>]*readonly|readonly[^>]*data-testid="college"/.test(ambMe));
check('admin sees the joined count', /data-testid="joined">2</.test(await html(admin, `/admin/ambassadors/?q=${encodeURIComponent(RUN)}`)));
check('ambassador cannot change their college', (await patchMe(student, { ...links, college: 'Somewhere Else' })).status === 200 && (await html(student, '/me/')).includes(`value="${C}"`));

// Writer page links
const wp = await html(admin, `/writer/${handle}/`);
check('writer page links GitHub', wp.includes('href="https://github.com/octo-cat"'));
check('writer page links LinkedIn', wp.includes('href="https://www.linkedin.com/in/octo-cat-123"'));

// Photo upload in the browser
const p = await student.newPage();
await p.goto(`${BASE}/me/#profile-title`);
await p.waitForFunction(() => document.readyState === 'complete');
const png = await p.evaluate(async () => { const c = document.createElement('canvas'); c.width = 600; c.height = 300; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 600, 300); return c.toDataURL('image/png').split(',')[1]; });
await p.setInputFiles('[data-testid="photo-file"]', { name: 'me.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
await p.waitForFunction(() => /Photo ready|could not/i.test(document.getElementById('photo-msg')?.textContent ?? ''), null, { timeout: 15000 });
const val = await p.inputValue('#photo-value');
check('photo uploads (cropped square)', /^\/media\//.test(val), await p.textContent('#photo-msg'));
await Promise.all([p.waitForEvent('load', { timeout: 15000 }).catch(() => {}), p.click('#profile button[type="submit"], #profile button:not([type])')]);
await p.waitForLoadState('load');
check('photo saved to the profile', (await html(student, '/me/')).includes(`src="${val}"`));
await p.screenshot({ path: 'test-results/dashboard.png', fullPage: true });
check('photo removed', (await patchMe(student, { ...links, image: '' })).status === 200 && !(await html(student, '/me/')).includes(`src="${val}"`));

const m = await (await signedIn(`dash-${RUN}@example.com`)).newPage();
await m.setViewportSize({ width: 390, height: 844 });
await m.goto(`${BASE}/me/`);
check('phone: no sideways scrolling', !(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)));

await api({ action: 'remove', id });
await api({ action: 'delete', id });
await b.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
