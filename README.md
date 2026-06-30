# Frontendeasy

Frontendeasy is a visual UI and landing-page editor built for quickly turning ideas into structured, exportable front-end screens. It combines a Figma-like canvas, page/frame management, editable layers, reusable libraries, design tokens, and HTML export in one lightweight Svelte application.

The project is currently in beta and focuses on making interface prototyping faster without hiding the underlying web output. You can sketch layouts, adjust typography and visual styles, manage assets, preview responsive behavior, and export clean static HTML for further development or publishing.

## What it does

- **Canvas-based visual editing** — create frames, text, shapes, media blocks, groups, links, and export regions directly on the canvas.
- **Project and page workflow** — start from templates, manage multiple frames/pages, rename projects, duplicate work, and keep recent edits saved.
- **Design system tools** — use local libraries, reusable components, project styles, variables, tokens, typography presets, fills, effects, and asset catalogs.
- **Inspector-driven editing** — tune layout, appearance, media crop/filters, prototype links, export settings, and selected-element properties from side panels.
- **Export path** — generate standalone HTML output with metadata, responsive canvas fitting, sanitized CSS, and optional minification checks.
- **Offline-first local mode** — runs without a backend using browser storage for local development.
- **Optional cloud workspace** — when Supabase environment variables are configured, projects can be stored in a signed-in cloud workspace.
- **Desktop packaging** — Electron build configuration is included for macOS, Windows, and Linux packages.

## Tech stack

- Svelte 5 + TypeScript
- Vite
- Electron / electron-builder
- Supabase client for optional cloud auth and storage
- CodeMirror for code-oriented editor surfaces
- Vitest and Playwright for unit and end-to-end coverage

## Getting started

Requirements:

- Node.js 22.x
- npm

Install dependencies:

```bash
npm install
```

Run the web app locally:

```bash
npm run dev
```

Run the Electron development shell:

```bash
npm run electron:dev
```

Build the app:

```bash
npm run build
```

Build desktop packages:

```bash
npm run electron:build
```

## Optional cloud setup

Frontendeasy works locally without a backend. To enable the cloud workspace, copy `.env.example` to `.env` and fill in the public Supabase values:

```bash
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-SUPABASE-ANON-PUBLIC-KEY
```

If these variables are missing, the app stays in offline-only mode using local browser storage.

## Useful scripts

```bash
npm run check              # Svelte and TypeScript checks
npm run test               # Vitest unit tests
npm run test:e2e           # Playwright end-to-end tests
npm run build:budget       # Production build plus bundle budget check
npm run lint:export        # Export quality checks
npm run verify:release     # Release readiness checks
```

## Status

This repository is a public beta source release. APIs, UI flows, and project data structures may still change while the editor is being hardened.

## Feedback and contact

Feedback, bug reports, and collaboration ideas are welcome:

- Telegram: [@Uchenkaa](https://t.me/Uchenkaa)
- Email: [heten615@gmail.com](mailto:heten615@gmail.com)
