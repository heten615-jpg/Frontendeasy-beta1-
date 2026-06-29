-- Atomic cloud project upsert with server-side revision precondition.
-- Prevents the old select-then-upsert race where two clients could both pass
-- the rev check before either write committed.

create or replace function public.upsert_project_if_rev(
  p_id uuid,
  p_title text,
  p_state_json jsonb,
  p_schema_version int,
  p_thumbnail_asset_id uuid,
  p_last_client_rev bigint,
  p_created_at timestamptz,
  p_updated_at timestamptz,
  p_last_opened_at timestamptz,
  p_expected_max_rev bigint
)
returns table (
  ok boolean,
  conflict boolean,
  id uuid,
  owner_user_id uuid,
  title text,
  state_json jsonb,
  schema_version int,
  thumbnail_asset_id uuid,
  last_client_rev bigint,
  created_at timestamptz,
  updated_at timestamptz,
  last_opened_at timestamptz
)
language plpgsql
security invoker
as $$
declare
  v_owner uuid := auth.uid();
  v_row public.projects%rowtype;
begin
  if v_owner is null then
    raise exception 'Not signed in';
  end if;

  update public.projects
     set title = p_title,
         state_json = p_state_json,
         schema_version = p_schema_version,
         thumbnail_asset_id = p_thumbnail_asset_id,
         last_client_rev = p_last_client_rev,
         created_at = p_created_at,
         updated_at = p_updated_at,
         last_opened_at = p_last_opened_at
   where projects.id = p_id
     and projects.owner_user_id = v_owner
     and projects.last_client_rev <= p_expected_max_rev
   returning * into v_row;

  if found then
    ok := true;
    conflict := false;
    id := v_row.id;
    owner_user_id := v_row.owner_user_id;
    title := v_row.title;
    state_json := v_row.state_json;
    schema_version := v_row.schema_version;
    thumbnail_asset_id := v_row.thumbnail_asset_id;
    last_client_rev := v_row.last_client_rev;
    created_at := v_row.created_at;
    updated_at := v_row.updated_at;
    last_opened_at := v_row.last_opened_at;
    return next;
    return;
  end if;

  if exists (select 1 from public.projects where projects.id = p_id and projects.owner_user_id = v_owner) then
    ok := false;
    conflict := true;
    return next;
    return;
  end if;

  begin
    insert into public.projects (
      id,
      owner_user_id,
      title,
      state_json,
      schema_version,
      thumbnail_asset_id,
      last_client_rev,
      created_at,
      updated_at,
      last_opened_at
    )
    values (
      p_id,
      v_owner,
      p_title,
      p_state_json,
      p_schema_version,
      p_thumbnail_asset_id,
      p_last_client_rev,
      p_created_at,
      p_updated_at,
      p_last_opened_at
    )
    returning * into v_row;
  exception when unique_violation then
    ok := false;
    conflict := true;
    return next;
    return;
  end;

  ok := true;
  conflict := false;
  id := v_row.id;
  owner_user_id := v_row.owner_user_id;
  title := v_row.title;
  state_json := v_row.state_json;
  schema_version := v_row.schema_version;
  thumbnail_asset_id := v_row.thumbnail_asset_id;
  last_client_rev := v_row.last_client_rev;
  created_at := v_row.created_at;
  updated_at := v_row.updated_at;
  last_opened_at := v_row.last_opened_at;
  return next;
end;
$$;

grant execute on function public.upsert_project_if_rev(
  uuid, text, jsonb, int, uuid, bigint, timestamptz, timestamptz, timestamptz, bigint
) to authenticated;
