-- Frontendeasy Cloud MVP — initial schema
-- Apply in the Supabase SQL Editor (Project → SQL → New query) or via the
-- Supabase CLI. Safe to re-run: every CREATE uses IF NOT EXISTS.
--
-- Tables:
--   profiles            — mirror of auth.users (display name + avatar)
--   projects            — one row per Frontendeasy project; state_json holds the editor payload
--   project_snapshots   — named/auto versions per project
--   project_assets      — image assets uploaded to Storage; referenced from state_json
--   project_members     — reserved for the future sharing phase; unused in MVP

-- ─── profiles ───────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─── projects ───────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id                 uuid primary key default gen_random_uuid(),
  owner_user_id      uuid not null references auth.users(id) on delete cascade,
  title              text not null default 'Untitled project',
  state_json         jsonb not null,
  schema_version     int  not null,
  thumbnail_asset_id uuid null,
  last_client_rev    bigint not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  last_opened_at     timestamptz not null default now()
);

create index if not exists projects_owner_idx
  on public.projects (owner_user_id, updated_at desc);

-- ─── project_snapshots ──────────────────────────────────────────────────────
create table if not exists public.project_snapshots (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  kind            text not null check (kind in ('manual', 'auto')),
  name            text,
  snapshot_json   jsonb not null,
  schema_version  int  not null,
  created_at      timestamptz not null default now()
);

create index if not exists snapshots_project_idx
  on public.project_snapshots (project_id, created_at desc);

-- ─── project_assets ─────────────────────────────────────────────────────────
create table if not exists public.project_assets (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  owner_user_id  uuid not null references auth.users(id) on delete cascade,
  bucket_id      text not null default 'project-assets',
  path           text not null,                -- e.g. "{user_id}/{project_id}/{asset_id}.png"
  mime_type      text not null,
  size_bytes     bigint not null,
  sha256         text,
  width          int,
  height         int,
  created_at     timestamptz not null default now()
);

create index if not exists assets_project_idx
  on public.project_assets (project_id, created_at desc);

-- ─── project_members (reserved, unused in MVP) ──────────────────────────────
create table if not exists public.project_members (
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner','editor','viewer')) default 'viewer',
  created_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- ─── updated_at triggers ────────────────────────────────────────────────────
-- Keep `updated_at` in sync without forcing every client to set it.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch
  before update on public.projects
  for each row execute function public.touch_updated_at();
