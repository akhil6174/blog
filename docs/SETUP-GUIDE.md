# Platform registration guidebook

What to sign up for, what to type in, what to copy out, and where each value goes in this project. Written for a first-time publisher in India. Menus move around; the names below were correct on 11 Nov 2026. If a screen looks different, look for the same words.

**Time:** about two hours in total. **Money:** only the domain (roughly ₹800 to 1,200 a year). Everything else is free. One optional ₹450 one-time top-up at OpenAI is explained in its section.

## Before you start: five rules

1. **One Google account for everything Google.** AdSense, Search Console, Google Cloud (sign-in) and Analytics must all live under the same Gmail. Pick the address you will still own in ten years. Use your real legal name; AdSense will later verify identity and address against it.
2. **A password manager first.** Install Bitwarden (free) or use the one in your browser. Every key below goes in there, named exactly as in the table.
3. **Two-factor authentication on every account**, preferably with an authenticator app (Google Authenticator, Authy, Bitwarden) rather than SMS.
4. **Keys never go in chat, screenshots, commits or messages.** If one leaks, delete it in the dashboard and create a new one; they are free to rotate.
5. **Do it in this order.** Later platforms ask for things earlier ones produce (the domain, the GitHub repo, DNS access).

## The credentials vault (fill as you go)

| Value | Where you get it | Where it goes | Phase |
|---|---|---|---|
| Cloudflare Account ID | Cloudflare dashboard → Workers & Pages (right sidebar) | Nowhere in code; needed when connecting GitHub | 0 |
| D1 `database_id` | Output of `npx wrangler d1 create tech-blog-db` | `wrangler.jsonc` → `d1_databases[0].database_id` | 0 |
| KV namespace `id` | Output of `npx wrangler kv namespace create CACHE` | `wrangler.jsonc` → `kv_namespaces[0].id` | 0 |
| R2 bucket `tech-blog-media` | `npx wrangler r2 bucket create tech-blog-media` (needs a card on file first) | `wrangler.jsonc` → `r2_buckets` (binding re-added then) | 3 |
| `SITE_URL` | Your domain, with `https://` | `wrangler.jsonc` → `vars.SITE_URL` and a Workers Builds build variable | 0 |
| `ADMIN_EMAILS` | Your Gmail | `wrangler.jsonc` → `vars.ADMIN_EMAILS` | 3 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Auth Platform → Clients | `.dev.vars` locally; `npx wrangler secret put` in production | 3 |
| `BETTER_AUTH_SECRET` | Generate it yourself (command in the Google Cloud section) | `.dev.vars` and `wrangler secret put` | 3 |
| `OPENAI_API_KEY` | OpenAI platform → API keys | `.dev.vars` and `wrangler secret put` | 3 |
| `RESEND_API_KEY` | Resend → API Keys | `.dev.vars` and `wrangler secret put` | 1 |
| `TURNSTILE_SITE_KEY` (public) | Cloudflare → Turnstile → widget | `wrangler.jsonc` → `vars.TURNSTILE_SITE_KEY` | 1 |
| `TURNSTILE_SECRET_KEY` | Same widget | `.dev.vars` and `wrangler secret put` | 1 |
| `SENTRY_DSN` | Sentry → project → Client Keys (DSN) | `.dev.vars` and `wrangler secret put` | 1 |
| `CF_WEB_ANALYTICS_TOKEN` (public) | Cloudflare → Web Analytics → site → snippet | `wrangler.jsonc` → `vars.CF_WEB_ANALYTICS_TOKEN` | 1 |
| `CONTACT_TO` | Your inbox for contact-form mail | `wrangler.jsonc` → `vars.CONTACT_TO` (already set) | 1 |
| `GITHUB_TOKEN` | GitHub fine-grained token, this repo only, Contents read/write (§15) | `npx wrangler secret put GITHUB_TOKEN` | E |
| `ADSENSE_CLIENT`, `ADS_ENABLED` | AdSense publisher id; flag to turn ad units on | `wrangler.jsonc` → `vars` | 3 / 4 |
| Search Console TXT record | Search Console → Domain property | Cloudflare DNS (not the code) | 0 |
| AdSense publisher ID `ca-pub-…` | AdSense → Account → Settings → Account information | `BaseLayout.astro` meta tag, later `public/ads.txt` | 3 / 4 |

