/**
 * A hidden community article opened by an admin must not be served to visitors from the edge cache.
 * Run against `npm run preview` with dev login:  node tests/e2e/private-cache.e2e.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4321';
const H = { origin: BASE };
const RUN = Date.now().toString(36);
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  (${detail})` : ''}`); };
const b = await chromium.launch();
const admin = await b.newContext();
await admin.request.post(`${BASE}/api/auth/sign-in/email`, { headers: H, data: { email: 'akhil6174dwivedi@gmail.com', password: 'localtest-password-1' } });
const act = (data) => admin.request.post(`${BASE}/api/admin/action`, { headers: H, data });
await act({ action: 'set_settings', values: { posts_per_day_new: '5', community_open: 'true' } });
await act({ action: 'invite', value: `cache-${RUN}@example.com` });
const w = await b.newContext();
await w.request.post(`${BASE}/api/auth/sign-up/email`, { headers: H, data: { email: `cache-${RUN}@example.com`, password: 'localtest-password-1', name: 'Cache Test' } });
const body = { type: 'doc', content: Array.from({ length: 60 }, (_, i) => ({ type: 'paragraph', content: [{ type: 'text', text: `Paragraph ${i + 1}: a hidden article used to check that private previews never reach the shared cache.` }] })) };
const post = await (await w.request.post(`${BASE}/api/posts`, { headers: H, data: { title: `Hidden preview ${RUN}`, description: 'Used to check that an admin preview of a hidden article is never cached for visitors.', tags: ['cloudflare'], category: 'web-development', bodyJson: body, submit: true } })).json();
await act({ action: 'publish_post', id: post.id });
const slug = (await (await w.request.get(`${BASE}/api/posts/${post.id}/status`)).json()).slug;
await act({ action: 'set_settings', values: { community_open: 'false' } });
await new Promise((r) => setTimeout(r, 1200));

const path = `/p/${slug}/`;
const asAdmin = await admin.request.get(`${BASE}${path}`);
check('admin can preview the hidden article', asAdmin.status() === 200 && (await asAdmin.text()).includes(`Hidden preview ${RUN}`), String(asAdmin.status()));
check('admin preview is marked private', /private|no-store/.test(asAdmin.headers()['cache-control'] ?? ''), asAdmin.headers()['cache-control']);
const anon = await b.newContext();
const asVisitor = await anon.request.get(`${BASE}${path}`);
check('a visitor right after gets "not found", not the cached preview', asVisitor.status() === 404, `${asVisitor.status()} cache=${asVisitor.headers()['x-edge-cache']}`);

await act({ action: 'set_settings', values: { community_open: 'true', posts_per_day_new: '1' } });
await b.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
