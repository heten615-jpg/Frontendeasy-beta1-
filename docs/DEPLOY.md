# Optional Cloudflare Pages hosting

Frontendeasy's primary release path is **GitHub/local-first**: users clone or download the repository and run it locally. See [`LOCAL_RELEASE.md`](./LOCAL_RELEASE.md) for that required path.

This document is optional. Use it only if you later decide to put Frontendeasy on the internet at your own `.com` domain. Cost: ~$11–18 for the domain (year 1); hosting + backend can stay on free tiers.

## Prerequisites

1. **Supabase project** already set up (see [`supabase/README.md`](../supabase/README.md)).
   You should have `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` saved.
2. **GitHub repo** containing this codebase, with `main` (or whatever branch
   you want to deploy from) pushed.
3. **Cloudflare account** (free).
4. **Domain name** — register on Namecheap, Cloudflare Registrar, or any
   other ICANN registrar. ~$11/year for a fresh `.com`.

## Deployment readiness checklist

Use this non-secret checklist before switching a preview/demo link into public
copy. Do not paste real keys, SMTP passwords, cookies, or private project data
into docs, logs, screenshots, issues, or handoff notes.

### Local gates

Run these from a clean checkout before creating or promoting a deploy:

```bash
npm ci
npm run check
npm test
npm run lint:export
npm run verify:release
npm run build:budget
npm run validate:handoff
git diff --check
```

If the deploy is docs-only, runtime gates may be skipped only when the item
explicitly says so; still run `npm run validate:handoff` and `git diff --check`.

### Required hosting checks

- [ ] Cloudflare Pages build command is `npm run build:budget`.
- [ ] Output directory is `dist`.
- [ ] `NODE_VERSION` is set to `22` in Pages environment variables.
- [ ] `public/_redirects` contains the SPA fallback: `/*  /index.html  200`.
- [ ] `public/_headers` ships a `Content-Security-Policy` header without
      `unsafe-eval`.
- [ ] `public/_headers` keeps `index.html` no-cache and hashed `/assets/*`
      immutable.
- [ ] The live URL and `/?demo=1` both load the app shell without a blank page.
      If `/?demo=1` is not wired to a seeded demo in that environment, do not
      use a public "Try demo" CTA until the behavior is clarified.

### Optional cloud/auth checks

Frontendeasy can run offline/local-first without Supabase env vars. Treat these as
required only for a cloud-enabled public deploy:

- [ ] `VITE_SUPABASE_URL` is set in Cloudflare Pages Production.
- [ ] `VITE_SUPABASE_ANON_KEY` is set in Cloudflare Pages Production.
- [ ] No `service_role` key is stored in Cloudflare Pages, GitHub, client code,
      docs, or screenshots.
- [ ] Supabase Auth Site URL and Additional Redirect URLs include the live
      domain, preview domains, and local dev as needed.
- [ ] Sign-up, password sign-in, magic link, reset password, project list,
      cloud save/load, image upload, and cloud snapshot paths pass the smoke
      checks in [`QA.md`](./QA.md).

### Optional SMTP checks

Custom SMTP is optional during early development. Enable it before meaningful
public signups if Supabase's built-in email cap is too low.

- [ ] Provider setup follows [`SMTP_SETUP.md`](./SMTP_SETUP.md).
- [ ] SMTP credentials live only in the Supabase dashboard/provider dashboard.
- [ ] DNS records are verified and email headers show SPF/DKIM pass.
- [ ] Any leaked SMTP/API key is revoked before continuing.

### Release-gated UI checks

Before publishing public copy or screenshots, confirm unfinished surfaces remain
hidden behind release flags:

- [ ] AI edit shell and unavailable AI command actions are not exposed.
- [ ] Code mode, prototype placeholder entrypoints, multiplayer placeholders,
      profile placeholder actions, and update-note placeholders stay hidden.
- [ ] Project Health, export, snapshots, and local/offline messaging remain
      visible and accurate.

### Privacy and redaction

- [ ] Replace any copied credential-like value with `[REDACTED]`.
- [ ] Do not include private project names, user emails, asset URLs, auth links,
      cookies, local file paths outside the repo, or Supabase row payloads in
      public docs/screenshots.
- [ ] Share only env var names, never their values.

## Step 1 — Connect the repo to Cloudflare Pages

1. https://dash.cloudflare.com → Workers & Pages → **Create application**
   → **Pages** → **Connect to Git**.
2. Authorise Cloudflare to read your GitHub account (a per-repo grant is
   fine — no need to expose all repos).
