# Frontendeasy Product Brief — Figma-like HTML Layout Studio

## Core idea
Frontendeasy is not a code editor first. It is a visual layout application that works like Figma, but every frame is already a real HTML page under the hood.

The designer should draw frames, sections, text, buttons, and blocks visually. Frontendeasy continuously generates and saves the corresponding HTML file for each frame/page. Export should still exist, but the important product promise is: the saved workspace already contains ready frontend HTML files.

## Current implementation target (2026-05-25 onward)
The product target has shifted to a **web-first cloud-synced editor**. The Figma-like Vite/Svelte canvas is already built; the next milestone is to make projects persist beyond a single browser tab — accounts, per-user project list, cloud sync across devices, and asset storage in a proper bucket.

Implementation plan: see `AGENT_AUTONOMY/CLOUD_MIGRATION_PLAN.md`. Recommended stack — Supabase (Auth + Postgres + Storage) + Cloudflare Pages + a custom .com domain + Resend or Brevo SMTP. Electron desktop wrapper is frozen (legacy) and ships only after the web product is stable.

## Required UX model
- Left side: tool rail and layers/pages panel.
- Center: large canvas/workspace with multiple frames.
- Right side: inspector for selected frame/element.
- Frames are page-sized canvases/cards on the workspace.
- Each frame maps to one generated HTML file.
- Elements inside frames are HTML blocks.

## Basic tools for this pass
1. Select/move tool.
2. Frame/page tool: create a new frame/page.
3. Section/block tool: add visual block/section inside selected frame.
4. Text tool: add text element.
5. Button tool: add button element.
6. Link tool/connector for buttons.

## Frame/page behavior
Each frame must have:
- id
- name
- x/y position on canvas
- width/height
- background color
- elements array
- generated HTML filename, e.g. `home.html`, `landing.html`

The app should generate valid HTML for every frame from its elements.

## Auto-save HTML files
Browser limitation note: a web app cannot silently write to local project folders without a permission grant. For the browser build:
- App state autosaves locally (localStorage today, migrating to IndexedDB for richer drafts).
- "Connect HTML Folder" uses File System Access API where available (Chromium-based browsers).
- Once the user chooses a folder, every frame is auto-written/updated as `<slug>.html` in that folder; debounced to 300 ms.
- If FSA is unavailable (Safari/Firefox), the export/download fallback remains.
- A clear UI state distinguishes connected / writing / synced / permission lost.
- On permission revoke, a Retry button surfaces in the topbar that re-opens the folder picker.

In the Electron desktop build (legacy/frozen), filesystem autosave uses native Node `fs` via IPC. This codepath is preserved but is no longer the primary target — the web build is the active development surface.

## Cloud storage (planned)
Beyond the local-first layer, projects can sync to a Supabase backend:
- **Auth:** email/password and magic link via Supabase Auth (custom SMTP through Resend/Brevo). Google OAuth optional.
- **Per-user project isolation:** Postgres tables (`projects`, `project_snapshots`, `project_assets`) under Row Level Security where `owner_user_id = auth.uid()`.
- **Asset storage:** binary files (images) live in a private Storage bucket. `state_json` carries only asset metadata + path. No more base64 in JSON.
- **Sync model:** in-memory → IndexedDB draft (~700 ms debounce) → Supabase cloud (~2500 ms debounce). Last-write-wins with a `last_client_rev` counter for v1; CRDT/real-time deferred.
- **Status indicators in topbar:** Saved locally / Syncing / Synced / Offline / Conflict.

## Button-to-frame linking
Mandatory:
- Buttons can be linked to another frame/page.
- When a button element is selected, the right inspector must show a link/connector control.
- There should be a visual way to assign target frame:
  - MVP acceptable: click `Connect to frame`, then click the target frame, and show a temporary connector line.
  - Better if feasible: small handle on selected button with a line preview to the target frame.
- Generated HTML must make linked buttons navigate to the target frame HTML file, e.g. `onclick` or anchor link to `target-frame.html`.
- Canvas should visually show link relationship between selected linked button and target frame.

## Element model
Basic element fields:
- id
- type: section | text | button
- frameId
- x/y/w/h within frame
- content/label
- fill/background
- textColor
- fontSize
- borderRadius
- targetFrameId only for buttons

## Editing requirements
- Select frames and elements.
- Move elements by dragging if feasible; otherwise click + inspector numeric fields is acceptable, but basic drag is preferred.
- Inspector lets user edit position, size, color, text, radius, frame name, filename.
- Adding an element should place it inside the active/selected frame.
- Layers list should show frames and their elements.

## Visual direction
Premium dark Figma-like interface, but with Frontendeasy identity:
- dark canvas outside frames
- framed white/light pages by default
- orange/cream accent
- clean panels, compact controls
- not a generic Vite starter

## Preserve / avoid
- Keep all project files inside `/Users/uchenkaa/Desktop/Frontendeasy Automation Knowledge Base/Frontendeasy`.
- Do not delete unrelated files outside this folder.
- Use only free-tier services on MVP (Supabase Free, Cloudflare Pages, Resend/Brevo Free). Paid tiers are an upgrade path, not a starting requirement.
- Cloud, auth, and asset storage are now in scope (web-first MVP). Payments and billing are not.
- Do not build a full Webflow clone; this is a Figma-like HTML editor MVP.
- Do not write secrets (Supabase service key, SMTP credentials) into the client bundle. Anon key in `.env`, service key never leaves backend Edge Functions if used.
- Do not put binary data (base64 images) into the project's `state_json`. Assets go to Supabase Storage with references in JSON.

## Verification
- `npm run build` must pass.
- `npm run check` must pass if possible; if Svelte check flags only legacy warnings, fix them if practical.
- The app should still run with `npm run dev`.
