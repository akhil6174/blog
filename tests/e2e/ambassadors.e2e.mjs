/**
 * Campus ambassadors: add colleges, one ambassador per college (and per person), badge on the writer page and
 * /me, public page lists ambassadors and open colleges, certificate tracking, removal, admin-only actions.
 * Run against `npm run preview` with dev login:  node tests/e2e/ambassadors.e2e.mjs
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
const A = `Alpha Institute ${RUN}`, B = `Beta College ${RUN}`;

const added = await api({ action: 'add_colleges', text: `${A} | Pune | Maharashtra\n${B} | Chennai | Tamil Nadu\n${A}` });
check('colleges are added, duplicates skipped', /2 colleges added/.test(added.message ?? ''), JSON.stringify(added));
const again = await api({ action: 'add_colleges', text: A.toLowerCase() });
check('a college already in the list is not added twice (any letter case)', /0 colleges added/.test(again.message ?? ''), again.message);
const page = await html(admin, `/admin/ambassadors/?q=${encodeURIComponent(RUN)}`);
const idOf = (name) => Number(new RegExp(String.raw`<tr data-id="(\d+)"[^>]*>\s*<td[^>]*><strong>` + name).exec(page)?.[1]);
const idA = idOf(A), idB = idOf(B);
check('admin page lists the colleges', idA > 0 && idB > 0, `${idA} ${idB}`);

const email = `amb-${RUN}@example.com`;
check('assigning needs an existing account', (await api({ action: 'assign', id: idA, email })).status === 400);
const amb = await signedIn(email);
const me = await (await amb.request.get(`${BASE}/api/auth/get-session`)).json();
const asg = await api({ action: 'assign', id: idA, email });
check('ambassador assigned', asg.status === 200, JSON.stringify(asg));
check('one ambassador per college', (await api({ action: 'assign', id: idA, email: 'akhil6174dwivedi@gmail.com' })).status === 400);
check('one college per ambassador', (await api({ action: 'assign', id: idB, email })).status === 400);

const writer = await html(b.contexts()[0] ?? admin, `/writer/${me.user.handle}/`);
check('badge on the writer page', writer.includes(`Campus Ambassador · ${A}`), writer.slice(0, 200));
check('badge on the ambassador’s own account page', (await html(amb, '/me/')).includes(`Campus Ambassador · ${A}`));
check('profile college filled in', (await html(amb, '/me/')).includes(`value="${A}"`));
check('the ambassador is notified', (await html(amb, '/me/notifications/')).includes(`Campus Ambassador for ${A}`));

const anon = await b.newContext();
const pub = await html(anon, '/students/campus-ambassadors/');
check('public page lists the ambassador with college', pub.includes(me.user.name) && pub.includes(A));
check('public page lists open colleges', pub.includes(B));
check('public page explains the benefits', /Certificate/.test(pub) && /Internship priority/.test(pub) && /Your name on the site/.test(pub));
check('students hub links to it', (await html(anon, '/students/')).includes('/students/campus-ambassadors/'));

check('certificate marked sent', (await api({ action: 'certificate', id: idA, sent: true })).status === 200 && (await html(admin, `/admin/ambassadors/?q=${encodeURIComponent(A)}`)).includes('Sent '));
check('a college with an ambassador cannot be deleted', (await api({ action: 'delete', id: idA })).status === 400);
check('non-admins are refused', (await api({ action: 'remove', id: idA }, amb)).status === 403);
check('ambassador removed', (await api({ action: 'remove', id: idA })).status === 200);
check('badge gone after removal', !(await html(anon, `/writer/${me.user.handle}/`)).includes('Campus Ambassador ·'));
check('open college can be deleted', (await api({ action: 'delete', id: idB })).status === 200);

const p = await admin.newPage();
await p.goto(`${BASE}/students/campus-ambassadors/`);
await p.screenshot({ path: 'test-results/ambassadors-public.png', fullPage: true });
const m = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await m.goto(`${BASE}/students/campus-ambassadors/`);
check('phone: no sideways scrolling', !(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
await api({ action: 'delete', id: idA });

await b.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
