/**
 * End-to-end check of the Campus Writers Programme and reader features, against `npm run preview` (dev login):
 * programme gate, first-article reward (once), self-upvote block, upvote undo, bookmarks, comment notifications,
 * edit/delete, competition (refresh, score, cap, one prize per writer, reopen, publish), ledger (confirm, pay),
 * announcements, /articles explore and exports. Restores the settings it changes.
 *
 *   node tests/e2e/programme.e2e.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const H = { origin: BASE };
const RUN = Date.now().toString(36);
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  (${detail})` : ''}`); };
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
const anon = await browser.newContext();
const admin = await signedIn('akhil6174dwivedi@gmail.com');
const act = async (data) => (await admin.request.post(`${BASE}/api/admin/action`, { headers: H, data })).json();
const prog = async (data) => { const r = await admin.request.post(`${BASE}/api/admin/programme`, { headers: H, data }); return { ok: r.ok(), ...(await r.json()) }; };
const html = async (ctx, path) => { const r = await ctx.request.get(`${BASE}${path}`); return { status: r.status(), text: await r.text() }; };
const doc = (n, tag) => ({ type: 'doc', content: Array.from({ length: n }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `${tag} paragraph ${i + 1}: static pages on Cloudflare Workers stay fast, cheap and simple when you cache them at the edge and keep the database for writes.` }] })) });
const month = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 7);

// ---- Gate ----
await act({ action: 'set_settings', values: { programme_open: 'false' } });
check('programme pages are hidden while off', (await html(anon, '/campus-writers/')).status === 404 && (await html(anon, '/leaderboard/')).status === 404);
check('admin can preview them', /Admin preview/.test((await html(admin, '/campus-writers/')).text));
await act({ action: 'set_settings', values: { programme_open: 'true', programme_start: '', programme_end: '', reward_first_article: '200', reward_cap: '500', reward_prizes: '700,300,300,300,300,100,100,100,100,100', posts_per_day_new: '5', community_invite_only: 'true' } });
const camp = await html(anon, '/campus-writers/');
check('campus writers page is public when on', camp.status === 200 && /Write\. Publish\./.test(camp.text) && /₹700/.test(camp.text));
check('reward policy reflects the live cap', /₹500/.test((await html(anon, '/reward-policy/')).text));

// ---- Writers publish ----
await act({ action: 'invite', value: `pa-${RUN}@example.com, pb-${RUN}@example.com` });
const A = await signedIn(`pa-${RUN}@example.com`);
const B = await signedIn(`pb-${RUN}@example.com`);
async function publish(ctx, title) {
  const r = await (await ctx.request.post(`${BASE}/api/posts`, { headers: H, data: { title, description: 'A practical walk-through of caching static pages at the edge with Cloudflare Workers.', tags: ['cloudflare'], category: 'web-development', bodyJson: doc(45, title), submit: true } })).json();
  if (!r.id) throw new Error(`submit failed: ${JSON.stringify(r)}`);
  for (let i = 0; i < 30; i++) {
    const s = await (await ctx.request.get(`${BASE}/api/posts/${r.id}/status`)).json();
    if (!['submitted', 'checking'].includes(s.status)) break;
    await new Promise((res) => setTimeout(res, 500));
  }
  await act({ action: 'publish_post', id: r.id });
  return r.id;
}
const a1 = await publish(A, `Edge caching basics ${RUN}`);
const a2 = await publish(A, `Edge caching in depth ${RUN}`);
const b1 = await publish(B, `Workers and D1 together ${RUN}`);
const ledgerA = await html(A, '/me/');
check('first-article reward credited once', (ledgerA.text.match(/First article/g) ?? []).length === 1 && /₹200/.test(ledgerA.text));
check('writer was notified of publication', /Published: Edge caching/.test((await html(A, '/me/notifications/')).text));

// ---- Upvotes ----
const self = await A.request.post(`${BASE}/api/raise`, { headers: H, data: { postId: a1, delta: 1 } });
check('writers cannot upvote their own article', self.status() === 403);
const R = await signedIn(`pr-${RUN}@example.com`);
const R2 = await signedIn(`pr2-${RUN}@example.com`);
for (const id of [a1, a2, b1]) await R.request.post(`${BASE}/api/raise`, { headers: H, data: { postId: id, delta: 3 } });
await R2.request.post(`${BASE}/api/raise`, { headers: H, data: { postId: a2, delta: 1 } });
const undo = await (await R2.request.delete(`${BASE}/api/raise`, { headers: H, data: { postId: a2 } })).json();
check('upvote can be taken back', undo.mine === 0);
await R2.request.post(`${BASE}/api/raise`, { headers: H, data: { postId: a2, delta: 1 } });

// ---- Bookmarks ----
const bm = await (await R.request.post(`${BASE}/api/bookmarks`, { headers: H, data: { postId: a1 } })).json();
check('bookmark saves', bm.saved === true && (await html(R, '/me/saved/')).text.includes(`Edge caching basics ${RUN}`));
const bm2 = await (await R.request.post(`${BASE}/api/bookmarks`, { headers: H, data: { postId: a1 } })).json();
check('bookmark toggles off', bm2.saved === false);

// ---- Comments: notify, edit, delete ----
const c = await (await R.request.post(`${BASE}/api/comments`, { headers: H, data: { postId: b1, body: `Useful article, thanks ${RUN}` } })).json();
await new Promise((res) => setTimeout(res, 3000));
await act({ action: 'publish_comment', id: c.id });
check('writer is notified of a comment', /commented on (&quot;|&#34;|")Workers and D1/.test((await html(B, '/me/notifications/')).text));
const edit = await R.request.patch(`${BASE}/api/comments`, { headers: H, data: { id: c.id, body: `Edited: useful article ${RUN}` } });
check('own comment can be edited', edit.ok());
const editOther = await A.request.patch(`${BASE}/api/comments`, { headers: H, data: { id: c.id, body: 'not mine to edit' } });
check("others' comments cannot be edited", editOther.status() === 404);
const del = await R.request.delete(`${BASE}/api/comments`, { headers: H, data: { id: c.id } });
check('own comment can be deleted', del.ok());

// ---- Competition ----
const ref = await prog({ action: 'refresh', month });
const listed = [...(await html(admin, `/admin/programme/?month=${month}`)).text.matchAll(/data-post="([^"]+)"/g)].map((m) => m[1]);
check('refresh finds the three new articles', ref.ok && [a1, a2, b1].every((x) => listed.includes(x)), ref.message ?? ref.error);
// Articles left over from earlier local runs are disqualified so this run is self-contained.
for (const other of listed.filter((x) => ![a1, a2, b1].includes(x))) await prog({ action: 'score', month, postId: other, accuracy: null, quality: null, originality: null, clarity: null, disqualified: true, note: 'test cleanup' });
const early = await prog({ action: 'finalise', month });
check('finalise refuses unscored articles', !early.ok && /Score every article/.test(early.error));
const sc = (postId, n) => prog({ action: 'score', month, postId, accuracy: n, quality: n, originality: n, clarity: n, disqualified: false, note: null });
await sc(a1, 8); await sc(a2, 9); await sc(b1, 7);
const fin = await prog({ action: 'finalise', month });
check('finalise works once scored', fin.ok, fin.error);
let page = await html(admin, `/admin/programme/?month=${month}`);
check('cap cuts the prize (A had ₹200 of ₹500, so ₹300 not ₹700)', /position 1 \(cut from ₹700 by the ₹500 cap\)/.test(page.text));
check('one prize per writer (A ranked once)', (page.text.match(/position 1/g) ?? []).length === 1 && /position 2/.test(page.text) && !/position 3/.test(page.text));
const reo = await prog({ action: 'reopen', month });
check('reopen cancels unpaid prizes', reo.ok && /cancelled: month reopened/.test((await html(admin, `/admin/programme/?month=${month}&rewards=all`)).text));
await prog({ action: 'finalise', month });
const pub = await prog({ action: 'publish', month });
check('results publish', pub.ok, pub.error);
const lb = await html(anon, '/leaderboard/');
check('leaderboard shows the winner', lb.status === 200 && lb.text.includes(`Edge caching in depth ${RUN}`));
check('winner is notified', /placed #1/.test((await html(A, '/me/notifications/')).text));

// ---- Ledger ----
const rows = [...(await html(admin, '/admin/programme/?rewards=open')).text.matchAll(/reward_confirm&quot;,&quot;id&quot;:(\d+)/g)].map((m) => Number(m[1]));
check('pending rewards are listed', rows.length >= 3, String(rows.length));
const id = rows[rows.length - 1];
const pay0 = await prog({ action: 'reward_pay', id, ref: 'UPI-TEST-1' });
check('cannot pay before confirming', !pay0.ok);
const conf = await prog({ action: 'reward_confirm', id });
const pay = await prog({ action: 'reward_pay', id, ref: `UPI-${RUN}` });
check('confirm then mark paid', conf.ok && pay.ok, `${conf.error ?? ''} ${pay.error ?? ''}`);
check('paid status visible in admin', (await html(admin, '/admin/programme/?rewards=paid')).text.includes(`UPI-${RUN}`));

// ---- Announcements, explore, export ----
const ann = await prog({ action: 'announce', title: `Announcement ${RUN}`, link: '/campus-writers/', audience: 'writers' });
check('announcement reaches writers', ann.ok && (await html(B, '/me/notifications/')).text.includes(`Announcement ${RUN}`), JSON.stringify(ann));
const ex = await html(anon, '/articles/');
check('explore page lists articles', ex.status === 200 && /Explore articles/.test(ex.text) && /article/.test(ex.text));
check('explore search narrows results', /for “welcome”/i.test((await html(anon, '/articles/?q=welcome')).text));
const exp = await admin.request.get(`${BASE}/api/admin/export?type=rewards`);
check('reward ledger exports', exp.ok() && (await exp.text()).includes('monthly_prize'));

// ---- Restore ----
await act({ action: 'set_settings', values: { programme_open: 'false', reward_cap: '1000', posts_per_day_new: '1' } });
await browser.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
