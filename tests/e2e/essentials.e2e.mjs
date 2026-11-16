/**
 * End-to-end check for the "essential improvements" round, against `npm run preview` (dev login, GITHUB_DRY_RUN=true):
 * conflict protection, version history, technical details, writer dashboard (trash/restore/withdraw/profile),
 * admin request-changes / audit log / export / emergency switches, and reader problem reports.
 *
 *   node tests/e2e/essentials.e2e.mjs [outDir]
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const OUT = process.argv[2] ?? 'test-results/essentials';
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const RUN = Date.now().toString(36);
const H = { origin: BASE };
const browser = await chromium.launch();

async function signedIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let r = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { headers: H, data: { email, password: 'localtest-password-1' } });
  if (!r.ok()) {
    await ctx.request.post(`${BASE}/api/auth/sign-up/email`, { headers: H, data: { email, password: 'localtest-password-1', name: email.split('@')[0] } });
    r = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { headers: H, data: { email, password: 'localtest-password-1' } });
  }
  return ctx;
}
const admin = await signedIn('akhil6174dwivedi@gmail.com');
const page = await admin.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const waitFor = (p, fn, arg, timeout = 8000) => p.waitForFunction(fn, arg, { timeout }).then(() => true).catch(() => false);
const doc = (n) => ({ type: 'doc', content: Array.from({ length: n }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `Paragraph ${i + 1} explains how static pages on Cloudflare Workers stay fast, cheap and simple to maintain over time.` }] })) });

// ---- 1. Technical details save and reload ----
await page.goto(`${BASE}/write/`);
await page.waitForFunction(() => !!window.__editor);
await page.fill('.editor-title', `Tech details ${RUN}`);
await page.dispatchEvent('.editor-title', 'input');
await page.evaluate((d) => window.__editor.commands.setContent(d), doc(45));
await page.keyboard.type(' ');
await page.fill('#summary', 'How static pages on Cloudflare Workers stay fast and free, and which few routes really need code at request time.');
await page.fill('aside[aria-label="Article settings"] input[placeholder^="javascript"]', 'cloudflare, astro');
await page.selectOption('select[aria-label="Category"]', 'cloud-and-hosting');
await page.click('aside[aria-label="Article settings"] summary:has-text("Technical details")');
await page.selectOption('select[aria-label="Difficulty"]', 'intermediate');
await page.fill('input[aria-label="Languages and frameworks"]', 'TypeScript, Astro');
await page.fill('input[aria-label="Versions used"]', 'Node 22, Astro 7.4');
await page.fill('input[aria-label="Code repository"]', 'https://github.com/example/demo');
await page.click('aside[aria-label="Article settings"] button:has-text("Today")');
await page.keyboard.press('Control+s');
await waitFor(page, () => /Saved/.test(document.querySelector('.editor-topbar [role="status"]')?.textContent ?? ''), null, 10000);
const postId = new URL(page.url()).searchParams.get('id');
check('draft created', !!postId, postId);
await page.reload();
await page.waitForFunction(() => !!window.__editor);
check('technical details survive a reload', (await page.inputValue('select[aria-label="Difficulty"]')) === 'intermediate' && (await page.inputValue('input[aria-label="Code repository"]')) === 'https://github.com/example/demo' && /^\d{4}-\d{2}-\d{2}$/.test(await page.inputValue('input[aria-label="Last verified"]')));

// ---- 2. Conflict protection ----
const page2 = await admin.newPage();
await page2.goto(`${BASE}/write/?id=${postId}`);
await page2.waitForFunction(() => !!window.__editor);
await page2.click('.tiptap');
await page2.keyboard.press('Control+End');
await page2.keyboard.type(' Edited in the second tab.');
await page2.keyboard.press('Control+s');
await waitFor(page2, () => /Saved/.test(document.querySelector('.editor-topbar [role="status"]')?.textContent ?? ''), null, 10000);
await page.click('.tiptap');
await page.keyboard.press('Control+End');
await page.keyboard.type(' Edited in the first tab.');
await page.keyboard.press('Control+s');
check('stale tab gets the conflict warning instead of overwriting', await waitFor(page, () => !!document.querySelector('[role="dialog"]')?.textContent?.includes('Changed somewhere else')));
await page.click('[role="dialog"] button:has-text("Keep mine")');
check('"Keep mine" saves over the other version', await waitFor(page, () => /Saved/.test(document.querySelector('.editor-topbar [role="status"]')?.textContent ?? ''), null, 10000));
const stale = await admin.request.post(`${BASE}/api/posts`, { headers: H, data: { id: postId, title: 'x'.repeat(12), bodyJson: doc(1), baseVersion: 0, autosave: true } });
check('API refuses a save based on an old version (409)', stale.status() === 409 && (await stale.json()).conflict === true, String(stale.status()));
await page2.close();

// ---- 3. Version history ----
await page.click('button[aria-label="Version history"]');
check('history lists saved versions', await waitFor(page, () => document.querySelectorAll('[aria-label="Saved versions"] li').length >= 1, null, 10000));
const before = await page.evaluate(() => window.__editor.getText().length);
const items = await page.locator('[aria-label="Saved versions"] li').count();
await page.locator('[aria-label="Saved versions"] li').last().locator('button:has-text("Restore")').click();
check('restore closes the panel and loads the version', await waitFor(page, () => !document.querySelector('[role="dialog"]')), `${items} versions, ${before} chars before`);
await page.keyboard.press('Control+s');
await waitFor(page, () => /Saved/.test(document.querySelector('.editor-topbar [role="status"]')?.textContent ?? ''), null, 10000);
const revs = await (await admin.request.get(`${BASE}/api/posts/${postId}/revisions`)).json();
check('restoring keeps the replaced state in history', (revs.revisions?.length ?? 0) > items, `${revs.revisions?.length} now`);

// ---- 4. Dry-run publish carries technical details into Markdown ----
const pub = await admin.request.post(`${BASE}/api/editorial`, { headers: H, data: { id: postId, action: 'publish' } });
const pubJson = await pub.json().catch(() => ({}));
const md = pubJson.markdown ?? '';
check('published Markdown has the technical front matter', md.includes('difficulty: "intermediate"') && md.includes('repoUrl: "https://github.com/example/demo"') && /lastVerified: "\d{4}-\d{2}-\d{2}"/.test(md), (pubJson.errors ?? []).join('; ') || md.slice(0, 80).replace(/\n/g, ' | '));

// ---- 5. Writer dashboard: trash, restore, profile ----
const bulk = await admin.request.post(`${BASE}/api/admin/action`, { headers: H, data: { action: 'invite', value: `writer-${RUN}@example.com, second-${RUN}@example.com` } });
check('bulk invite accepts several emails', bulk.ok() && /2 will become writers/.test((await bulk.json()).message ?? ''));
const writer = await signedIn(`writer-${RUN}@example.com`);
const wpage = await writer.newPage();
wpage.on('pageerror', (e) => errors.push(e.message));
const draft = await (await writer.request.post(`${BASE}/api/posts`, { headers: H, data: { title: `Writer draft ${RUN}`, bodyJson: doc(3) } })).json();
check('writer can save a draft', !!draft.id, JSON.stringify(draft).slice(0, 120));
check('draft address follows the title when none is sent', draft.slug === `writer-draft-${RUN}`, draft.slug);
await wpage.goto(`${BASE}/me/`);
check('dashboard groups drafts', await wpage.isVisible('#drafts h2'));
wpage.once('dialog', (d) => d.accept());
await wpage.click(`#drafts button[data-action="trash"][data-id="${draft.id}"]`);
await wpage.waitForLoadState('load');
check('deleted draft moves to the trash', await waitFor(wpage, (id) => !!document.querySelector(`#trash button[data-id="${id}"]`), draft.id, 8000));
const editTrashed = await writer.request.post(`${BASE}/api/posts`, { headers: H, data: { id: draft.id, title: 'x'.repeat(12), bodyJson: doc(1) } });
check('trashed articles cannot be edited', editTrashed.status() === 409);
await wpage.click(`#trash button[data-id="${draft.id}"]`);
check('restore brings it back as a draft', await waitFor(wpage, (id) => !!document.querySelector(`#drafts a[href="/write/?id=${id}"]`), draft.id, 8000));
await wpage.fill('#profile textarea[name="bio"]', 'I write about serverless tools and small web projects.');
await wpage.fill('#profile input[name="website"]', 'http://not-https.example');
await wpage.click('#profile button');
check('profile rejects a non-https website', await waitFor(wpage, () => /https/.test(document.getElementById('flash')?.textContent ?? '')));
await wpage.fill('#profile input[name="website"]', 'https://example.com/me');
await wpage.click('#profile button');
check('profile saves', await waitFor(wpage, () => /Profile saved/.test(document.getElementById('flash')?.textContent ?? '')));

// ---- 6. Admin: request changes, withdraw, audit, export, switches ----
const noReason = await admin.request.post(`${BASE}/api/admin/action`, { headers: H, data: { action: 'request_changes', id: draft.id, reason: 'short' } });
check('request changes needs a real reason', noReason.status() === 400);
const rc = await admin.request.post(`${BASE}/api/admin/action`, { headers: H, data: { action: 'request_changes', id: draft.id, reason: 'Please add a section on deployment steps.' } });
check('editor can request changes', rc.ok());
await wpage.goto(`${BASE}/me/`);
check('writer sees the request under "Needs your attention"', (await wpage.textContent('#attention')).includes('Please add a section on deployment steps.'));
await wpage.goto(`${BASE}/write/?id=${draft.id}`);
check('editor panel shows the requested changes', await waitFor(wpage, () => document.body.innerText.includes('The editor asked for changes')));
const wd = await writer.request.post(`${BASE}/api/posts/${draft.id}/action`, { headers: H, data: { action: 'withdraw' } });
check('writer can withdraw while changes are requested', wd.ok(), String(wd.status()));
const notMine = await (await signedIn(`other-${RUN}@example.com`)).request.post(`${BASE}/api/posts/${draft.id}/action`, { headers: H, data: { action: 'trash' } });
check("others cannot touch someone else's article", notMine.status() === 404 || notMine.status() === 403, String(notMine.status()));
const notMineRevs = await (await signedIn(`other2-${RUN}@example.com`)).request.get(`${BASE}/api/posts/${draft.id}/revisions`);
check("others cannot read someone else's versions", notMineRevs.status() === 404 || notMineRevs.status() === 403, String(notMineRevs.status()));
const exp = await admin.request.get(`${BASE}/api/admin/export?type=articles`);
const expJson = await exp.json().catch(() => ({}));
check('admin export downloads articles', exp.ok() && Array.isArray(expJson.data) && (exp.headers()['content-disposition'] ?? '').includes('attachment'));
check('writers cannot export', (await writer.request.get(`${BASE}/api/admin/export?type=writers`)).status() === 403);
await admin.request.post(`${BASE}/api/admin/action`, { headers: H, data: { action: 'set_settings', values: { comments_open: 'false' } } });
const cBlocked = await writer.request.post(`${BASE}/api/comments`, { headers: H, data: { postId: `editorial:welcome-to-trutiai`, body: 'Great article, thanks!' } });
check('paused comments are refused', cBlocked.status() === 503, String(cBlocked.status()));
await admin.request.post(`${BASE}/api/admin/action`, { headers: H, data: { action: 'set_settings', values: { comments_open: 'true' } } });
await page.goto(`${BASE}/admin/`);
check('audit log lists the actions', (await page.textContent('body')).includes('request_changes') && (await page.textContent('body')).includes('export'));
check('emergency switches shown', await page.isVisible('button:has-text("Comments on")') && await page.isVisible('button:has-text("Submissions on")'));

// ---- 7. Reader problem report on an article ----
// A community article published for this run (the site may have no editorial articles).
await admin.request.post(`${BASE}/api/admin/action`, { headers: H, data: { action: 'set_settings', values: { community_open: 'true' } } });
await admin.request.post(`${BASE}/api/admin/action`, { headers: H, data: { action: 'invite', value: `reportee-${RUN}@example.com` } });
const reportee = await signedIn(`reportee-${RUN}@example.com`);
const reportPost = await (await reportee.request.post(`${BASE}/api/posts`, { headers: H, data: { title: `Deploying with an old CLI ${RUN}`, description: 'A walkthrough used to check reader problem reports on a real community article page.', tags: ['cloudflare'], category: 'web-development', bodyJson: doc(45), submit: true } })).json();
await admin.request.post(`${BASE}/api/admin/action`, { headers: H, data: { action: 'publish_post', id: reportPost.id } });
const reportSlug = (await (await reportee.request.get(`${BASE}/api/posts/${reportPost.id}/status`)).json()).slug;
const reader = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const rpage = await reader.newPage();
rpage.on('pageerror', (e) => errors.push(e.message));
await rpage.goto(`${BASE}/p/${reportSlug}/`);
// The island hydrates when visible; click until the form opens.
for (let i = 0; i < 20 && !(await rpage.isVisible('form[aria-label="Report a problem"]')); i++) {
  await rpage.locator('button:has-text("Report a problem")').scrollIntoViewIfNeeded();
  await rpage.click('button:has-text("Report a problem")').catch(() => {});
  await rpage.waitForTimeout(300);
}
await rpage.check('input[value="outdated"]');
await rpage.fill('form[aria-label="Report a problem"] textarea', `Step 2 uses an old command (${RUN}).`);
await rpage.click('button:has-text("Send report")');
check('reader can report a technical problem', await waitFor(rpage, () => /author and editor/.test(document.body.innerText)));
await page.goto(`${BASE}/admin/`);
check('admin sees it as a technical report', (await page.textContent('body')).includes(`Step 2 uses an old command (${RUN}).`) && await page.isVisible('button:has-text("Mark fixed")'));
await page.screenshot({ path: `${OUT}/admin.png`, fullPage: false });
await wpage.goto(`${BASE}/me/`);
await wpage.screenshot({ path: `${OUT}/me.png`, fullPage: true });

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
