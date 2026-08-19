-- SparkClaw AI Arena authoritative account access and external partner profiles.
-- Auth owns credentials. These tables own Arena authorization and partner context.

begin;

create table if not exists public.sc_arena_partner_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.sc_arena_workspaces(id) on delete cascade,
  organization_id uuid not null,
  partner_type text not null default 'external_partner'
    check (partner_type in ('corporate', 'corporate_cvc', 'lp', 'strategic_investor', 'external_partner')),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'paused', 'archived')),
  profile_label text not null default '' check (char_length(profile_label) <= 200),
  focus_categories text[] not null default '{}',
  target_stages text[] not null default '{}',
  preferred_regions text[] not null default '{}',
  thesis text not null default '' check (char_length(thesis) <= 2000),
  profile_data jsonb not null default '{}'::jsonb check (jsonb_typeof(profile_data) = 'object'),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, organization_id),
  foreign key (workspace_id, organization_id)
    references public.sc_arena_organizations(workspace_id, id)
    on delete cascade
);

create index if not exists sc_arena_partner_profiles_status_idx
  on public.sc_arena_partner_profiles (workspace_id, status, updated_at desc);

alter table public.sc_arena_partner_profiles enable row level security;
alter table public.sc_arena_partner_profiles force row level security;

revoke all on table public.sc_arena_partner_profiles from public, anon, authenticated, service_role;

-- Existing Auth users came from Program Managing and are internal accounts.
-- SparkLabs-domain users remain staff. Revoked memberships stay revoked.
insert into public.sc_arena_organizations (
  workspace_id,
  external_source,
  external_key,
  name,
  organization_type,
  status
)
select
  workspace.id,
  'arena_access',
  'sparklabs',
  'SparkLabs',
  'operator',
  'active'
from public.sc_arena_workspaces workspace
where workspace.slug = 'sparkclaw-ai-arena'
on conflict (workspace_id, external_source, external_key) do update
set name = excluded.name,
    organization_type = excluded.organization_type,
    status = 'active',
    updated_at = now();

insert into public.sc_arena_memberships (
  workspace_id,
  organization_id,
  user_id,
  role,
  status,
  last_seen_at,
  updated_at
)
select
  workspace.id,
  case
    when lower(coalesce(account.email, '')) like '%@sparklabs.co.kr' then operator.id
    else null
  end,
  account.id,
  case
    when lower(coalesce(account.email, '')) like '%@sparklabs.co.kr' then 'staff'
    else 'claw_member'
  end,
  'active',
  now(),
  now()
from auth.users account
cross join public.sc_arena_workspaces workspace
left join public.sc_arena_organizations operator
  on operator.workspace_id = workspace.id
 and operator.external_source = 'arena_access'
 and operator.external_key = 'sparklabs'
where workspace.slug = 'sparkclaw-ai-arena'
on conflict (workspace_id, user_id) do update
set organization_id = case
      when public.sc_arena_memberships.status = 'revoked' then public.sc_arena_memberships.organization_id
      else coalesce(excluded.organization_id, public.sc_arena_memberships.organization_id)
    end,
    role = case
      when public.sc_arena_memberships.status = 'revoked' then public.sc_arena_memberships.role
      else excluded.role
    end,
    status = case
      when public.sc_arena_memberships.status = 'revoked' then 'revoked'
      else 'active'
    end,
    updated_at = now();

create or replace function public.sc_arena_resolve_viewer_access(
  p_user_id uuid,
  p_workspace_slug text default 'sparkclaw-ai-arena'
)
returns table (
  access_found boolean,
  membership_role text,
  membership_status text,
  organization_id uuid,
  organization_name text,
  organization_type text,
  partner_profile_id uuid,
  partner_profile_status text,
  partner_type text,
  profile_label text,
  focus_categories text[],
  target_stages text[],
  preferred_regions text[],
  thesis text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    membership.id is not null as access_found,
    membership.role as membership_role,
    membership.status as membership_status,
    organization.id as organization_id,
    organization.name as organization_name,
    organization.organization_type as organization_type,
    partner.id as partner_profile_id,
    partner.status as partner_profile_status,
    partner.partner_type,
    partner.profile_label,
    coalesce(partner.focus_categories, '{}') as focus_categories,
    coalesce(partner.target_stages, '{}') as target_stages,
    coalesce(partner.preferred_regions, '{}') as preferred_regions,
    coalesce(partner.thesis, '') as thesis
  from public.sc_arena_workspaces workspace
  left join public.sc_arena_memberships membership
    on membership.workspace_id = workspace.id
   and membership.user_id = p_user_id
  left join public.sc_arena_organizations organization
    on organization.workspace_id = membership.workspace_id
   and organization.id = membership.organization_id
  left join public.sc_arena_partner_profiles partner
    on partner.workspace_id = membership.workspace_id
   and partner.organization_id = membership.organization_id
  where workspace.slug = p_workspace_slug
    and workspace.status = 'active'
  limit 1;
$$;

revoke all on function public.sc_arena_resolve_viewer_access(uuid, text)
  from public, anon, authenticated;
grant execute on function public.sc_arena_resolve_viewer_access(uuid, text)
  to service_role;

comment on table public.sc_arena_partner_profiles is
  'AI Arena external partner business profiles. Login credentials remain in auth.users; membership role remains authoritative in sc_arena_memberships.';
comment on function public.sc_arena_resolve_viewer_access(uuid, text) is
  'Service-only authorization lookup used after Supabase Auth verifies the user.';

commit;
