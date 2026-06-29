# Supabase setup for Frontendeasy

This folder holds the SQL migrations that build the cloud backend.
Code already in the repo (`src/lib/supabaseClient.ts`) reads
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env` and lazily
opens a single client connection. Until those env vars point to a real
project, the editor runs in **offline-only** mode (IndexedDB + localStorage).

## Manual steps (one-time, ~10 minutes)

1. **Create the Supabase project**
   - Go to https://supabase.com → New project.
   - Pick the EU Frankfurt or US East region.
   - Choose a strong database password (saved in a password manager — you
     won't need it day-to-day, only for direct `psql` access).
   - Wait ~2 minutes for provisioning.

2. **Copy the API credentials into `.env`**
   - Supabase dashboard → Project Settings → API.
   - Copy **Project URL** → paste into `VITE_SUPABASE_URL`.
   - Copy **`anon` `public` key** → paste into `VITE_SUPABASE_ANON_KEY`.
   - **Do not** copy the `service_role` key — it bypasses RLS and must
     never reach client code.

3. **Run the SQL migrations** (in order)
   - Dashboard → SQL Editor → New query.
   - Paste the contents of each file under `supabase/migrations/` and run:
     1. `0001_initial_schema.sql` — tables + indexes
     2. `0002_rls_policies.sql`   — Row Level Security + auto-profile trigger
     3. `0003_storage_bucket.sql` — `project-assets` bucket + storage RLS
     4. `0004_atomic_project_upsert.sql` — guarded project save RPC
     5. `0005_project_comments.sql` — sticky comments table + comment RLS
     6. `0006_rls_ownership_hardening.sql` — child-row ownership hardening
   - Re-running is safe; every statement is idempotent.

4. **Create the Storage bucket** (if `0003_storage_bucket.sql` didn't already)
   - Dashboard → Storage → New bucket.
   - Name: `project-assets`
   - Public: **OFF** (private). The bucket is only reachable through signed
     URLs or authenticated reads.

5. **Configure Auth**
   - Dashboard → Authentication → URL Configuration.
   - Site URL: `https://app.yourdomain.com` (or `http://localhost:5173` for dev).
   - Redirect URLs: add `http://localhost:5173/*` so dev sign-ins land back in the app.
   - Authentication → Providers → enable **Email**. Magic-link is enabled
     by default; password is the toggle below it.

6. **Custom SMTP** (only when needed)
   - Default Supabase email is capped at 2/hour, fine only for first dev sessions.
   - Full step-by-step (Resend or Brevo, DNS, smoke test): [`../docs/SMTP_SETUP.md`](../docs/SMTP_SETUP.md).
   - Skip this until you're about to open sign-ups to real users.

## Backups & restore (optional but recommended)

- Daily Postgres backups run automatically on Supabase Free, but retention
  is limited and Storage objects are NOT included.
- For belt-and-suspenders: weekly `supabase db dump --db-url <conn>` plus
  `supabase storage cp -r project-assets/ ./backup/` to a local archive.

## Where this fits in the cloud migration plan

- Item 32 (this step): schema + RLS + bucket + env-shaped client.
- Item 33: auth flow (sign-up / sign-in / magic link).
- Item 34: cloud save/load + projects list page.
- Item 35: asset pipeline (uploads to `project-assets`).
- Item 37: deploy to Cloudflare Pages with the same env vars.

See `AGENT_AUTONOMY/CLOUD_MIGRATION_PLAN.md` for the full plan.
