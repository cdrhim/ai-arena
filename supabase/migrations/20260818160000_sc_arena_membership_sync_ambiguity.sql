begin;

-- Supabase/Postgres treats OUT parameter names as PL/pgSQL variables. The
-- original function also has physical columns named workspace_id and
-- organization_id, so make the intended column resolution explicit.
create or replace function public.sc_arena_sync_membership(
  p_user_id uuid,
  p_role text,
  p_organization_source text default null,
  p_organization_key text default null,
  p_organization_name text default null,
  p_organization_type text default 'other',
  p_workspace_slug text default 'sparkclaw-ai-arena'
)
returns table (workspace_id uuid, organization_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_workspace_id uuid;
  v_organization_id uuid;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;
  if p_role not in ('claw_member', 'partner', 'staff', 'admin', 'human_validator') then
    raise exception 'unsupported Arena membership role';
  end if;

  select w.id into v_workspace_id
  from public.sc_arena_workspaces w
  where w.slug = p_workspace_slug and w.status = 'active';
  if v_workspace_id is null then raise exception 'Arena workspace not found'; end if;

  select m.organization_id into v_organization_id
  from public.sc_arena_memberships m
  where m.workspace_id = v_workspace_id
    and m.user_id = p_user_id
    and m.status = 'revoked';
  if found then
    return query select v_workspace_id, v_organization_id;
    return;
  end if;

  if left(coalesce(trim(p_organization_source), ''), 80) = 'arena_user' then
    select m.organization_id into v_organization_id
    from public.sc_arena_memberships m
    join public.sc_arena_organizations o
      on o.workspace_id = m.workspace_id and o.id = m.organization_id
    where m.workspace_id = v_workspace_id
      and m.user_id = p_user_id
      and m.status = 'active'
      and o.external_source <> 'arena_user';
  end if;

  if v_organization_id is null
     and nullif(trim(p_organization_source), '') is not null
     and nullif(trim(p_organization_key), '') is not null then
    insert into public.sc_arena_organizations (
      workspace_id, external_source, external_key, name, organization_type
    ) values (
      v_workspace_id,
      left(trim(p_organization_source), 80),
      left(trim(p_organization_key), 160),
      left(coalesce(nullif(trim(p_organization_name), ''), trim(p_organization_key)), 240),
      case when p_organization_type in ('startup', 'partner', 'operator', 'validator', 'other')
        then p_organization_type else 'other' end
    )
    on conflict (workspace_id, external_source, external_key) do update
    set name = excluded.name,
        organization_type = excluded.organization_type,
        status = 'active',
        updated_at = now()
    returning id into v_organization_id;
  end if;

  insert into public.sc_arena_memberships (
    workspace_id, organization_id, user_id, role, status, last_seen_at
  ) values (
    v_workspace_id, v_organization_id, p_user_id, p_role, 'active', now()
  )
  on conflict (workspace_id, user_id) do update
  set organization_id = case
        when public.sc_arena_memberships.status = 'revoked'
          then public.sc_arena_memberships.organization_id
        when left(coalesce(trim(p_organization_source), ''), 80) = 'arena_user'
          and exists (
            select 1
            from public.sc_arena_organizations current_organization
            where current_organization.workspace_id = public.sc_arena_memberships.workspace_id
              and current_organization.id = public.sc_arena_memberships.organization_id
              and current_organization.external_source <> 'arena_user'
          )
          then public.sc_arena_memberships.organization_id
        else coalesce(excluded.organization_id, public.sc_arena_memberships.organization_id)
      end,
      role = case
        when public.sc_arena_memberships.status = 'revoked'
          then public.sc_arena_memberships.role
        else excluded.role
      end,
      status = case
        when public.sc_arena_memberships.status = 'revoked' then 'revoked'
        else 'active'
      end,
      last_seen_at = now(),
      updated_at = now()
  returning organization_id into v_organization_id;

  return query select v_workspace_id, v_organization_id;
end;
$$;

commit;
