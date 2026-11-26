/**
 * Admin article review (D-048): list every article (drafts too), open and read any article, send the writer a
 * suggestion (notification + full notice with edit link), delete with a reason (trash + writer notified), restore,
 * non-admins refused. Run against `npm run preview` with dev login:  node tests/e2e/admin-articles.e2e.mjs
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
const post = async (ctx, path, data) => { const r = await ctx.request.post(`${BASE}${path}`, { headers: H, data }); return { http: r.status(), ...(await r.json().catch(() => ({}))) }; };
const html = async (ctx, path) => (await ctx.request.get(`${BASE}${path}`)).text();

const admin = await signedIn('akhil6174dwivedi@gmail.com');
const writerEmail = `review-${RUN}@example.com`;
const writer = await signedIn(writerEmail);
await post(admin, '/api/admin/action', { action: 'invite', value: writerEmail });
// Fresh sign-in so the writer role is in the session.
await writer.clearCookies();
await writer.request.post(`${BASE}/api/auth/sign-in/email`, { headers: H, data: { email: writerEmail, password: 'localtest-password-1' } });
const title = `Draft for review ${RUN}`;
const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Unique body text ${RUN} about caching in Cloudflare Workers.` }] }] };
const saved = await post(writer, '/api/posts', { title, description: '', tags: ['cloudflare'], bodyJson: doc, category: 'web-development' });
check('writer saved a draft', saved.http === 200 && saved.id, JSON.stringify(saved).slice(0, 200));

// List and open
const list = await html(admin, `/admin/articles/?q=${encodeURIComponent(RUN)}`);
check('admin list shows drafts by any writer', list.includes(title) && list.includes(writerEmail) && list.includes('>draft<'));
const draftsOnly = await html(admin, `/admin/articles/?status=draft&q=${encodeURIComponent(RUN)}`);
check('status filter works', draftsOnly.includes(title) && !(await html(admin, `/admin/articles/?status=published&q=${encodeURIComponent(RUN)}`)).includes(title));
const page = await html(admin, `/admin/articles/${saved.id}/`);
check('admin can read the draft', page.includes(`Unique body text ${RUN}`) && page.includes('data-testid="status"'));
check('non-admins cannot open it', (await writer.request.get(`${BASE}/admin/articles/${saved.id}/`, { maxRedirects: 0 })).status() !== 200);

// Suggestion through the UI
const p = await admin.newPage();
await p.goto(`${BASE}/admin/articles/${saved.id}/`);
await p.fill('[data-testid=suggest-text]', 'Start with the problem you solved.\nAdd a screenshot of the result.');
await Promise.all([p.waitForEvent('load', { timeout: 15000 }), p.click('button:has-text("Send suggestion")')]);
check('suggestion listed on the article page', (await p.textContent('[data-testid=history]')).includes('Start with the problem'));
const notes = await html(writer, '/me/notifications/');
const link = new RegExp(String.raw`href="(/me/notices/\d+/)"[^>]*>Suggestion from Akhilendra on “Draft for review`).exec(notes)?.[1];
check('writer notified: "Suggestion from Akhilendra on …"', !!link, notes.slice(0, 400));
const n = await html(writer, link);
check('writer reads full suggestion with "Edit your article"', n.includes('Add a screenshot of the result.') && n.includes(`href="/write/?id=${saved.id}"`) && n.includes('Edit your article'));
check('suggestion did not change the article', (await html(admin, `/admin/articles/${saved.id}/`)).includes('>draft<'));
check('non-admins cannot send suggestions', (await post(writer, '/api/admin/articles', { action: 'suggest', id: saved.id, text: 'trying to send this' })).http === 403);
check('empty suggestion refused', (await post(admin, '/api/admin/articles', { action: 'suggest', id: saved.id, text: 'short' })).http === 400);

// Delete with reason
check('delete needs a reason', (await post(admin, '/api/admin/articles', { action: 'delete', id: saved.id, reason: 'no' })).http === 400);
await p.goto(`${BASE}/admin/articles/${saved.id}/`);
await p.fill('[data-testid=delete-reason]', 'Copied large parts from the Cloudflare documentation.');
p.once('dialog', (d) => d.accept());
await Promise.all([p.waitForEvent('load', { timeout: 15000 }), p.click('button:has-text("Delete and notify")')]);
check('article moved to trash', (await p.textContent('[data-testid=status]')).trim() === 'trashed');
const notes2 = await html(writer, '/me/notifications/');
const link2 = /href="(\/me\/notices\/\d+\/)"[^>]*>Akhilendra removed your article/.exec(notes2)?.[1];
check('writer notified of removal', !!link2);
check('removal notice shows the reason', (await html(writer, link2)).includes('Copied large parts from the Cloudflare documentation.'));
check('trashed article in the trash list', (await html(admin, '/admin/')).includes(title));
check('deleting again refused', (await post(admin, '/api/admin/articles', { action: 'delete', id: saved.id, reason: 'again and again' })).http === 400);
check('restore from trash works', (await post(admin, '/api/admin/action', { action: 'restore_post', id: saved.id })).http === 200 && (await html(admin, `/admin/articles/${saved.id}/`)).includes('>draft<'));
await p.screenshot({ path: 'test-results/admin-article.png' });

await b.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
