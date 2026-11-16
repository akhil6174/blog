/**
 * Inserting an image keeps the writer's place: the image lands where the cursor was, the page does not jump to
 * the top, and the cursor ends up on the line below the image, so typing continues without replacing it.
 * Run against `npm run preview` with dev login:  node tests/e2e/image-cursor.e2e.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const H = { origin: BASE };
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  (${detail})` : ''}`); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { headers: H, data: { email: 'akhil6174dwivedi@gmail.com', password: 'localtest-password-1' } });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(`${BASE}/write/`);
await p.waitForFunction(() => !!window.__editor);
await p.evaluate(() => window.__editor.commands.setContent({ type: 'doc', content: Array.from({ length: 40 }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `Paragraph ${i + 1} with some words.` }] })) }));

async function insertImage(how) {
  if (how === 'toolbar') await p.click('.rail-btn[aria-label^="Image"]');
  else { await p.keyboard.press('Enter'); await p.keyboard.type('/image'); await p.waitForTimeout(300); await p.keyboard.press('Enter'); }
  await p.waitForSelector('[role="dialog"] input[type="file"]', { state: 'attached' });
  await p.setInputFiles('[role="dialog"] input[type="file"]', 'public/og-default.png');
  await p.waitForSelector('[role="dialog"] img');
  await p.fill('[role="dialog"] input[placeholder^="Describe"]', `Image from the ${how}`);
  await p.click('[role="dialog"] button:has-text("Insert")');
  await p.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 15000 });
  await p.waitForTimeout(300);
}
const state = (marker) => p.evaluate((marker) => {
  const c = window.__editor.getJSON().content;
  return { images: c.map((n, i) => (n.type === 'image' ? i : -1)).filter((i) => i >= 0), typed: c.findIndex((n) => JSON.stringify(n).includes(marker)), focused: window.__editor.isFocused, scrollY };
}, marker);

// 1. From the toolbar, with the cursor at the end of paragraph 30.
await p.locator('.ProseMirror p').nth(29).click();
await p.keyboard.press('End');
const y0 = await p.evaluate(() => scrollY);
await insertImage('toolbar');
await p.keyboard.type('AFTER-TOOLBAR');
let s = await state('AFTER-TOOLBAR');
check('toolbar: image inserted after paragraph 30', s.images.includes(30), JSON.stringify(s));
check('toolbar: page did not jump to the top', s.scrollY > 300 && Math.abs(s.scrollY - y0) < 600, `${y0} -> ${s.scrollY}`);
check('toolbar: typing continues on the line below the image', s.typed === 31, JSON.stringify(s));
check('toolbar: image kept after typing', s.images.length === 1);

// 2. From the "/" menu.
await insertImage('slash');
await p.keyboard.type('AFTER-SLASH');
s = await state('AFTER-SLASH');
check('slash menu: second image inserted below the typed line', s.images.length === 2 && s.images[1] > 31, JSON.stringify(s));
check('slash menu: typing continues below the new image', s.typed === s.images[1] + 1, JSON.stringify(s));

// 3. Image as the very last block: a new empty line is added so the writer can keep typing.
await p.evaluate(() => window.__editor.commands.focus('end'));
await insertImage('toolbar');
await p.keyboard.type('AFTER-LAST');
s = await state('AFTER-LAST');
const len = await p.evaluate(() => window.__editor.getJSON().content.length);
check('last block: a line is added below the image for typing', s.typed === len - 1 && s.images.includes(len - 2), JSON.stringify({ ...s, len }));

// 4. Cancelling the dialog returns the cursor to where it was, not the top.
await p.locator('.ProseMirror p').nth(10).click();
await p.keyboard.press('End');
await p.click('.rail-btn[aria-label^="Image"]');
await p.waitForSelector('[role="dialog"]');
await p.keyboard.press('Escape');
await p.waitForSelector('[role="dialog"]', { state: 'detached' });
await p.keyboard.type('AFTER-CANCEL');
const cancelled = await p.evaluate(() => window.__editor.getJSON().content[10]?.content?.map((x) => x.text).join('') ?? '');
check('cancel: cursor stays at the end of paragraph 11', cancelled.endsWith('AFTER-CANCEL'), cancelled);
check('no page errors', errors.length === 0, errors.join(' | '));

await b.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
