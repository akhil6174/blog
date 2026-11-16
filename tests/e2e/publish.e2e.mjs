/**
 * Editorial publishing end-to-end check (step E), against `npm run preview` with GITHUB_DRY_RUN=true
 * (nothing reaches GitHub). Writes the generated Markdown to <outDir>/published.md so it can be built for real.
 *
 *   node tests/e2e/publish.e2e.mjs [outDir]
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const OUT = process.argv[2] ?? 'test-results/publish';
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const RUN = Date.now().toString(36);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const waitFor = (fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true).catch(() => false);
const editorialResponses = [];
page.on('response', async (r) => {
  if (r.url().endsWith('/api/editorial')) editorialResponses.push(await r.json().catch(() => ({})));
});
await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { headers: { origin: BASE }, data: { email: 'akhil6174dwivedi@gmail.com', password: 'localtest-password-1' } });

async function writeArticle(title, words = 650) {
  await page.goto(`${BASE}/write/`);
  await page.waitForFunction(() => !!window.__editor);
  await page.fill('.editor-title', title);
  await page.dispatchEvent('.editor-title', 'input');
  await page.evaluate((n) => {
    const sentence = 'Cloudflare Workers serve static files for free while code requests count toward a daily limit, so editorial pages stay static and fast. ';
    const per = sentence.split(' ').length;
    const paras = Math.ceil(n / per);
    const content = [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Why static pages win' }] }];
    for (let i = 0; i < paras; i++) content.push({ type: 'paragraph', content: [{ type: 'text', text: `${sentence}Point ${i + 1}: ` }, { type: 'text', text: 'measure it', marks: [{ type: 'bold' }] }, { type: 'text', text: ' with real requests.' }] });
    content.push({ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pages: static' }] }] }, { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'API: Worker' }] }] }] });
    content.push({ type: 'codeBlock', attrs: { language: 'bash' }, content: [{ type: 'text', text: 'npm run build && npx wrangler deploy' }] });
    content.push({ type: 'table', content: [
      { type: 'tableRow', content: ['Plan', 'Requests'].map((x) => ({ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: x }] }] })) },
      { type: 'tableRow', content: ['Free', '100,000 per day'].map((x) => ({ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: x }] }] })) },
    ] });
    window.__editor.commands.setContent({ type: 'doc', content });
    window.__editor.commands.focus('end');
  }, words);
  await page.keyboard.type(' Done.');
  await page.fill('#summary', 'How to keep a Cloudflare Workers blog fast and free: static editorial pages, a few dynamic routes, and the limits that matter in practice.');
  await page.fill('aside[aria-label="Article settings"] input[placeholder^="javascript"]', 'cloudflare, astro');
  await page.selectOption('select[aria-label="Category"]', 'cloud-and-hosting');
}

// ---- 1. Publish ----
await writeArticle(`Static pages on Workers ${RUN}`);
check('admin sees "Publish to blog" instead of "Submit for review"', await page.isVisible('aside[aria-label="Article settings"] button:has-text("Publish to blog")') && !(await page.isVisible('text=Submit for review')));
check('top bar says Publish', await page.isVisible('.editor-topbar button:text-is("Publish")'));
await page.click('aside[aria-label="Article settings"] button:has-text("Publish to blog")');
check('confirmation shows the final address', await waitFor(() => document.querySelector('[role="dialog"]')?.textContent?.includes('/blog/static-pages-on-workers-')));
await page.click('[role="dialog"] button:has-text("Publish now")');
const published = await waitFor(() => !!document.querySelector('[role="dialog"][aria-label="Published"]'), null, 20000);
check('publish succeeds (dry run)', published, JSON.stringify(editorialResponses.at(-1)?.errors ?? ''));
const pub = editorialResponses.at(-1) ?? {};
check('dry run: nothing sent to GitHub', pub.dryRun === true && pub.commitUrl === null);
const md = pub.markdown ?? '';
writeFileSync(`${OUT}/published.md`, md);
const slug = (pub.url ?? '').replace(/^\/blog\//, '').replace(/\/$/, '');
writeFileSync(`${OUT}/published-slug.txt`, slug);
check('Markdown has front matter for the blog', /^---\ntitle: "Static pages on Workers/.test(md) && md.includes('category: "cloud-and-hosting"') && md.includes('author: akhil') && md.includes('tags: ["astro", "cloudflare"]'), md.slice(0, 120).replace(/\n/g, ' | '));
check('Markdown body converted', md.includes('## Why static pages win') && md.includes('**measure it**') && md.includes('```bash') && md.includes('| Plan | Requests |') && md.includes('- Pages: static'));
await page.click('[role="dialog"] button:has-text("Done")');
check('status shows Published with the live link', (await page.textContent('aside[aria-label="Article settings"]')).includes('Live at'));
check('URL locked after publishing', (await page.getAttribute('input[aria-label="URL slug"]', 'readonly')) !== null);
check('Schedule hidden after publishing', !(await page.isVisible('button:has-text("Schedule…")')));

// ---- 2. Update ----
await page.click('.tiptap');
await page.keyboard.press('Control+End');
await page.keyboard.type(' A late correction.');
check('edits after publishing are flagged as not live', await waitFor(() => document.body.innerText.includes('changes that are not live yet')));
await page.click('aside[aria-label="Article settings"] button:has-text("Update article")');
await page.click('[role="dialog"] button:has-text("Update article")');
check('update sent', await waitFor(() => !!document.querySelector('[role="dialog"][aria-label="Update sent"]'), null, 20000));
check('updated Markdown has updatedDate and the edit', /updatedDate: \d{4}-\d{2}-\d{2}/.test(editorialResponses.at(-1)?.markdown ?? '') && (editorialResponses.at(-1)?.markdown ?? '').includes('A late correction.'));
await page.click('[role="dialog"] button:has-text("Done")');

// ---- 3. Unpublish ----
await page.click('aside[aria-label="Article settings"] button:has-text("Unpublish")');
await page.click('[role="dialog"] button:has-text("Unpublish")');
check('unpublish takes it offline', await waitFor(() => document.body.innerText.includes('Taken offline')));
check('can publish again', await page.isVisible('button:has-text("Publish again")'));

// ---- 4. Validation ----
await page.goto(`${BASE}/write/`);
await page.waitForFunction(() => !!window.__editor);
await page.fill('.editor-title', `Too short ${RUN}`);
await page.dispatchEvent('.editor-title', 'input');
await page.click('aside[aria-label="Article settings"] button:has-text("Publish to blog")');
check('publish blocked with reasons when incomplete', await waitFor(() => document.querySelector('[role="dialog"][aria-label="Before you publish"]')?.textContent?.includes('600 words')));
await page.keyboard.press('Escape');

// ---- 5. Schedule ----
await writeArticle(`Scheduled article ${RUN}`);
await page.waitForTimeout(2500);
await page.click('button:has-text("Schedule…")');
const when = new Date(Date.now() + 60 * 60_000);
const local = new Date(when.getTime() - when.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
await page.fill('[role="dialog"] input[type="datetime-local"]', local);
await page.click('[role="dialog"] button:has-text("Schedule")');
check('scheduled', await waitFor(() => document.body.innerText.includes('Scheduled for')));
await page.click('button:has-text("Cancel schedule")');
check('schedule can be cancelled', await waitFor(() => !document.body.innerText.includes('Scheduled for') && !!document.querySelector('button')?.ownerDocument.querySelector('aside[aria-label="Article settings"]')?.textContent?.includes('Publish to blog')));
await page.click('button:has-text("Schedule…")');
await page.fill('[role="dialog"] input[type="datetime-local"]', local);
await page.click('[role="dialog"] button:has-text("Schedule")');
await waitFor(() => document.body.innerText.includes('Scheduled for'));
const scheduledId = new URL(page.url()).searchParams.get('id');
writeFileSync(`${OUT}/scheduled-id.txt`, scheduledId ?? '');
check('scheduled article id recorded for the cron check', !!scheduledId, scheduledId);

// ---- 6. Permissions ----
const reader = await browser.newContext();
await reader.request.post(`${BASE}/api/auth/sign-in/email`, { headers: { origin: BASE }, data: { email: 'reader@example.com', password: 'localtest-password-1' } });
const denied = await reader.request.post(`${BASE}/api/editorial`, { headers: { origin: BASE }, data: { id: scheduledId, action: 'publish' } });
check('non-admins cannot publish to the blog', denied.status() === 403, String(denied.status()));
const asWriterSubmit = await ctx.request.post(`${BASE}/api/posts`, { headers: { origin: BASE }, data: { id: scheduledId, title: 'x'.repeat(12), bodyJson: { type: 'doc', content: [] }, submit: true } });
check('editorial articles cannot be sent to community review', asWriterSubmit.status() === 400 || asWriterSubmit.status() === 409, String(asWriterSubmit.status()));

await page.screenshot({ path: `${OUT}/publish-panel.png` });
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
