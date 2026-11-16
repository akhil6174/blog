/**
 * Writer access: a reader promoted by the admin can write at once (no 5-minute cookie wait), and turning
 * invite-only off lets existing readers write. Run against `npm run preview` with dev login.
 *   node tests/e2e/writer-access.e2e.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const H = { origin: BASE };
const RUN = Date.now().toString(36);
const results = [];
const check = (name, ok) => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };
const browser = await chromium.launch();
async function signedIn(email) {
  const ctx = await browser.newContext();
  let r = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { headers: H, data: { email, password: 'localtest-password-1' } });
  if (!r.ok()) {
    await ctx.request.post(`${BASE}/api/auth/sign-up/email`, { headers: H, data: { email, password: 'localtest-password-1', name: email.split('@')[0] } });
    await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { headers: H, data: { email, password: 'localtest-password-1' } });
  }
  return ctx;
}
const blocked = async (ctx) => /invite-only right now/.test(await (await ctx.request.get(`${BASE}/write/`)).text());
const admin = await signedIn('akhil6174dwivedi@gmail.com');
const act = (data) => admin.request.post(`${BASE}/api/admin/action`, { headers: H, data });
await act({ action: 'set_settings', values: { community_invite_only: 'true' } });

const a = await signedIn(`reader-a-${RUN}@example.com`);
check('new account is blocked while invite-only', await blocked(a));
const me = await (await a.request.get(`${BASE}/api/auth/get-session`)).json();
await act({ action: 'set_role', id: me.user.id, value: 'writer' });
check('admin promotion works immediately', !(await blocked(a)));

const b = await signedIn(`reader-b-${RUN}@example.com`);
check('second account blocked while invite-only', await blocked(b));
await act({ action: 'set_settings', values: { community_invite_only: 'false' } });
await new Promise((r) => setTimeout(r, 1500));
check('turning invite-only off lets existing readers write', !(await blocked(b)));
const save = await b.request.post(`${BASE}/api/posts`, { headers: H, data: { title: `Access ${RUN}`, bodyJson: { type: 'doc', content: [] } } });
check('the promoted reader can save a draft', save.status() !== 403);
await act({ action: 'set_settings', values: { community_invite_only: 'true' } });

await browser.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
