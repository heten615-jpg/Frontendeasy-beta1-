-- RLS ownership hardening for child rows.
-- Apply after 0005_project_comments.sql. Safe to re-run.
--
-- Goal: child rows must not only claim owner_user_id = auth.uid(); they must
-- also point at a project currently owned by that user. Asset inserts also
-- need to keep the Storage path convention aligned with the same owner/project.

create or replace function public.project_owned_by_current_user(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1
      from public.projects p
     where p.id = p_project_id
       and p.owner_user_id = auth.uid()
  )
$$;

create or replace function public.project_asset_path_matches_owner(
  p_bucket_id text,
  p_path text,
  p_project_id uuid
)
returns boolean
language sql
stable
as $$
  select auth.uid() is not null
    and p_bucket_id = 'project-assets'
    and array_length(string_to_array(p_path, '/'), 1) = 3
    and split_part(p_path, '/', 1) = auth.uid()::text
    and split_part(p_path, '/', 2) = p_project_id::text
$$;

-- ─── project_snapshots ──────────────────────────────────────────────────────
drop policy if exists "own snapshots read"   on public.project_snapshots;
drop policy if exists "own snapshots insert" on public.project_snapshots;
drop policy if exists "own snapshots delete" on public.project_snapshots;

create policy "own snapshots read"
  on public.project_snapshots for select
  to authenticated
  using (
    owner_user_id = auth.uid()
    and public.project_owned_by_current_user(project_id)
  );

create policy "own snapshots insert"
  on public.project_snapshots for insert
  to authenticated
  with check (
    owner_user_id = auth.uid()
    and public.project_owned_by_current_user(project_id)
  );

create policy "own snapshots delete"
  on public.project_snapshots for delete
  to authenticated
  using (
    owner_user_id = auth.uid()
    and public.project_owned_by_current_user(project_id)
  );

-- ─── project_assets ─────────────────────────────────────────────────────────
drop policy if exists "own assets read"   on public.project_assets;
drop policy if exists "own assets insert" on public.project_assets;
drop policy if exists "own assets delete" on public.project_assets;

create policy "own assets read"
  on public.project_assets for select
  to authenticated
  using (
    owner_user_id = auth.uid()
    and public.project_owned_by_current_user(project_id)
  );

create policy "own assets insert"
  on public.project_assets for insert
  to authenticated
  with check (
    owner_user_id = auth.uid()
    and public.project_owned_by_current_user(project_id)
    and public.project_asset_path_matches_owner(bucket_id, path, project_id)
  );

create policy "own assets delete"
  on public.project_assets for delete
  to authenticated
  using (
    owner_user_id = auth.uid()
    and public.project_owned_by_current_user(project_id)
  );

-- ─── project_comments ───────────────────────────────────────────────────────
drop policy if exists "project comments read" on public.project_comments;
drop policy if exists "project comments insert" on public.project_comments;
drop policy if exists "project comments update" on public.project_comments;
drop policy if exists "project comments delete" on public.project_comments;

create policy "project comments read"
  on public.project_comments for select
  to authenticated
  using (
    owner_user_id = public.project_comment_project_owner(project_id)
    and public.project_comment_can_read(project_id)
  );

create policy "project comments insert"
  on public.project_comments for insert
  to authenticated
  with check (
    author_user_id = auth.uid()
    and owner_user_id = public.project_comment_project_owner(project_id)
    and public.project_comment_can_write(project_id)
  );

create policy "project comments update"
  on public.project_comments for update
  to authenticated
  using (
    owner_user_id = public.project_comment_project_owner(project_id)
    and public.project_comment_can_read(project_id)
    and (public.project_comment_can_write(project_id) or author_user_id = auth.uid())
  )
  with check (
    owner_user_id = public.project_comment_project_owner(project_id)
    and public.project_comment_can_read(project_id)
    and (public.project_comment_can_write(project_id) or author_user_id = auth.uid())
  );

create policy "project comments delete"
  on public.project_comments for delete
  to authenticated
  using (
    owner_user_id = public.project_comment_project_owner(project_id)
    and public.project_comment_can_read(project_id)
    and (public.project_comment_can_write(project_id) or author_user_id = auth.uid())
  );

revoke execute on function public.project_owned_by_current_user(uuid) from public;
revoke execute on function public.project_asset_path_matches_owner(text, text, uuid) from public;
grant execute on function public.project_owned_by_current_user(uuid) to authenticated;
grant execute on function public.project_asset_path_matches_owner(text, text, uuid) to authenticated;
