# Local GitHub release guide

Frontendeasy's current release target is **GitHub/local-first**: a user downloads or clones the repository, installs dependencies, starts the app locally, and stores projects in the browser's IndexedDB by default.

**No cloud hosting is required** for the primary usage path. Supabase sync and Cloudflare hosting remain optional/advanced paths for later or for users who explicitly configure them.

## Who this is for

- A reviewer or teammate who gets a GitHub link and wants to try the editor locally.
- A local-first user who wants design projects stored in their own browser profile.
- A developer who wants to run the production build locally before sharing screenshots or a release tag.

## Clone or download

Option A — clone with Git:

```bash
git clone https://github.com/<owner>/<repo>.git
cd <repo>
```

Option B — download from GitHub:

1. Open the repository page.
2. Click **Code → Download ZIP**.
3. Unzip it.
4. Open a terminal in the extracted folder.

## Required tooling

- Node.js **22.x**.
- npm from the Node installation.
- No `.env` file is required for offline/local-first use.

Install dependencies from the lockfile:

```bash
npm ci
```

## Run locally for normal use

```bash
npm run dev
```

Open the URL printed by Vite, usually `http://localhost:5173`.

Expected behavior without Supabase env vars:

- The editor opens directly in offline/local-first mode.
- Projects and preferences persist in the current browser profile via IndexedDB/localStorage.
- HTML export/download works locally.
- Folder auto-save works in browsers with File System Access API support, such as Chrome, Edge, or Arc.

## Try the seeded demo

```bash
npm run dev
```

Then open:

```text
http://localhost:5173/?demo=1
```

Expected behavior:

- The seeded showcase project opens.
- The demo banner says changes save only in this browser.
- Cloud/auth paths stay disabled for the demo route.

## Production build and local preview

Before sharing a GitHub release, run the production build locally:

```bash
npm run build:budget
npm run preview
```

Open the preview URL printed by Vite, usually `http://localhost:4173`. Use the local preview server; do not open `dist/index.html` directly in the browser for this release path.

Smoke checklist:

- [ ] `/` loads the editor shell without a blank page.
- [ ] `/?demo=1` loads the seeded showcase and demo banner.
- [ ] A random unknown route falls back to the app shell in preview.
- [ ] You can create/edit a project locally.
- [ ] Reload preserves the local project.
- [ ] Export current page downloads standalone HTML.
- [ ] Export all pages/folder export paths remain reachable.
- [ ] Release-hidden WIP surfaces stay hidden: AI edit shell, Code mode, unavailable commands/tools, multiplayer placeholders, profile placeholder actions, update notes, and prototype placeholder chrome.

## Local release gates

Run these before pushing a release tag or telling someone to download the repo:

```bash
npm run verify:release
npm run check
npm run lint:types
npm test -- --run
npm run lint:export
npm run build:budget
npm run test:e2e:smoke -- --reporter=list
npm run validate:handoff
git diff --check
```

For a quick confidence pass after docs-only edits, at minimum run:

```bash
npm run verify:release
npm run validate:handoff
git diff --check
```

## Optional Supabase/cloud sync

Supabase is optional. To enable account-backed project sync, copy `.env.example` to `.env` and fill only the public Vite variables:

```bash
cp .env.example .env
```

Never commit `.env` or any real credential values. The app intentionally runs offline/local-first when Supabase variables are absent.

## Optional static hosting

Cloudflare Pages, Netlify, Vercel, or another static host can serve `dist/`, but that is not required for the current GitHub/local-first release. If you later decide to host it, use [`DEPLOY.md`](./DEPLOY.md) as the optional cloud-hosting guide.

## Optional file-based packaging

The standard GitHub/local-first path uses `npm run dev` or `npm run preview` so routes and assets are served by a local HTTP server. Production builds default to root-relative assets for reliable SPA fallback in local preview and root static hosting.

Only use this override for deliberate file-based/Electron packaging where relative assets are required:

```bash
FRONTENDEASY_STATIC_BASE=./ npm run build
```

Do not use that override for the normal `npm run preview` release smoke.

## GitHub release checklist

- [ ] `README.md` says the primary path is local-first and links this guide.
- [ ] `package-lock.json` is committed.
- [ ] `node_modules/`, `dist/`, `.env`, `test-results/`, and `playwright-report/` are not committed.
- [ ] `.env.example` contains placeholders only.
- [ ] GitHub Actions smoke gates pass on the pushed branch.
- [ ] No screenshots, logs, docs, issues, or handoff notes contain API keys, cookies, auth links, private project data, local private paths, or credential-like values.
- [ ] Any credential-like value that must be mentioned is replaced with `[REDACTED]`.
- [ ] License choice is deliberate before making the repository public; do not assume downstream users have reuse rights without a `LICENSE` file or private-repo agreement.

## Troubleshooting

- `npm ci` fails: check Node version with `node --version`; use Node 22.x.
- Browser opens a blank page: run `npm run check` and inspect the terminal/Vite console.
- Local data disappeared: make sure you opened the same browser profile and did not clear site data.
- Supabase login is missing: expected unless `.env` has valid `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Export files are blocked by the browser: allow downloads for `localhost`, or use folder export in a browser that supports File System Access API.
