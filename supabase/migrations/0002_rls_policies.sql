-- Frontendeasy Cloud MVP — Row Level Security policies
-- Every table in `public` enforces "row visible/mutable only when
-- owner_user_id = auth.uid()". Apply AFTER 0001_initial_schema.sql.
--
-- Apply twice safely: every CREATE POLICY is guarded by DROP POLICY IF EXISTS
-- so re-runs don't error.

-- ─── profiles ───────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

drop policy if exists "own profile read"   on public.profiles;
drop policy if exists "own profile insert" on public.profiles;
drop policy if exists "own profile update" on public.profiles;

create policy "own profile read"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "own profile insert"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "own profile update"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ─── projects ───────────────────────────────────────────────────────────────
alter table public.projects enable row level security;

drop policy if exists "own projects read"   on public.projects;
drop policy if exists "own projects insert" on public.projects;
drop policy if exists "own projects update" on public.projects;
drop policy if exists "own projects delete" on public.projects;

create policy "own projects read"
  on public.projects for select
  to authenticated
  using (owner_user_id = auth.uid());

create policy "own projects insert"
  on public.projects for insert
  to authenticated
  with check (owner_user_id = auth.uid());

create policy "own projects update"
  on public.projects for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "own projects delete"
  on public.projects for delete
  to authenticated
  using (owner_user_id = auth.uid());

-- ─── project_snapshots ──────────────────────────────────────────────────────
alter table public.project_snapshots enable row level security;

drop policy if exists "own snapshots read"   on public.project_snapshots;
drop policy if exists "own snapshots insert" on public.project_snapshots;
drop policy if exists "own snapshots delete" on public.project_snapshots;

create policy "own snapshots read"
  on public.project_snapshots for select
  to authenticated
  using (owner_user_id = auth.uid());

create policy "own snapshots insert"
  on public.project_snapshots for insert
  to authenticated
  with check (owner_user_id = auth.uid());

create policy "own snapshots delete"
  on public.project_snapshots for delete
  to authenticated
  using (owner_user_id = auth.uid());

-- ─── project_assets ─────────────────────────────────────────────────────────
alter table public.project_assets enable row level security;

drop policy if exists "own assets read"   on public.project_assets;
drop policy if exists "own assets insert" on public.project_assets;
drop policy if exists "own assets delete" on public.project_assets;

create policy "own assets read"
  on public.project_assets for select
  to authenticated
  using (owner_user_id = auth.uid());

create policy "own assets insert"
  on public.project_assets for insert
  to authenticated
  with check (owner_user_id = auth.uid());

create policy "own assets delete"
  on public.project_assets for delete
  to authenticated
  using (owner_user_id = auth.uid());

-- ─── project_members (reserved; locked to owner-only access for MVP) ────────
alter table public.project_members enable row level security;

drop policy if exists "own membership read" on public.project_members;
create policy "own membership read"
  on public.project_members for select
  to authenticated
  using (user_id = auth.uid());

-- ─── auto-create profile row on first sign-in ───────────────────────────────
-- Without this, profiles is empty until the client explicitly inserts.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
