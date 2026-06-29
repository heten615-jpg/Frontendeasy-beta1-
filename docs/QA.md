# Frontendeasy — local / optional online QA pass

The primary release target is **GitHub/local-first**: users clone or download the repository and run Frontendeasy locally. Cloud hosting and Supabase sync are optional advanced paths, not requirements for the current public GitHub release.

## 0. Local GitHub release readiness

Run this before sharing a GitHub link, release tag, ZIP, or screenshot set with another person.

1. Start from a clean clone/downloaded repository on Node 22.
2. Install from the lockfile:

   ```bash
   npm ci
   ```

3. Run the local release gates:

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

4. Local browser smoke:
   - [ ] `npm run dev` opens `/` without a blank page.
   - [ ] `/?demo=1` opens the seeded demo and shows the demo banner.
   - [ ] Create or edit a local project; reload; the project survives in IndexedDB.
   - [ ] This offline/local-first smoke does not require Supabase, Cloudflare, SMTP, or any public hosting.
   - [ ] Export current page as HTML.
   - [ ] Release-hidden WIP surfaces stay hidden: AI edit shell, Code mode, unavailable command/tool placeholders, multiplayer placeholders, profile placeholder actions, update notes, and prototype placeholder chrome.
   - [ ] No cloud account, Cloudflare project, Supabase project, SMTP provider, or public hosting is required for this smoke.

The full GitHub/local-first guide lives in [`LOCAL_RELEASE.md`](./LOCAL_RELEASE.md). Any credential-like value captured during QA must be replaced with `[REDACTED]`.

## 1. Offline editing

1. Open the app at `http://localhost:5173`. Sign in.
2. Open any project from the list. Wait for `☁ Synced` to flash in the topbar.
3. **DevTools → Network → "Offline"** (or turn off Wi-Fi).
4. Make ~5 edits (move things, add text, change colors).
5. Confirm:
   - [ ] Topbar pill shows `☁ Offline`.
   - [ ] Edits stick (canvas reflects changes).
   - [ ] No console errors.
6. Reload the page **while still offline**.
7. Confirm:
   - [ ] Project re-opens with your edits intact (IndexedDB draft).
   - [ ] Topbar still says `☁ Offline`.
8. Toggle Network back online.
9. Confirm:
   - [ ] Topbar flips `☁ Syncing…` → `☁ Synced` within ~3 seconds.
   - [ ] In Supabase dashboard, the project row's `last_client_rev` has bumped.

## 2. Beforeunload safety net

1. Make an edit, then immediately close the tab (within 700 ms).
2. Reopen the project.
3. Confirm:
   - [ ] The edit is present.

## 3. Multi-tab guard

1. Tab A: open a project.
2. Tab B: open the same project (right-click project card → "Open in new tab"
   in the project list, or just paste the same URL).
3. Confirm:
   - [ ] Tab B shows the yellow "This project is open in 1 other tab" banner.
   - [ ] Tab A's banner appears too (or "1 other tab") within ~1 second of Tab B opening.
4. Edit in Tab A only. Confirm Tab B doesn't auto-update (we're last-write-wins,
   not real-time). Close Tab A. Confirm Tab B's banner disappears within ~2 s.

## 4. Cloud conflict + recovery snapshot

1. Tab A and Tab B both open the same cloud project (multi-tab banner visible in both).
2. Tab A: change frame name to "Alpha". Wait for `☁ Synced`.
3. Tab B (still showing the pre-Alpha state): change a different element's colour.
4. Wait for Tab B's debounce (~2.5 s).
5. Confirm:
   - [ ] Tab B surfaces `Server version loaded. Your local edits were saved as an auto snapshot.` in the status/toast path.
   - [ ] Tab B canvas snaps to Tab A's server version (frame name "Alpha").
   - [ ] Open `⌚ Versions`; a `Pre-sync conflict from ...` automatic snapshot exists for Tab B's local pre-reload work.
   - [ ] Restoring that automatic snapshot first creates a `Before restoring ...` recovery snapshot.
6. Reload Tab B — same server content as Tab A unless you intentionally restored the recovery snapshot.

> Current v1 behavior is **server-wins with a recovery trail**, not merge/CRDT.
> The existing recovery path is `projectSync.onCloudConflict` → `recoverCloudConflict`
> → `createSnapshotEntry(kind: 'auto')` → `project_snapshots`/local fallback.

## 5. Sign-out / multi-device

1. Sign in on Device A, create a project named "Cross-device".
2. Sign in on Device B (different browser / incognito) with the same email.
3. Confirm:
   - [ ] Device B's project list contains "Cross-device" with the up-to-date payload.
4. Edit on Device A. Wait for `☁ Synced`.
5. On Device B, click "← Projects" then reopen "Cross-device".
6. Confirm:
   - [ ] Latest payload from Device A is visible.

## 6. Image upload offline behavior

1. Offline mode (DevTools → Offline).
2. Paste an image (or click Image tool + pick file).
3. Confirm:
   - [ ] Image renders on canvas immediately (inline data URL fallback).
   - [ ] No error toast.
