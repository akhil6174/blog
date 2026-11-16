/**
 * End-to-end check of internship codes, against `npm run preview` (dev login): create a code, the intern can write,
 * the code box in the editor, code checks (wrong code, someone else's code), counting published articles on
 * /admin/internships, "ready for certificate", marking it sent, and deleting rules.
 *   node tests/e2e/internship.e2e.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const H = { origin: BASE };
const RUN = Date.now().toString(36);
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  (${detail})` : ''}`); };
const browser = await chromium.launch();
async function signedIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let r = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { headers: H, data: { email, password: 'localtest-password-1' } });
  if (!r.ok()) {
    await ctx.request.post(`${BASE}/api/auth/sign-up/email`, { headers: H, data: { email, password: 'localtest-password-1', name: email.split('@')[0] } });
    await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { headers: H, data: { email, password: 'localtest-password-1' } });
  }
  return ctx;
}
const admin = await signedIn('akhil6174dwivedi@gmail.com');
const html = async (ctx, path) => { const r = await ctx.request.get(`${BASE}${path}`); return { status: r.status(), text: await r.text() }; };
const ia = async (data) => { const r = await admin.request.post(`${BASE}/api/admin/internships`, { headers: H, data }); return { ok: r.ok(), ...(await r.json()) }; };
await admin.request.post(`${BASE}/api/admin/action`, { headers: H, data: { action: 'set_settings', values: { internship_articles: '3', posts_per_day_new: '5', community_invite_only: 'true' } } });

check('dashboard links to the internships page', /href="\/admin\/internships\/"/.test((await html(admin, '/admin/')).text));
const email = `intern-${RUN}@example.com`;
const created = await ia({ action: 'create', name: `Intern ${RUN}`, email, note: 'Batch 1: todo app, weather CLI, blog API' });
const code = /(INT-[A-Z0-9]{4}-[A-Z0-9]{4})/.exec(created.message ?? '')?.[1];
check('code created before the intern signs in', created.ok && !!code && /as soon as they sign in/.test(created.message), created.error ?? created.message);
check('one code per email', !(await ia({ action: 'create', name: 'Again', email })).ok);
const otherEmail = `other-${RUN}@example.com`;
const otherCode = /(INT-[A-Z0-9]{4}-[A-Z0-9]{4})/.exec((await ia({ action: 'create', name: `Other ${RUN}`, email: otherEmail })).message ?? '')?.[1];

const intern = await signedIn(email);
check('the intern can write straight away', !/invite-only/.test((await html(intern, '/write/')).text));

// Editor box sits above the submit button.
const page = await intern.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${BASE}/write/`);
await page.waitForFunction(() => !!window.__editor);
const box = page.locator('[data-testid="intern-code"]');
const above = await page.evaluate(() => {
  const input = document.querySelector('[data-testid="intern-code"]');
  const btn = [...document.querySelectorAll('button')].find((b) => /Submit for review/.test(b.textContent));
  return !!input && !!btn && input.getBoundingClientRect().top < btn.getBoundingClientRect().top;
});
check('editor shows the internship code box above Submit', (await box.count()) > 0 && above);
await page.screenshot({ path: 'test-results/intern-code-box.png' });

const doc = (n, tag) => ({ type: 'doc', content: Array.from({ length: n }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `${tag} part ${i + 1}: I built this project in Python, hit a time zone bug, fixed it by normalising dates, and would add tests next time.` }] })) });
const submit = async (n, internCode) => (await intern.request.post(`${BASE}/api/posts`, { headers: H, data: { title: `How I built project ${n} ${RUN}`, description: 'What I built, how it works, the bug I hit and what I would improve next time around.', tags: ['python'], category: 'web-development', bodyJson: doc(45, `P${n}`), submit: true, internCode } })).json();
const bad = await submit(0, 'INT-ZZZZ-ZZZZ');
check('a wrong code blocks submitting', !!bad.error && /does not exist/.test(bad.error), JSON.stringify(bad));
const stolen = await submit(0, otherCode);
check("someone else's code is refused", !!stolen.error && /another account/.test(stolen.error), JSON.stringify(stolen));
const ids = [];
for (const n of [1, 2, 3]) ids.push((await submit(n, n === 2 ? code.toLowerCase() : code)).id);
check('three articles submitted with the code (case does not matter)', ids.every(Boolean), JSON.stringify(ids));

let desk = await html(admin, '/admin/internships/');
const row = (t) => t.slice(t.indexOf(`data-code="${code}"`), t.indexOf('</tr>', t.indexOf(`data-code="${code}"`)));
// Moderation may already have published some of them; together they must be the three articles.
const shown = (row(desk.text).match(/How I built project \d/g) ?? []).length;
check('admin sees all three articles under the code', shown === 3, row(desk.text).slice(0, 300));
// Put the third back in review so the count is predictable, then publish the first two.
await admin.request.post(`${BASE}/api/admin/action`, { headers: H, data: { action: 'request_changes', id: ids[2], reason: 'Add a code snippet for the date fix.' } });
for (const id of ids.slice(0, 2)) await admin.request.post(`${BASE}/api/admin/action`, { headers: H, data: { action: 'publish_post', id } });
desk = await html(admin, '/admin/internships/');
check('count follows publishing (2 / 3, still in progress)', /2<\/span><span class="text-muted"> \/ 3/.test(row(desk.text)) && desk.text.indexOf(`data-code="${code}"`) > desk.text.indexOf('id="working"'));
await admin.request.post(`${BASE}/api/admin/action`, { headers: H, data: { action: 'publish_post', id: ids[2] } });
desk = await html(admin, '/admin/internships/');
check('3 / 3 moves the intern to "Ready for certificate"', /3<\/span><span class="text-muted"> \/ 3/.test(row(desk.text)) && desk.text.indexOf('id="ready"') < desk.text.indexOf(`data-code="${code}"`) && desk.text.indexOf(`data-code="${code}"`) < (desk.text.indexOf('id="working"') === -1 ? Infinity : desk.text.indexOf('id="working"')));
check('article titles listed for the intern', row(desk.text).includes(`How I built project 3 ${RUN}`));
const sent = await ia({ action: 'certificate', code, sent: true });
desk = await html(admin, '/admin/internships/');
check('certificate marked sent', sent.ok && desk.text.indexOf('id="done"') < desk.text.indexOf(`data-code="${code}"`));
check('a code with articles cannot be deleted', !(await ia({ action: 'delete', code })).ok);
check('an unused code can be deleted', (await ia({ action: 'delete', code: otherCode })).ok);
check('non-admins are refused', (await intern.request.post(`${BASE}/api/admin/internships`, { headers: H, data: { action: 'create', name: 'x', email: 'x@example.com' } })).status() === 403);
const exp = await admin.request.get(`${BASE}/api/admin/export?type=internships`);
check('internships export', exp.ok() && (await exp.text()).includes(code));
check('no page errors', errors.length === 0, errors.join(' | '));
const p2 = await admin.newPage();
await p2.goto(`${BASE}/admin/internships/`);
await p2.screenshot({ path: 'test-results/internships-admin.png', fullPage: true });

await admin.request.post(`${BASE}/api/admin/action`, { headers: H, data: { action: 'set_settings', values: { posts_per_day_new: '1' } } });
await browser.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
