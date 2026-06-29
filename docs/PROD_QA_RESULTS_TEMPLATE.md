# Frontendeasy production QA results template

Use this file as a copyable template after each production or preview deploy smoke. Do not store live secrets, cookies, private project data, SMTP passwords, Supabase service-role keys, or unredacted user identifiers here.

## Result summary

- QA date:
- QA owner:
- Environment: preview / production / local reproduction
- Public URL:
- Preview URL:
- Commit SHA / release label:
- Branch:
- Build source: Cloudflare Pages / local `npm run build:budget` / other
- Overall status: pass / pass with notes / blocked / rollback recommended
- Decision: promote / hold / rollback / rerun needed

## Redaction checklist

- [ ] No API keys, SMTP credentials, cookies, auth links, or Supabase `service_role` keys are pasted.
- [ ] Any credential-like value is replaced with `[REDACTED]`.
- [ ] Screenshots/logs are scrubbed for private project names, emails, asset URLs, and user content.
- [ ] Only env var names are recorded, not values.

## Build and handoff gates

Record command output summaries only; link CI logs if needed.

- [ ] `npm ci`
  - Result:
- [ ] `npm run check`
  - Result:
- [ ] `npm test`
  - Result:
- [ ] `npm run lint:export`
  - Result:
- [ ] `npm run verify:release`
  - Result:
- [ ] `npm run build:budget`
  - Result:
- [ ] `npm run validate:handoff`
  - Result:
- [ ] `git diff --check`
  - Result:

## Browser matrix

- Desktop Chrome/Chromium:
  - Version/OS:
  - Result:
  - Notes:
- Desktop Safari:
  - Version/OS:
  - Result:
  - Notes:
- Desktop Firefox:
  - Version/OS:
  - Result:
  - Notes:
- Mobile Chromium:
  - Device/profile:
  - Result:
  - Notes:
- Mobile WebKit/Safari:
  - Device/profile:
  - Result:
  - Notes:

## Route and shell smoke

- [ ] Root URL loads editor or auth/project shell without blank page.
  - URL:
  - Result:
- [ ] `/?demo=1` loads without blank page.
  - Result:
  - If no seeded demo appears, record: `demo route not ready for public CTA`.
- [ ] SPA fallback works on a deep/unknown route and serves the app shell.
  - URL:
  - Result:
- [ ] Release-gated unfinished UI is hidden.
  - AI edit shell:
  - unavailable command actions:
  - Code mode:
  - prototype placeholders:
  - multiplayer placeholders:
  - profile placeholder actions:
  - update-note placeholders:

## CSP and headers

Use browser DevTools Network or a safe header check. Do not paste cookies or auth headers.

- [ ] `Content-Security-Policy` response header is present.
  - Result:
- [ ] CSP does not include `unsafe-eval`.
  - Result:
- [ ] `X-Content-Type-Options: nosniff` is present.
  - Result:
- [ ] `X-Frame-Options: SAMEORIGIN` is present.
  - Result:
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` is present.
  - Result:
- [ ] `Strict-Transport-Security` is present on HTTPS production domain.
  - Result:
- [ ] `index.html` is no-cache.
  - Result:
- [ ] Hashed `/assets/*` files are immutable/long-cache.
  - Result:

## Offline/local-first smoke

- [ ] Open a project and wait for local saved state.
  - Result:
- [ ] Toggle DevTools offline mode.
  - Result:
- [ ] Make a visible edit.
  - Result:
- [ ] Reload while offline and confirm the edit survives from IndexedDB.
  - Result:
- [ ] Return online and confirm status messaging is accurate.
  - Result:

## Cloud/auth smoke

Skip only if this deploy is intentionally offline-only.

- [ ] `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured by name in the host environment.
  - Result:
- [ ] No `service_role` key is present in client/host docs or screenshots.
  - Result:
- [ ] Sign-up works.
  - Result:
- [ ] Password sign-in works.
  - Result:
- [ ] Magic link routes back to the live URL.
  - Result:
- [ ] Password reset routes back to the live URL.
  - Result:
- [ ] Project list loads after sign-in.
  - Result:
- [ ] Project create/rename/open works.
  - Result:
- [ ] Cloud save/load survives reload.
  - Result:
- [ ] Cloud snapshot create/restore works.
  - Result:

## SMTP smoke

Skip if custom SMTP is intentionally deferred.

- [ ] Confirmation email arrives from the expected sender domain.
  - Result:
- [ ] Magic-link email arrives.
  - Result:
- [ ] Reset-password email arrives.
  - Result:
- [ ] SPF and DKIM pass in message headers.
  - Result:
- [ ] No provider/API secret is copied into this result file.
  - Result:

## Export smoke

Use a safe test project, not private user content.

- [ ] Create or open a representative project with at least two frames.
  - Result:
- [ ] Run Project Health / preflight and record warnings.
  - Result:
- [ ] Export current frame HTML.
  - Result:
- [ ] Export all frames/site files if enabled.
  - Result:
- [ ] Export includes expected page files, asset handling, sitemap/robots, and optional PWA files.
  - Result:
- [ ] Exported HTML opens locally without console errors.
  - Result:
- [ ] Unsafe/private values are not present in exported test artifact.
  - Result:

## Known blockers

- Blocker:
  - Severity: blocker / high / medium / low
  - Area:
  - Evidence:
  - Owner:
  - Required fix before promotion:

## Non-blocking notes

- Note:
  - Area:
  - Follow-up:

## Rollback notes

- Rollback target commit/release:
- Cloudflare Pages rollback action:
- Supabase action, if any:
- User communication needed:
- Data recovery/snapshot notes:
- Who approves rollback:

## Final decision

- Decision: promote / hold / rollback / rerun needed
- Reason:
- Next action:
- Approver:
- Timestamp:
