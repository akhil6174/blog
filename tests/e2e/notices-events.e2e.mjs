/**
 * More categories plus a writer's own category; admin messages to ambassadors and interns (notification + full
 * notice page, recipients only); events page managed from /admin/events (add with cover, detail page, hide, past,
 * delete). Run against `npm run preview` with dev login:  node tests/e2e/notices-events.e2e.mjs
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
const admin = await signedIn('akhil6174dwivedi@gmail.com');
const post = async (path, data, ctx = admin) => { const r = await ctx.request.post(`${BASE}${path}`, { headers: H, data }); return { status: r.status(), ...(await r.json().catch(() => ({}))) }; };
const html = async (ctx, path) => (await ctx.request.get(`${BASE}${path}`)).text();
const hydrated = (p) => p.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);

// ---------- Categories ----------
const w = await admin.newPage();
await w.goto(`${BASE}/write/`);
await hydrated(w);
const opts = await w.locator('[data-testid=category] option').allTextContents();
check('editor offers 20+ categories and "Other"', opts.length >= 24 && opts.includes('Machine learning') && opts.includes('Interview preparation') && opts.includes('Other (type your own)'), String(opts.length));
await w.selectOption('[data-testid=category]', '__other');
await w.fill('[data-testid=custom-category]', 'Robotics');
check('custom category box works', (await w.inputValue('[data-testid=custom-category]')) === 'Robotics');
await w.fill('[data-testid=custom-category]', 'x');
check('too-short custom category flagged', (await w.locator('text=2 to 30 characters').count()) === 1);
const saved = await post('/api/posts', { title: `Custom category ${RUN}`, description: '', tags: [], bodyJson: { type: 'doc', content: [] }, category: 'c:Robotics ' });
check('draft saves with a custom category', saved.status === 'draft' && saved.id, JSON.stringify(saved).slice(0, 200));
const editor = await html(admin, `/write/?id=${saved.id}`);
check('custom category stored (trimmed)', editor.includes('c:Robotics') && !editor.includes('c:Robotics '));
const bad = await post('/api/posts', { title: `Bad category ${RUN}`, description: '', tags: [], bodyJson: { type: 'doc', content: [] }, category: 'c:<b>' });
check('invalid custom category not stored', bad.status === 'draft' && !(await html(admin, `/write/?id=${bad.id}`)).includes('c:<b>'));
check('home page still shows the 5 main topics', ((await html(admin, '/')).match(/href="\/articles\/\?category=/g) ?? []).length >= 5 && !(await html(admin, '/')).includes('?category=machine-learning'));

// ---------- Messages ----------
const ambEmail = `notice-amb-${RUN}@example.com`, internEmail = `notice-int-${RUN}@example.com`;
const ambCtx = await signedIn(ambEmail);
const internCtx = await signedIn(internEmail);
const outsider = await signedIn(`notice-out-${RUN}@example.com`);
const college = `Notice College ${RUN}`;
await post('/api/admin/ambassadors', { action: 'add_colleges', text: college });
const cid = Number(new RegExp(String.raw`<tr data-id="(\d+)"[^>]*>\s*<td[^>]*><strong>` + college).exec(await html(admin, `/admin/ambassadors/?q=${encodeURIComponent(RUN)}`))?.[1]);
await post('/api/admin/ambassadors', { action: 'assign', id: cid, email: ambEmail });
await post('/api/admin/internships', { action: 'create', name: `Intern ${RUN}`, email: internEmail, note: '' });
await post('/api/admin/internships', { action: 'create', name: `Not Signed In ${RUN}`, email: `nobody-${RUN}@example.com`, note: '' });

const m = await admin.newPage();
await m.goto(`${BASE}/admin/messages/`);
const page = await m.content();
check('admin sees ambassadors and interns to choose from', page.includes(college) && page.includes(`Intern ${RUN}`) && page.includes('not signed in yet'));
await m.fill('[name=title]', `Meeting ${RUN}`);
await m.fill('[name=body]', 'Hello team,\nWe meet on Saturday at 6 pm.');
await m.fill('[name=link]', 'https://meet.google.com/abc-defg-hij');
await m.check(`input[name=key][value="a:${(await (await ambCtx.request.get(`${BASE}/api/auth/get-session`)).json()).user.id}"]`);
await m.check(`input[name=key][value="i:${internEmail}"]`);
check('recipient count updates', (await m.textContent('#count')).trim() === '2');
m.once('dialog', (d) => d.accept());
await m.click('button:has-text("Send message")');
await m.waitForFunction(() => /Sent to/.test(document.getElementById('flash').textContent));
check('admin told how many received it', /Sent to 2 people/.test(await m.textContent('#flash')), await m.textContent('#flash'));
const notif = await html(ambCtx, '/me/notifications/');
const link = /href="(\/me\/notices\/\d+\/)"[^>]*>Notice from Akhilendra: Meeting/.exec(notif)?.[1];
check('ambassador gets "Notice from Akhilendra"', !!link, notif.slice(0, 300));
check('intern gets it too', (await html(internCtx, '/me/notifications/')).includes(`Notice from Akhilendra: Meeting ${RUN}`));
const full = await html(ambCtx, link);
check('full message opens with line breaks and link', full.includes('We meet on Saturday at 6 pm.') && full.includes('href="https://meet.google.com/abc-defg-hij"'));
check('people who did not receive it cannot open it', (await outsider.request.get(`${BASE}${link}`)).status() === 404);
check('outsider got no notification', !(await html(outsider, '/me/notifications/')).includes(`Meeting ${RUN}`));
const grp = await post('/api/admin/messages', { title: `All amb ${RUN}`, body: 'Group message test', groups: ['ambassadors'], keys: [] });
check('send to all ambassadors', grp.status === 200 && grp.sent >= 1 && (await html(ambCtx, '/me/notifications/')).includes(`All amb ${RUN}`), JSON.stringify(grp));
check('non-admins cannot send', (await post('/api/admin/messages', { title: 'x x x', body: 'hello there', groups: ['interns'] }, outsider)).status === 403);
check('sent messages listed for admin', (await html(admin, '/admin/messages/')).includes(`Meeting ${RUN}`));

// ---------- Events ----------
const e = await admin.newPage();
await e.goto(`${BASE}/admin/events/`);
await e.locator('details:has(summary:has-text("Add an event"))').evaluate((d) => { d.open = true; });
const f = e.locator('details:has(summary:has-text("Add an event")) form');
const title = `Build Weekend ${RUN}`;
const ist = (days, h) => { const d = new Date(Date.now() + 330 * 60000 + days * 86400000); return `${d.toISOString().slice(0, 10)}T${String(h).padStart(2, '0')}:00`; };
await f.locator('[name=title]').fill(title);
await f.locator('[name=subtitle]').fill('48-hour online hackathon for students');
await f.locator('[name=startsAt]').fill(ist(3, 10));
await f.locator('[name=endsAt]').fill(ist(5, 18));
await f.locator('[name=location]').fill('Online (Google Meet)');
await f.locator('[name=link]').fill('https://forms.gle/example');
await f.locator('[name=linkLabel]').fill('Register now');
await f.locator('[name=description]').fill('Build something useful for your college.\nTeams of up to 4.\nPrizes: certificates and featured articles.');
const png = await e.evaluate(() => { const c = document.createElement('canvas'); c.width = 1600; c.height = 900; const g = c.getContext('2d'); g.fillStyle = '#6a5cb1'; g.fillRect(0, 0, 1600, 900); return c.toDataURL('image/png').split(',')[1]; });
await f.locator('.cover-file').setInputFiles({ name: 'c.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
await e.waitForFunction(() => /Uploaded|failed|read/.test(document.querySelector('.cover-msg')?.textContent ?? ''));
check('cover uploads', /^\/media\//.test(await f.locator('[name=coverImage]').inputValue()), await f.locator('.cover-msg').textContent());
await Promise.all([e.waitForEvent('load'), f.locator('button:has-text("Add event")').click()]);
const adminEvents = await e.content();
const eid = Number(new RegExp(String.raw`data-row="(\d+)"[\s\S]{0,400}?` + title).exec(adminEvents)?.[1]);
check('event added', eid > 0);
const anon = await b.newContext();
const list = await html(anon, '/events/');
check('events page lists it as upcoming with "In 3 days"', list.includes(title) && list.includes('In 3 days') && list.indexOf(title) < (list.indexOf('Past events') === -1 ? Infinity : list.indexOf('Past events')));
const detail = await html(anon, `/events/${eid}/`);
check('detail page: subtitle, IST time, place, description, button', detail.includes('48-hour online hackathon') && /IST/.test(detail) && detail.includes('Online (Google Meet)') && detail.includes('Teams of up to 4.') && detail.includes('Register now'));
check('detail page has Event structured data', detail.includes('"@type":"Event"') && detail.includes('OnlineEventAttendanceMode'));
check('header links to events', list.includes('href="/events/"'));
check('end before start refused', (await post('/api/admin/events', { action: 'save', event: { title: 'Wrong dates', description: 'Some description', startsAt: ist(3, 10), endsAt: ist(2, 10) } })).status === 400);
const past = await post('/api/admin/events', { action: 'save', event: { title: `Old Workshop ${RUN}`, description: 'It already happened.', startsAt: ist(-10, 10), endsAt: ist(-10, 12) } });
const list2 = await html(anon, '/events/');
check('past events shown under "Past events"', list2.includes('Past events') && list2.indexOf(`Old Workshop ${RUN}`) > list2.indexOf('Past events'));
await post('/api/admin/events', { action: 'publish', id: eid, published: false });
check('hidden event gone from list and detail', !(await html(anon, '/events/')).includes(title) && (await anon.request.get(`${BASE}/events/${eid}/`)).status() === 404);
check('non-admins cannot manage events', (await post('/api/admin/events', { action: 'delete', id: eid }, outsider)).status === 403);
await post('/api/admin/events', { action: 'publish', id: eid, published: true });
const ph = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await ph.goto(`${BASE}/events/`);
await ph.screenshot({ path: 'test-results/events-phone.png', fullPage: true });
check('phone: no sideways scrolling', !(await ph.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
const dk = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await dk.goto(`${BASE}/events/${eid}/`);
await dk.screenshot({ path: 'test-results/event-detail.png' });
await dk.goto(`${BASE}/events/`);
await dk.screenshot({ path: 'test-results/events.png' });
await post('/api/admin/events', { action: 'delete', id: eid });
await post('/api/admin/events', { action: 'delete', id: past.id });
check('deleted event 404', (await anon.request.get(`${BASE}/events/${eid}/`)).status() === 404);

// clean up ambassador test data
await post('/api/admin/ambassadors', { action: 'remove', id: cid });
await post('/api/admin/ambassadors', { action: 'delete', id: cid });

await b.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
