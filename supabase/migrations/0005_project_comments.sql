-- Sticky comments / async review schema.
-- Apply after 0004_atomic_project_upsert.sql. Safe to re-run.

create table if not exists public.project_comments (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  owner_user_id     uuid not null references auth.users(id) on delete cascade,
  author_user_id    uuid not null references auth.users(id) on delete cascade,
  target_type       text not null check (target_type in ('canvas', 'frame', 'element')),
  target_frame_id   text,
  target_element_id text,
  x                 double precision not null default 0,
  y                 double precision not null default 0,
  body              text not null check (char_length(btrim(body)) > 0),
  thread_json       jsonb not null default '[]'::jsonb check (jsonb_typeof(thread_json) = 'array'),
  resolved          boolean not null default false,
  schema_version    int not null default 1,
  client_id         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint project_comments_target_shape check (
    (target_type = 'canvas' and target_frame_id is null and target_element_id is null)
    or (target_type = 'frame' and target_frame_id is not null and target_element_id is null)
    or (target_type = 'element' and target_element_id is not null)
  )
);

create index if not exists project_comments_project_idx
  on public.project_comments (project_id, created_at desc);

create index if not exists project_comments_project_resolved_idx
  on public.project_comments (project_id, resolved, updated_at desc);

drop index if exists project_comments_project_client_id_uidx;
create unique index project_comments_project_client_id_uidx
  on public.project_comments (project_id, client_id);

drop trigger if exists project_comments_touch on public.project_comments;
create trigger project_comments_touch
  before update on public.project_comments
  for each row execute function public.touch_updated_at();

create or replace function public.project_comment_project_owner(p_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.owner_user_id
    from public.projects p
   where p.id = p_project_id
$$;

create or replace function public.project_comment_can_read(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (
      select 1
        from public.projects p
       where p.id = p_project_id
         and p.owner_user_id = auth.uid()
    )
    or exists (
      select 1
        from public.project_members m
       where m.project_id = p_project_id
         and m.user_id = auth.uid()
    )
  )
$$;

create or replace function public.project_comment_can_write(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (
      select 1
        from public.projects p
       where p.id = p_project_id
         and p.owner_user_id = auth.uid()
    )
    or exists (
      select 1
        from public.project_members m
       where m.project_id = p_project_id
         and m.user_id = auth.uid()
         and m.role in ('owner', 'editor')
    )
  )
$$;

create or replace function public.project_comments_lock_identity()
returns trigger
language plpgsql
as $$
begin
  new.id = old.id;
  new.project_id = old.project_id;
  new.owner_user_id = old.owner_user_id;
  new.author_user_id = old.author_user_id;
  new.client_id = old.client_id;
  new.created_at = old.created_at;
  return new;
end;
$$;

drop trigger if exists project_comments_lock_identity on public.project_comments;
create trigger project_comments_lock_identity
  before update on public.project_comments
  for each row execute function public.project_comments_lock_identity();

alter table public.project_comments enable row level security;

drop policy if exists "project comments read" on public.project_comments;
drop policy if exists "project comments insert" on public.project_comments;
drop policy if exists "project comments update" on public.project_comments;
drop policy if exists "project comments delete" on public.project_comments;

create policy "project comments read"
  on public.project_comments for select
  to authenticated
  using (public.project_comment_can_read(project_id));

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
    public.project_comment_can_read(project_id)
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
    public.project_comment_can_read(project_id)
    and (public.project_comment_can_write(project_id) or author_user_id = auth.uid())
  );

grant select, insert, update, delete on public.project_comments to authenticated;

revoke execute on function public.project_comment_project_owner(uuid) from public;
revoke execute on function public.project_comment_can_read(uuid) from public;
revoke execute on function public.project_comment_can_write(uuid) from public;
grant execute on function public.project_comment_project_owner(uuid) to authenticated;
grant execute on function public.project_comment_can_read(uuid) to authenticated;
grant execute on function public.project_comment_can_write(uuid) to authenticated;
