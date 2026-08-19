-- Reversible archive for Arena Auth accounts that are no longer authorized.
-- Credentials remain owned by Supabase Auth. This table never copies password
-- hashes, recovery tokens, refresh tokens, or provider credentials.

begin;

create table if not exists public.sc_arena_archived_accounts (
  workspace_id uuid not null references public.sc_arena_workspaces(id) on delete cascade,
  user_id uuid not null,
  email text not null check (char_length(email) <= 320),
  previous_access_source text,
  previous_banned_until timestamptz,
  previous_membership_role text,
  previous_membership_status text,
  previous_organization_id uuid,
  archive_reason text not null check (char_length(archive_reason) between 1 and 500),
  archived_at timestamptz not null default now(),
  restored_at timestamptz,
  primary key (workspace_id, user_id)
);

create index if not exists sc_arena_archived_accounts_time_idx
  on public.sc_arena_archived_accounts (workspace_id, archived_at desc)
  where restored_at is null;

alter table public.sc_arena_archived_accounts enable row level security;
alter table public.sc_arena_archived_accounts force row level security;

revoke all on table public.sc_arena_archived_accounts
  from public, anon, authenticated, service_role;

create or replace function public.sc_arena_archive_accounts(
  p_user_ids uuid[],
  p_reason text,
  p_workspace_slug text default 'sparkclaw-ai-arena'
)
returns table (archived_count integer, revoked_membership_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_archived integer := 0;
  v_revoked integer := 0;
begin
  if coalesce(array_length(p_user_ids, 1), 0) = 0 then
    raise exception 'At least one user id is required' using errcode = '22023';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'A valid archive reason is required' using errcode = '22023';
  end if;

  select workspace.id into v_workspace_id
  from public.sc_arena_workspaces workspace
  where workspace.slug = p_workspace_slug
    and workspace.status = 'active';

  if v_workspace_id is null then
    raise exception 'Arena workspace not found' using errcode = '22023';
  end if;

  insert into public.sc_arena_archived_accounts (
    workspace_id, user_id, email, previous_access_source,
    previous_banned_until, previous_membership_role,
    previous_membership_status, previous_organization_id,
    archive_reason, archived_at, restored_at
  )
  select
    v_workspace_id,
    account.id,
    lower(coalesce(account.email, '')),
    nullif(account.raw_app_meta_data->>'arena_access_source', ''),
    account.banned_until,
    membership.role,
    membership.status,
    membership.organization_id,
    v_reason,
    now(),
    null
  from auth.users account
  left join public.sc_arena_memberships membership
    on membership.workspace_id = v_workspace_id
   and membership.user_id = account.id
  where account.id = any(p_user_ids)
    and lower(coalesce(account.email, '')) not like '%@sparklabs.co.kr'
    and coalesce(account.raw_app_meta_data->>'arena_access_source', '')
      not in ('isolated_test', 'arena_partner', 'external_partner')
  on conflict (workspace_id, user_id) do update
  set email = excluded.email,
      previous_access_source = excluded.previous_access_source,
      previous_banned_until = excluded.previous_banned_until,
      previous_membership_role = excluded.previous_membership_role,
      previous_membership_status = excluded.previous_membership_status,
      previous_organization_id = excluded.previous_organization_id,
      archive_reason = excluded.archive_reason,
      archived_at = excluded.archived_at,
      restored_at = null
  where public.sc_arena_archived_accounts.restored_at is not null;
  get diagnostics v_archived = row_count;

  update public.sc_arena_memberships membership
  set status = 'revoked',
      updated_at = now()
  from public.sc_arena_archived_accounts archive
  where membership.workspace_id = v_workspace_id
    and archive.workspace_id = membership.workspace_id
    and archive.user_id = membership.user_id
    and archive.restored_at is null
    and membership.user_id = any(p_user_ids)
    and membership.status <> 'revoked';
  get diagnostics v_revoked = row_count;

  update auth.users account
  set banned_until = '9999-12-31 23:59:59+00'::timestamptz,
      raw_app_meta_data = jsonb_set(
        jsonb_set(
          jsonb_set(
            coalesce(account.raw_app_meta_data, '{}'::jsonb),
            '{arena_access_source}',
            '"archived"'::jsonb,
            true
          ),
          '{arena_archived_at}',
          to_jsonb(now()::text),
          true
        ),
        '{arena_archive_reason}',
        to_jsonb(v_reason),
        true
      ),
      updated_at = now()
  where account.id = any(p_user_ids)
    and lower(coalesce(account.email, '')) not like '%@sparklabs.co.kr'
    and coalesce(account.raw_app_meta_data->>'arena_access_source', '')
      not in ('isolated_test', 'arena_partner', 'external_partner');

  return query select v_archived, v_revoked;
end;
$$;

create or replace function public.sc_arena_restore_archived_account(
  p_user_id uuid,
  p_workspace_slug text default 'sparkclaw-ai-arena'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_archive public.sc_arena_archived_accounts%rowtype;
  v_metadata jsonb;
begin
  select workspace.id into v_workspace_id
  from public.sc_arena_workspaces workspace
  where workspace.slug = p_workspace_slug;

  select archive.* into v_archive
  from public.sc_arena_archived_accounts archive
  where archive.workspace_id = v_workspace_id
    and archive.user_id = p_user_id
    and archive.restored_at is null
  for update;

  if v_archive.user_id is null then
    return false;
  end if;

  update public.sc_arena_memberships membership
  set organization_id = v_archive.previous_organization_id,
      role = coalesce(v_archive.previous_membership_role, membership.role),
      status = coalesce(v_archive.previous_membership_status, 'active'),
      updated_at = now()
  where membership.workspace_id = v_workspace_id
    and membership.user_id = p_user_id;

  select coalesce(account.raw_app_meta_data, '{}'::jsonb)
         - 'arena_archived_at'
         - 'arena_archive_reason'
    into v_metadata
  from auth.users account
  where account.id = p_user_id;

  if v_archive.previous_access_source is null then
    v_metadata := v_metadata - 'arena_access_source';
  else
    v_metadata := jsonb_set(v_metadata, '{arena_access_source}', to_jsonb(v_archive.previous_access_source), true);
  end if;

  update auth.users account
  set banned_until = v_archive.previous_banned_until,
      raw_app_meta_data = v_metadata,
      updated_at = now()
  where account.id = p_user_id;

  update public.sc_arena_archived_accounts archive
  set restored_at = now()
  where archive.workspace_id = v_workspace_id
    and archive.user_id = p_user_id;

  return true;
end;
$$;

revoke all on function public.sc_arena_archive_accounts(uuid[], text, text)
  from public, anon, authenticated;
revoke all on function public.sc_arena_restore_archived_account(uuid, text)
  from public, anon, authenticated;
grant execute on function public.sc_arena_archive_accounts(uuid[], text, text)
  to service_role;
grant execute on function public.sc_arena_restore_archived_account(uuid, text)
  to service_role;

comment on table public.sc_arena_archived_accounts is
  'Private reversible archive ledger for Arena Auth accounts. Password hashes and authentication tokens are never copied here.';
comment on function public.sc_arena_archive_accounts(uuid[], text, text) is
  'Service-only reversible account archive. Records minimal recovery metadata, revokes Arena membership, and bans new Auth sessions.';

commit;