How to set a production secret once you are logged in to Wrangler:

```bash
npx wrangler secret put RESEND_API_KEY
```

It prompts for the value and stores it encrypted in Cloudflare. Repeat per secret. Local values go in `.dev.vars` (copy `.dev.vars.example`).

---

## 1. Google account (10 minutes)

**Why:** the identity behind AdSense, Search Console and Google sign-in. **Cost:** free. **Needed:** now.

1. Use an existing Gmail you will keep, or create one at accounts.google.com. Real first and last name, real date of birth (AdSense requires 18+).
2. Turn on 2-Step Verification: myaccount.google.com → Security → 2-Step Verification. Add an authenticator app and download the backup codes into the password manager.
3. Add a recovery phone and a recovery email.

**India note:** the name here must match the PAN card and the bank account you will later give AdSense.

## 2. Cloudflare (15 minutes)

**Why:** hosting (Workers), database (D1), cache (KV), AI, Workflows, Turnstile, Web Analytics, DNS and, ideally, the domain; later also images (R2). One account covers all of it on the free plan. **Needed:** now.

1. Sign up at dash.cloudflare.com/sign-up with the same Gmail (email + password sign-up is fine; avoid "Sign in with Apple").
2. Verify the email. Then: profile icon → My Profile → Authentication → enable Two-Factor Authentication, store the backup codes.
3. Open Workers & Pages once. Cloudflare asks you to choose a `*.workers.dev` subdomain. Pick something short, for example `yourname.workers.dev`; your Worker will be reachable at `tech-blog.yourname.workers.dev` before the domain is attached.
4. Note the **Account ID** shown in the right sidebar of Workers & Pages (or in any zone's Overview page). Save it in the vault.
5. On your PC, log Wrangler in: `npx wrangler login` (opens the browser; click Allow). Check with `npx wrangler whoami`.
6. Create the two resources and paste their ids into `wrangler.jsonc`:
   ```bash
   npx wrangler d1 create tech-blog-db
   npx wrangler kv namespace create CACHE
   ```
   Then run `npm run generate-types`. No card is needed for D1, KV, Workers, AI or Workflows.

**R2 (image storage) is deferred to Phase 3.** It is only used for images that community writers upload, which does not exist until Phase 3. Enabling R2 requires a card or PayPal on file (an anti-abuse rule; nothing is charged inside the 10 GB free allowance). When Phase 3 starts: dashboard → R2 → Get started → add the payment method → then `npx wrangler r2 bucket create tech-blog-media`, and Claude Code re-adds the `MEDIA` binding. Until then the config has no R2 binding and the health check does not look for it.

**India note:** the card must allow international transactions (enable it in your bank app). Cloudflare bills in USD and adds GST for Indian addresses.

**Gotcha:** nothing in `wrangler.jsonc` is secret, but the D1 and KV ids identify your resources; that is fine to commit.

## 3. Domain (15 minutes)

**Why:** AdSense wants a root domain you own, not `*.workers.dev`. **Cost:** the only recurring cost. **Needed:** now.

Choosing the name: short, pronounceable, no hyphens or numbers, says "tech" or your niche, `.com` first choice, `.in` or `.dev` acceptable. Check that the matching handle is free on X and GitHub.

**Option A: Cloudflare Registrar (preferred: at cost, no markup, already your DNS).**
1. Cloudflare dashboard → Domain Registration → Register Domains → search the name.
2. Choose the TLD and years (one year is fine; turn on auto-renew).
3. Registrant contact: your real name and address (Cloudflare redacts it from public WHOIS at no cost).
4. Pay. The domain appears under Websites with Cloudflare DNS already active.

**Option B: another registrar (Namecheap, GoDaddy, Hostinger, BigRock) if your TLD is not offered by Cloudflare.**
1. Buy the domain there; enable WHOIS privacy; turn on 2FA at that registrar too.
2. Cloudflare dashboard → Add a site (or Onboard a domain) → enter the domain → Free plan → Continue.
3. Cloudflare shows two nameservers (for example `ada.ns.cloudflare.com` and `bob.ns.cloudflare.com`). At the registrar, replace the default nameservers with these two. Propagation takes minutes to a day; Cloudflare emails when active.

**Before the first deploy:** in Cloudflare DNS delete any A or CNAME record for the root (`@`) and `www` that the registrar imported (GoDaddy parking addresses). A Worker custom domain cannot be created while they exist; the deploy fails with code 100117.

**Connect the domain to the Worker (after the first deploy):** Workers & Pages → `tech-blog` → Settings → Domains & Routes → Add → Custom domain → `yourdomain.com`; add `www.yourdomain.com` too. Cloudflare creates the DNS records and the certificate. Then set `SITE_URL` in `wrangler.jsonc` and in Workers Builds.

## 4. GitHub (10 minutes)

**Why:** source control, and Cloudflare Workers Builds deploys from it on every push. **Cost:** free. **Needed:** now.

1. Sign up at github.com/signup with the same Gmail. Username: your name or brand.
2. Settings → Password and authentication → enable two-factor (authenticator app); save recovery codes.
3. Create a repository: New → name `tech-blog` → Private → do **not** add a README, .gitignore or licence (the project already has them) → Create.
4. Push the project from this folder (after the first commit):
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/tech-blog.git
   git push -u origin main
   ```
   Git asks you to sign in through the browser the first time (Git Credential Manager is included with Git for Windows).

**Connect Workers Builds:** Cloudflare → Workers & Pages → Create → Import a repository → Connect GitHub → install the Cloudflare Workers & Pages GitHub App for the repository only → select the repo → Build command `npm run build`, **Deploy command `npm run deploy`** (runs the D1 migrations, then `wrangler deploy`), root `/` → add build variable `SITE_URL = https://trutiai.in` → Save and Deploy. Every push to `main` now deploys; other branches get preview URLs.

**Already connected with `npx wrangler deploy`?** Change the deploy command to `npm run deploy` under the project's Settings → Build. Until then, run `npx wrangler d1 migrations apply tech-blog-db --remote` yourself whenever `drizzle/` gains a new migration.

## 5. Google Cloud: the sign-in button (20 minutes, needed in Phase 3 but painless to do now)

**Why:** "Sign in with Google" for writers (Better Auth). **Cost:** free; no billing account needed for OAuth. **Needed:** Phase 3.

1. Go to console.cloud.google.com with the same Gmail; accept the terms. Country: India.
2. Top bar → project selector → New Project → name `tech-blog` → Create → make sure it is selected.
3. Left menu → **Google Auth Platform** (older consoles: APIs & Services → OAuth consent screen) → Get started.
4. **Branding:** App name `Tech Blog` (your real site name), User support email: your Gmail, App logo: optional (adding one later triggers a review, so skip for now), App domain: `https://yourdomain.com`, Privacy policy and Terms links: `https://yourdomain.com/privacy` and `/terms` (these pages exist after Phase 1; you can leave them blank until then), Developer contact: your Gmail → Save.
5. **Audience:** User type **External**. While the app is in *Testing* only listed test users can sign in (up to 100): add your Gmail and your invited writers. Before opening the community to the public, come back and click **Publish app**. With only the basic scopes (email, profile, openid) no Google verification review is required.
6. **Data access** (scopes): add `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. Nothing else.
7. **Clients** → Create client → Application type **Web application** → Name `tech-blog-web`.
   - Authorized JavaScript origins: `http://localhost:4321` and `https://yourdomain.com`
   - Authorized redirect URIs: `http://localhost:4321/api/auth/callback/google` and `https://yourdomain.com/api/auth/callback/google`
   - Create. Copy the **Client ID** and **Client secret** into the vault immediately (the secret is shown once; you can download the JSON too).
8. Generate the Better Auth secret on your PC, store it in the vault as `BETTER_AUTH_SECRET`, and set the three production secrets (each command prompts for the value):
   ```bash
   npx wrangler secret put BETTER_AUTH_SECRET
   ```
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID
   ```
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
   Generate the secret value with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

**Gotcha:** the redirect URI must match character for character, including `https` and no trailing slash. A mismatch shows Google's "Error 400: redirect_uri_mismatch". Fix it in Google Auth Platform → Clients → your client → Authorized redirect URIs, click Save, and retry after a few minutes. If you add `www`, add both origins and both redirect URIs.

## 6. Google Search Console (10 minutes)

**Why:** tells Google about the site, shows indexing status and Core Web Vitals, and AdSense reviewers expect the site to be indexed. **Cost:** free. **Needed:** now (data starts collecting early).

1. search.google.com/search-console → Add property → choose **Domain** (not URL prefix) → enter `yourdomain.com`.
2. Google shows a TXT record (`google-site-verification=…`). Cloudflare dashboard → your domain → DNS → Records → Add record → Type TXT, Name `@`, Content: paste → Save.
3. Back in Search Console → Verify (may take a few minutes).
4. After Phase 1 deploys: Sitemaps → add `sitemap-index.xml` → Submit.

## 7. Bing Webmaster Tools (5 minutes, after step 6)

bing.com/webmasters → Sign in with the Google account → **Import from Google Search Console** → select the property. Done; the sitemap imports too.

## 8. OpenAI (10 minutes, needed in Phase 3)

**Why:** the free Moderation endpoint screens community text and images for harmful content. **Cost:** the endpoint is free. New accounts sometimes get an `insufficient_quota` error until a payment method and a small prepaid credit exist; if that happens, add the minimum (about $5, roughly ₹450, one time). Moderation calls do not consume it.

1. platform.openai.com/signup → Continue with Google (same Gmail) → verify phone number.
2. Organization name: your name or site name. Skip team invites.
3. Left menu → API keys → Create new secret key → Name `tech-blog-moderation` → Project: Default → Permissions: Restricted → allow only **Moderation** (write) → Create. Copy once into the vault as `OPENAI_API_KEY`.
4. Settings → Limits: set a monthly budget of $5 and an email alert at $1, so a bug can never run up a bill.

**India note:** prepaid credit works with Indian cards that allow international transactions; recurring auto-recharge can fail because of RBI e-mandate rules, so leave auto-recharge off.

## 9. Resend (15 minutes, needed in Phase 1 for the contact form)

**Why:** sends the contact-form emails and writer notifications from `no-reply@yourdomain.com`. **Cost:** free up to 3,000 emails a month and 100 a day.

1. resend.com/signup → Continue with GitHub or Google.
2. Domains → Add Domain → `yourdomain.com` → Region: nearest to your readers (Mumbai if offered, otherwise Singapore) → Add.
3. Resend lists DNS records (DKIM TXT, SPF TXT, an MX for bounces). Click **Sign in to Cloudflare** to add them automatically, or copy each into Cloudflare DNS by hand. Click **Verify DNS Records**; status turns Verified within minutes.
4. API Keys → Create API Key → Name `tech-blog` → Permission **Sending access** → Domain: `yourdomain.com` only → Add. Copy once into the vault as `RESEND_API_KEY`.
5. Decide the addresses: from `no-reply@yourdomain.com`, replies and contact-form mail to your Gmail (set in code as `CONTACT_TO`, Phase 1).

**Gotcha:** sending to anyone other than yourself requires the verified domain; the shared `onboarding@resend.dev` sender is for tests only.

## 10. Sentry (5 minutes, needed in Phase 1)

**Why:** emails you when the site throws an error. **Cost:** free Developer plan (5,000 errors a month).

1. sentry.io/signup → Continue with Google or GitHub → Organization name: your site name → Developer (free) plan.
2. Create project → Platform: **Browser JavaScript** (or Astro if listed) → Alert frequency: "Alert me on every new issue" → Project name `tech-blog` → Create.
3. Copy the **DSN** (Settings → Projects → tech-blog → Client Keys) into the vault as `SENTRY_DSN`.

## 11. Cloudflare Turnstile (5 minutes, needed in Phase 1)

**Why:** invisible bot check on sign-up, submit, comment, contact and report forms. **Cost:** free.

1. Cloudflare dashboard → Turnstile → Add widget → Name `tech-blog`.
2. Hostnames: `yourdomain.com` and `localhost` (localhost makes local testing work).
3. Widget mode: **Managed** (shows a checkbox only to suspicious visitors). Pre-clearance: off.
4. Create. Copy the **Site key** (public, goes in `wrangler.jsonc` vars as `TURNSTILE_SITE_KEY`) and the **Secret key** (vault, `.dev.vars`, `wrangler secret put TURNSTILE_SECRET_KEY`).

## 12. Cloudflare Web Analytics (5 minutes, needed in Phase 1)

**Why:** visitor counts without cookies, so no consent banner is needed for analytics. **Cost:** free.

1. Cloudflare dashboard → Analytics & Logs → Web Analytics → Add a site → hostname `yourdomain.com`.
2. Choose the **JS snippet** option. Copy only the `token` value from the snippet into `wrangler.jsonc` vars as `CF_WEB_ANALYTICS_TOKEN`. Phase 1 adds the script to `BaseLayout.astro`.

## 13. Cloudflare Email Routing (5 minutes, needed in Phase 1)

**Why:** the site shows `hello@trutiai.in` as its public contact address (AdSense reviewers look for a real one). Email Routing forwards mail sent to that address to your Gmail for free; you never run a mail server.

1. Cloudflare dashboard → your domain `trutiai.in` → Email → Email Routing → Get started.
2. Custom address: `hello` → Destination: your Gmail → Create. Cloudflare emails your Gmail a verification link; click it.
3. Cloudflare adds the MX and TXT records automatically; accept when prompted.
4. Optional: Catch-all → forward everything to your Gmail too.

**Gotcha:** Resend also wants an MX record (for bounces) on a subdomain it tells you, so the two do not conflict. If Resend complains, add its records on the subdomain it specifies, not on the root.

## 15. GitHub token for publishing your articles (5 minutes, needed for step E)

**Why:** "Publish to blog" in the editor saves your article as a Markdown file in the GitHub repository; the push rebuilds the site and the article goes live 2 to 3 minutes later as a normal static page. The Worker needs a token that can write files to this one repository, nothing else.

1. github.com → your avatar → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Token name: `TrutiAI publishing`. Expiration: 1 year (put a reminder in your calendar to renew it).
3. Resource owner: your account. **Repository access: Only select repositories** → `akhil6174/blog`.
4. **Permissions → Repository permissions → Contents: Read and write.** Leave everything else at "No access" (Metadata read-only is added automatically).
5. **Generate token** and copy it (it is shown once). Save it in the vault as `GITHUB_TOKEN`.
6. From the `tech-blog` folder:
   ```bash
   npx wrangler secret put GITHUB_TOKEN
   ```
   Paste the token when asked.

**Gotchas:** never put the token in a file, chat or commit. If it leaks or expires, delete it on GitHub, create a new one and run the command again. `GITHUB_DRY_RUN` belongs only in your local `.dev.vars`, never in production.

## 16. Backups, restore and admin account safety (10 minutes once, then 1 minute a week)

**Why:** your articles and writers live in the D1 database. Cloudflare keeps 7 days of history (Time Travel), but a copy you hold yourself protects against mistakes you notice later.

1. **Weekly backup.** From the `tech-blog` folder:
   ```bash
   npm run db:backup
   ```
   It saves `backups/trutiai-<date>.sql` (never committed). Copy the file to Google Drive or another computer.
2. **Undo a recent mistake (last 7 days).** Find the time just before it, then restore to it:
   ```bash
   npx wrangler d1 time-travel info tech-blog-db
   ```
   ```bash
   npx wrangler d1 time-travel restore tech-blog-db --timestamp=2026-11-16T10:00:00Z
   ```
   This replaces the whole database with that moment, so anything written after it is lost. Take a backup first.
3. **Restore from a backup file** (only if the database is lost): ask Claude Code to walk you through it, because it needs an empty database first.
4. **Test a restore once** on your computer, so you know it works: `npx wrangler d1 execute tech-blog-db --local --file=backups/<file>.sql` loads it into the local copy.
5. **Protect the admin account.** You sign in with Google only, so turn on **2-Step Verification** at myaccount.google.com → Security for the Google account in `ADMIN_EMAILS`. That is the admin's two-factor.
6. **Quick exports** of articles, writers, reports and the audit log are on `/admin` → Export data.

## 17. Running the Campus Writers Programme (when you are ready; 15 minutes a month)

The programme is built but switched off: its pages show "page not found" to visitors. Everything is in **/admin/programme**.

1. **Before switching on:** open "Programme rules" and set `programme_start` and `programme_end` (YYYY-MM-DD), check the amounts and the ₹1,000 cap, and read `/reward-policy` as a visitor would (you can preview it while signed in). Make sure the money is set aside: the cap times the number of writers you expect is your worst case.
2. **Switch on.** First-article rewards start being added (as pending) when a writer's first community article is published. Community articles still need `community_open` to be visible to readers.
3. **Each month, in the first 10 days:** pick last month, press **Refresh entries**, give every article a mark from 0 to 10 for accuracy, quality, originality and clarity (or tick DQ), then **Finalise**. Check the prizes in the ledger, then **Publish results**. Made a mistake before publishing? **Reopen**.
4. **Paying:** in the ledger, **Confirm** each reward you agree with. Email the writer from your own mail to ask for their UPI ID or bank details (never collect them on the site), pay, then **Mark paid** with the transaction reference. The writer sees each step on their account page.
5. **Applications** from `/join-us` arrive by email (once Resend is set up) and are listed on the same page. Reply by email and mark them.
6. **Keep records:** Export → rewards once a month, next to your bank statements.

## 14. Google AdSense (Phase 3, week 8: not now)

Do not sign up yet. Applying with an empty site wastes the first review. When Phase 2 is complete (25 to 30 posts, indexed), follow Part 4 of the plan. You will need: the same Gmail, your postal address exactly as on an ID, your PAN, an Indian bank account for wire payments, and the meta tag Google gives you (`ca-pub-…`) pasted into `BaseLayout.astro`.

---

## Order of operations, condensed

| # | Platform | Do now? | Output |
|---|---|---|---|
| 1 | Google account + 2FA | Yes | The identity for everything Google |
| 2 | Cloudflare + Wrangler login + D1/KV | Yes | Account ID, two ids in `wrangler.jsonc` |
| 2b | Cloudflare R2 (card on file, then create bucket) | Phase 3 | `MEDIA` binding re-added |
| 3 | Domain | Yes | DNS on Cloudflare |
| 4 | GitHub + Workers Builds | Yes | Push-to-deploy |
| 5 | Google Cloud OAuth client | Can wait for Phase 3 | Client ID + secret |
| 6 | Search Console | Yes | Verified domain property |
| 7 | Bing Webmaster | Yes (2 min) | Imported property |
| 8 | OpenAI | Phase 3 | API key |
| 9 | Resend | Phase 1 | Verified domain, API key |
| 10 | Sentry | Phase 1 | DSN |
| 11 | Turnstile | Phase 1 | Site key, secret key |
| 12 | Web Analytics | Phase 1 | Token |
| 13 | Email Routing (hello@trutiai.in → Gmail) | Phase 1 | Working contact address |
| 14 | AdSense | Week 8 | Publisher ID |

When steps 1 to 4, 6 and 7 are done, tell Claude Code "Phase 0 accounts done" and paste nothing else; it will check `/api/health` on the live domain and start Phase 1.
