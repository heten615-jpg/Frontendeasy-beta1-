-- Frontendeasy Cloud MVP — `project-assets` Storage bucket + RLS
--
-- The bucket itself must be created via the Supabase dashboard or API
-- (Storage → New bucket → name: `project-assets`, public: OFF) — SQL alone
-- cannot create buckets. This file ensures the bucket row exists and installs
-- the per-user object policies.
--
-- Path convention enforced by these policies:
--   project-assets/{user_id}/{project_id}/{asset_id}.{ext}
-- The first segment must equal auth.uid() — that's the security boundary.

-- ─── ensure bucket row exists (idempotent) ──────────────────────────────────
insert into storage.buckets (id, name, public)
values ('project-assets', 'project-assets', false)
on conflict (id) do update set public = excluded.public;

-- ─── object policies (per-user folder access) ───────────────────────────────
drop policy if exists "own files read"   on storage.objects;
drop policy if exists "own files insert" on storage.objects;
drop policy if exists "own files update" on storage.objects;
drop policy if exists "own files delete" on storage.objects;

create policy "own files read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'project-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own files insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'project-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own files update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'project-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'project-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own files delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'project-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