4. Go online.
5. Confirm:
   - [ ] If the project is on cloud + signed-in: the editor doesn't auto-upgrade
         inline base64 to a bucket asset (that's deferred — bulk migration is
         a follow-up task). User-acceptable for MVP.

## 7. Image upload online behavior

1. Online, signed in.
2. Paste an image. Wait for canvas to settle.
3. Confirm:
   - [ ] Inspector image preview shows the picture.
   - [ ] Supabase dashboard → Storage → `project-assets/{user_id}/{project_id}/`
         contains a new file.
   - [ ] Supabase dashboard → Tables → `project_assets` has a new row with
         matching `path`, `mime_type`, `width`, `height`, `sha256`.
   - [ ] `projects.state_json` for the project contains no `data:` URI for
         that element — only `imageAssetId` / `imageAssetPath` / `imageMime`.

## 8. Snapshots

1. Online, signed in. Open a project.
2. Click `✛ Snapshot`. Name it "before refactor".
3. Make destructive edits (delete frames, change colors).
4. Open `⌚ Versions`. Confirm:
   - [ ] "before refactor" is at the top, with the correct timestamp.
5. Click Restore.
6. Confirm:
   - [ ] State reverts to the snapshot's payload.
   - [ ] Restored state syncs back to the cloud (next `☁ Synced`).
7. Repeat offline — snapshots should fall back to the local panel (no errors).

## 9. JSON export / import roundtrip

1. Project with at least one cloud-asset image.
2. **Export JSON** (topbar `⇥ JSON`). Open the file in a text editor — verify
   the image is inlined as a `data:` URL (not a Supabase path).
3. Sign out, sign in as a different user (or new account).
4. **Import** the JSON. Confirm:
   - [ ] Project loads with images intact.
   - [ ] After ~5 s, Supabase Storage has the re-uploaded asset under the
         **new** user's folder.
   - [ ] `state_json` no longer contains the `data:` URI — it has the new
         `imageAssetPath`.

## 10. Folder-sync permission revoke

1. Connect to a local folder (`⊕ Folder`).
2. Move/delete the folder in the OS file manager.
3. Make an edit in Frontendeasy.
4. Confirm:
   - [ ] Topbar error pill says "Permission lost" with a Retry button.
   - [ ] Clicking Retry re-opens the folder picker.

## 11. Quota / write failure

This is hard to trigger reliably. To simulate:

- Spam many large images (>5 MB each).
- Watch for Storage row-insert failures in DevTools Network tab.
- Confirm error toast surfaces.

## 12. Build + check + tests pass

```
npm run check
npm run build
npm test
```

All three must be green before merging.

## 13. Production deployment readiness

Run this before promoting a Cloudflare Pages preview or production URL in
landing copy. The full non-secret checklist lives in [`DEPLOY.md`](./DEPLOY.md),
and completed smoke results can be recorded with
[`PROD_QA_RESULTS_TEMPLATE.md`](./PROD_QA_RESULTS_TEMPLATE.md).

- [ ] Local gates pass: `npm ci`, `npm run check`, `npm test`,
      `npm run lint:export`, `npm run verify:release`,
      `npm run build:budget`, `npm run validate:handoff`, and
      `git diff --check`.
- [ ] Cloudflare Pages uses `npm run build:budget`, output directory `dist`,
      and `NODE_VERSION=22`.
- [ ] `public/_redirects` SPA fallback is present.
- [ ] `public/_headers` sends a `Content-Security-Policy` header without
      `unsafe-eval`, keeps `index.html` no-cache, and long-caches hashed assets.
- [ ] Live root URL loads the app shell.
- [ ] `/?demo=1` loads without a blank page. If it is not wired to a seeded
      demo, do not use a public "Try demo" CTA yet.
- [ ] Offline mode still works: make an edit with DevTools offline, reload, and
      confirm the IndexedDB draft survives.
- [ ] Supabase env vars are either intentionally omitted for offline-only mode
      or configured in Cloudflare Pages Production without storing any
      `service_role` key.
- [ ] Custom SMTP is either intentionally deferred or configured per
      [`SMTP_SETUP.md`](./SMTP_SETUP.md); credentials are not pasted into docs,
      logs, screenshots, or issues.
- [ ] Release-gated unfinished surfaces remain hidden: AI edit shell,
      unavailable command actions, Code mode, prototype placeholders,
      multiplayer placeholders, profile placeholder actions, and update-note
      placeholders.
- [ ] Any credential-like value captured during QA is replaced with
      `[REDACTED]`.

## 14. AI/agent cloud conflict readiness

AI writes are not exposed in release builds yet. Before enabling any AI/MCP write path, run the checklist in `docs/CLOUD_CONFLICT_AI_AUDIT.md` and confirm:

- [ ] AI writes use the same Project envelope + `lastClientRev` cloud sync path as manual editor writes.
- [ ] If another tab/device writes first, the AI-side local payload is saved as an automatic recovery snapshot before server state is applied.
- [ ] Versions shows both `Pre-sync conflict from ...` and `Before restoring ...` recovery snapshots when applicable.

## Pass criteria

The build is ready for production when all checked boxes above hold. Any
unchecked item is a blocker — file a bug and don't ship.