3. Pick the Frontendeasy repository.
4. Build settings:
   - **Framework preset:** None (Cloudflare auto-detects Vite; if not, pick
     "None" and fill in manually).
   - **Build command:** `npm run build:budget`
   - **Output directory:** `dist`
   - **Root directory:** leave blank (repo root).
   - **Node version:** 22 (set via `NODE_VERSION` env var below; CI uses Node 22).

## Step 2 — Environment variables

In the Pages project settings → **Environment variables**, add for the
**Production** environment:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | `https://<your-project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the anon/public JWT from Supabase → Settings → API |
| `NODE_VERSION` | `22` |

Mirror the same vars under **Preview** so PR preview deploys also have cloud
access (alternatively leave them out — preview builds will run in offline-only
mode, which is also fine for design review).

> **Never** add the Supabase `service_role` key here. It must never leave the
> backend. The anon key is safe in the bundle — RLS protects everything.

## Step 3 — Trigger the first build

Click **Save and Deploy**. Cloudflare will:

1. Clone the repo.
2. Run `npm ci` then `npm run build:budget`.
3. Publish `dist/` to a Cloudflare-owned URL like
   `https://frontendeasy-abc.pages.dev`.

Open that URL — the editor should load. Sign in / sign up to verify auth
works end-to-end.

## Step 4 — Custom domain

In the Pages project → **Custom domains** → **Set up a custom domain**.

- **Apex (e.g. `yourdomain.com`):** Cloudflare will ask you to point the
  nameservers to Cloudflare. After the NS change propagates (~10 minutes),
  the domain is auto-wired to Pages with free SSL.
- **Subdomain (e.g. `app.yourdomain.com`):** Cloudflare creates a CNAME for
  you. If DNS is hosted elsewhere, add the CNAME manually:
  `app  CNAME  frontendeasy-abc.pages.dev`.

SSL is provisioned automatically. Allow ~5 minutes for the cert to issue.

## Step 5 — Update Supabase Auth URLs

Once the live URL is known, return to **Supabase → Authentication → URL
Configuration** and add it everywhere:

- **Site URL:** `https://app.yourdomain.com`
- **Additional Redirect URLs:**
  - `https://app.yourdomain.com/*`
  - `https://*.pages.dev/*`   (so preview deploys can also receive magic-link callbacks)
  - `http://localhost:5173/*` (dev)

Without this step, magic-link emails will land on `localhost:5173` even when
clicked from the production site.

## Step 6 — Smoke test

- [ ] Visit the live URL — Frontendeasy shell loads.
- [ ] Visit `https://<live-url>/?demo=1` — the app shell still loads. If no
      seeded demo appears, do not advertise it as a public demo yet.
- [ ] Open DevTools → Network and confirm the response includes the CSP from
      `public/_headers`.
- [ ] Sign up with a fresh email. Confirm the email lands and clicking the
      link routes back to the production site.
- [ ] Create a project from a template. Reload — the project persists.
- [ ] Upload an image. Confirm it renders.
- [ ] Toggle DevTools offline mode, make a local edit, reload, and confirm the
      offline draft survives.
- [ ] Sign out, sign back in on a different device. Project list matches.
- [ ] Confirm release-gated unfinished UI surfaces are still hidden.

## What's already wired

- **SPA fallback** via `public/_redirects` — any URL serves `index.html`
  so client-side routing works without 404s.
- **Security headers** via `public/_headers` — sets
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `Strict-Transport-Security`, and long-cache the
  hashed bundles under `/assets/*`.
- **Cache strategy** — `index.html` is no-cache (so users get fresh code
  immediately on deploy); `/assets/*.js|css` is `immutable` with one-year
  TTL (safe because Vite emits content-hashed filenames).

## When something goes wrong

| Symptom | Likely cause |
|---|---|
| Build fails in Cloudflare with "command not found: npm" | NODE_VERSION env var missing — set it to `22`. |
| Live URL shows an empty white page | `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` not set in **Production** env. Check the browser console for "Cloud auth is not configured". |
| Magic-link email opens `localhost:5173` | Step 5 not done — update Supabase Auth → URL Configuration. |
| SSL cert pending for >10 min | DNS not yet pointed to Cloudflare. `dig +short app.yourdomain.com` should return Cloudflare-owned IPs. |
| `image not found` for cloud assets | Storage bucket policies missing — re-run `supabase/migrations/0003_storage_bucket.sql`. |

## Cost reminder

- Cloudflare Pages Free: **$0** (unlimited static requests, 500 builds/month).
- Supabase Free: **$0** (good for ~50k MAU and ≤500 MB DB).
- Domain (Namecheap, year 1): **~$11**.
- Domain renewal: ~$15–20/year.
- Email (Resend Free): **$0** for the first 3k emails/month — see item 38.

Total year 1: **~$11–18**.
