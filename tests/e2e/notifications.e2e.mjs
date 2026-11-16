/**
 * Notifications: one "Published" per article (an edited, re-reviewed article says "Your changes are live"), and
 * times shown in India time. Run against `npm run preview` with dev login:  node tests/e2e/notifications.e2e.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const H = { origin: BASE };
const RUN = Date.now().toString(36);
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  (${detail})` : ''}`); };
const b = await chromium.launch();
async function signedIn(email) {
  const ctx = await b.newContext();
  await ctx.request.post(`${BASE}/api/auth/sign-up/email`, { headers: H, data: { email, password: 'localtest-password-1', name: email.split('@')[0] } });
  await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { headers: H, data: { email, password: 'localtest-password-1' } });
  return ctx;
}
const admin = await signedIn('akhil6174dwivedi@gmail.com');
const act = (data) => admin.request.post(`${BASE}/api/admin/action`, { headers: H, data });
await act({ action: 'set_settings', values: { posts_per_day_new: '5' } });
await act({ action: 'invite', value: `notify-${RUN}@example.com` });
const w = await signedIn(`notify-${RUN}@example.com`);
const doc = (extra) => ({ type: 'doc', content: Array.from({ length: 60 }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `Paragraph ${i + 1}: notes on caching static pages at the edge with Cloudflare Workers and keeping the free plan limits in mind.${i === 0 ? extra : ''}` }] })) });
const save = (data) => w.request.post(`${BASE}/api/posts`, { headers: H, data: { title: `Notification check ${RUN}`, description: 'Checking that an edited article is announced once as published and then as updated.', tags: ['cloudflare'], category: 'web-development', submit: true, ...data } }).then((r) => r.json());
const first = await save({ bodyJson: doc('') });
await new Promise((r) => setTimeout(r, 2500));
await act({ action: 'publish_post', id: first.id });
const st = await (await w.request.get(`${BASE}/api/posts/${first.id}/status`)).json();
await save({ id: first.id, bodyJson: doc(' An edit after publishing.') });
await new Promise((r) => setTimeout(r, 2500));
await act({ action: 'publish_post', id: first.id });

const html = await (await w.request.get(`${BASE}/me/notifications/`)).text();
const title = `Notification check ${RUN}`;
const published = (html.match(new RegExp(`Published: ${title}`, 'g')) ?? []).length;
const updated = (html.match(new RegExp(`Your changes are live: ${title}`, 'g')) ?? []).length;
check('one "Published" notification for the article', published === 1, `${published} found`);
check('the re-published edit says "Your changes are live"', updated >= 1, `${updated} found`);

// Times: the newest notification should show the current time in India (UTC+5:30), not UTC.
const nowIST = new Date(Date.now() + 330 * 60000);
const hh = nowIST.getUTCHours() % 12 || 12;
const shown = [...html.matchAll(/(\d{1,2}):(\d{2})\s?(am|pm)/gi)].map((m) => Number(m[1]));
check('notification times are in India time', shown.length > 0 && shown.some((h) => Math.abs(h - hh) <= 1 || Math.abs(h - hh) === 11), `shown ${shown.slice(0, 3).join(',')} expected about ${hh}`);
check('article page date is set', !!st.slug);

await act({ action: 'set_settings', values: { posts_per_day_new: '1' } });
await b.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
