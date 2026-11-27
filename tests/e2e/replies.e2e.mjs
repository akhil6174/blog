/**
 * Replies to admin messages (D-050): a recipient replies, the admin is notified, sees the conversation and
 * answers; the recipient is notified; conversations are private; non-recipients cannot reply; messages are deleted
 * with replies and notifications 30 days after sending (hourly job).
 * Run against `npm run preview` with dev login:  node tests/e2e/replies.e2e.mjs
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';

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
const post = async (ctx, path, data) => { const r = await ctx.request.post(`${BASE}${path}`, { headers: H, data }); return { http: r.status(), ...(await r.json().catch(() => ({}))) }; };
const html = async (ctx, path) => (await ctx.request.get(`${BASE}${path}`)).text();

const admin = await signedIn('akhil6174dwivedi@gmail.com');
const ambEmail = `reply-amb-${RUN}@example.com`, intEmail = `reply-int-${RUN}@example.com`;
const amb = await signedIn(ambEmail);
const intern = await signedIn(intEmail);
const outsider = await signedIn(`reply-out-${RUN}@example.com`);
const college = `Reply College ${RUN}`;
await post(admin, '/api/admin/ambassadors', { action: 'add_colleges', text: college });
const cid = Number(new RegExp(String.raw`<tr data-id="(\d+)"[^>]*>\s*<td[^>]*><strong>` + college).exec(await html(admin, `/admin/ambassadors/?q=${encodeURIComponent(RUN)}`))?.[1]);
await post(admin, '/api/admin/ambassadors', { action: 'assign', id: cid, email: ambEmail });
await post(admin, '/api/admin/internships', { action: 'create', name: `Reply Intern ${RUN}`, email: intEmail, note: '' });
const ambId = (await (await amb.request.get(`${BASE}/api/auth/get-session`)).json()).user.id;
const intId = (await (await intern.request.get(`${BASE}/api/auth/get-session`)).json()).user.id;

const sent = await post(admin, '/api/admin/messages', { title: `Plan ${RUN}`, body: 'Can you all join on Saturday?', keys: [`a:${ambId}`, `i:${intEmail}`] });
check('message sent to 2', sent.http === 200 && sent.sent === 2, JSON.stringify(sent));
const nid = sent.id;

// Recipient replies through the page
const p = await amb.newPage();
await p.goto(`${BASE}/me/notices/${nid}/`);
check('reply box shown to recipient, with deletion date', (await p.locator('[data-testid=reply-body]').count()) === 1 && /deleted automatically on/.test(await p.content()));
await p.fill('[data-testid=reply-body]', 'Yes, I will join. Can I bring two friends?');
await Promise.all([p.waitForEvent('load'), p.click('button:has-text("Send reply")')]);
check('reply appears in the conversation', (await p.textContent('[data-testid=thread]')).includes('Can I bring two friends?'));

const adminNotes = await html(admin, '/me/notifications/');
check('admin notified of the reply', adminNotes.includes(`replied to “Plan ${RUN}”`) && adminNotes.includes(`/admin/messages/${nid}/#u-${ambId}`));
const list = await html(admin, '/admin/messages/');
check('messages list shows "1 new" and reply count', new RegExp(String.raw`Plan ${RUN}[\s\S]{0,300}1 new`).test(list) && list.includes('1 reply'));
const ap = await admin.newPage();
await ap.goto(`${BASE}/admin/messages/${nid}/`);
check('admin sees the conversation', (await ap.textContent(`[data-thread="${ambId}"]`)).includes('Can I bring two friends?'));
await ap.locator(`form.answer[data-user="${ambId}"] textarea`).fill('Sure, bring them along.');
await Promise.all([ap.waitForEvent('load'), ap.locator(`form.answer[data-user="${ambId}"] button`).click()]);
check('admin answer in the thread', (await ap.textContent(`[data-thread="${ambId}"]`)).includes('Sure, bring them along.'));
check('"new" badge cleared after opening', !/1 new/.test(await html(admin, '/admin/messages/')) || !new RegExp(String.raw`Plan ${RUN}[\s\S]{0,300}1 new`).test(await html(admin, '/admin/messages/')));

const ambNotes = await html(amb, '/me/notifications/');
check('recipient notified of the answer', ambNotes.includes(`Akhilendra replied to you: “Plan ${RUN}”`));
check('recipient sees the answer', (await html(amb, `/me/notices/${nid}/`)).includes('Sure, bring them along.'));
const intView = await html(intern, `/me/notices/${nid}/`);
check('other recipients do not see someone else’s conversation', intView.includes('Can you all join on Saturday?') && !intView.includes('Can I bring two friends?') && !intView.includes('Sure, bring them along.'));
check('non-recipients cannot reply', (await post(outsider, '/api/me/notices', { noticeId: nid, body: 'let me in' })).http === 404);
check('admin cannot answer someone who did not receive it', (await post(admin, '/api/admin/message-reply', { noticeId: nid, userId: (await (await outsider.request.get(`${BASE}/api/auth/get-session`)).json()).user.id, body: 'hello there' })).http === 400);
check('non-admins cannot use the admin reply', (await post(amb, '/api/admin/message-reply', { noticeId: nid, userId: intId, body: 'hello there' })).http === 403);
check('empty reply refused', (await post(amb, '/api/me/notices', { noticeId: nid, body: ' ' })).http === 400);
await ap.screenshot({ path: 'test-results/replies-admin.png', fullPage: true });
await p.goto(`${BASE}/me/notices/${nid}/`);
await p.screenshot({ path: 'test-results/replies-user.png', fullPage: true });

// 30-day deletion: backdate this message and run the hourly job.
const recent = await post(admin, '/api/admin/messages', { title: `Fresh ${RUN}`, body: 'Stays', keys: [`a:${ambId}`] });
execSync(`npx wrangler d1 execute tech-blog-db --local --command "update notices set created_at = unixepoch() - 31*86400 where id = ${nid}"`, { stdio: 'ignore' });
const cron = await post(admin, '/api/admin/action', { action: 'run_cron' });
check('hourly job ran', cron.http === 200, JSON.stringify(cron));
check('old message gone for recipient', (await amb.request.get(`${BASE}/me/notices/${nid}/`)).status() === 404);
const notesAfter = await html(amb, '/me/notifications/');
check('its notifications deleted', !notesAfter.includes(`Plan ${RUN}`));
check('admin notification about the reply deleted', !(await html(admin, '/me/notifications/')).includes(`replied to “Plan ${RUN}”`));
check('old message gone from admin list', !(await html(admin, '/admin/messages/')).includes(`Plan ${RUN}`) && (await admin.request.get(`${BASE}/admin/messages/${nid}/`)).status() === 404);
check('newer messages kept', (await html(amb, `/me/notices/${recent.id}/`)).includes('Stays'));

await post(admin, '/api/admin/ambassadors', { action: 'remove', id: cid });
await post(admin, '/api/admin/ambassadors', { action: 'delete', id: cid });
await b.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
