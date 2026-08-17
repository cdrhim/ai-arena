-- SparkClaw AI Arena: private benefit-needs survey responses.
-- Responses are collected independently from Community posts and retain revision history.

begin;

create table if not exists public.sc_arena_benefit_need_surveys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.sc_arena_workspaces(id) on delete restrict,
  organization_id uuid not null,
  respondent_user_id uuid not null references auth.users(id) on delete cascade,
  response_version integer not null check (response_version between 1 and 10000),
  is_current boolean not null default true,
  categories text[] not null,
  details text not null check (char_length(details) between 10 and 1200),
  needed_by text not null check (needed_by in ('now', 'within_1_month', 'within_3_months', 'exploring')),
  status text not null default 'submitted'
    check (status in ('submitted', 'reviewing', 'matched', 'closed')),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, respondent_user_id, response_version),
  foreign key (workspace_id, organization_id)
    references public.sc_arena_organizations(workspace_id, id) on delete restrict,
  check (cardinality(categories) between 1 and 6),
  check (categories <@ array[
    'product_pro_account',
    'cloud_credit',
    'recruiting',
    'education_mentoring',
    'business_operations',
    'other'
  ]::text[])
);

create unique index if not exists sc_arena_benefit_need_surveys_one_current_idx
  on public.sc_arena_benefit_need_surveys (workspace_id, respondent_user_id)
  where is_current;

create index if not exists sc_arena_benefit_need_surveys_status_submitted_idx
  on public.sc_arena_benefit_need_surveys (workspace_id, status, submitted_at desc);

create index if not exists sc_arena_benefit_need_surveys_org_current_idx
  on public.sc_arena_benefit_need_surveys (workspace_id, organization_id, submitted_at desc)
  where is_current;

alter table public.sc_arena_benefit_need_surveys enable row level security;
alter table public.sc_arena_benefit_need_surveys force row level security;

-- All reads and writes go through bounded service-only RPCs. The browser never writes this table.
revoke all on public.sc_arena_benefit_need_surveys
from public, anon, authenticated, service_role;

create or replace function public.sc_arena_submit_benefit_need_survey(
  p_workspace_slug text,
  p_user_id uuid,
  p_organization_source text,
  p_organization_key text,
  p_organization_name text,
  p_categories text[],
  p_details text,
  p_needed_by text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_organization_id uuid;
  v_response_version integer;
  v_response public.sc_arena_benefit_need_surveys%rowtype;
begin
  if p_user_id is null then raise exception 'respondent user is required'; end if;
  if p_organization_source not in ('program_team', 'arena_user') then
    raise exception 'invalid organization source';
  end if;
  if nullif(trim(p_organization_key), '') is null then raise exception 'organization key is required'; end if;
  if p_categories is null or cardinality(p_categories) < 1 or cardinality(p_categories) > 6 then
    raise exception 'select between one and six benefit categories';
  end if;
  if not (p_categories <@ array[
    'product_pro_account',
    'cloud_credit',
    'recruiting',
    'education_mentoring',
    'business_operations',
    'other'
  ]::text[]) then
    raise exception 'invalid benefit category';
  end if;
  if char_length(trim(coalesce(p_details, ''))) not between 10 and 1200 then
    raise exception 'benefit details must be between 10 and 1200 characters';
  end if;
  if p_needed_by not in ('now', 'within_1_month', 'within_3_months', 'exploring') then
    raise exception 'invalid needed-by value';
  end if;

  select w.id into v_workspace_id
  from public.sc_arena_workspaces w
  where w.slug = p_workspace_slug and w.status = 'active';
  if v_workspace_id is null then raise exception 'Arena workspace not found'; end if;

  select synced.organization_id into v_organization_id
  from public.sc_arena_sync_membership(
    p_user_id,
    'claw_member',
    p_organization_source,
    left(trim(p_organization_key), 160),
    left(coalesce(nullif(trim(p_organization_name), ''), trim(p_organization_key)), 240),
    'startup',
    p_workspace_slug
  ) synced;
  if v_organization_id is null then raise exception 'respondent organization could not be resolved'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_slug || ':' || p_user_id::text, 0));

  select coalesce(max(s.response_version), 0) + 1 into v_response_version
  from public.sc_arena_benefit_need_surveys s
  where s.workspace_id = v_workspace_id and s.respondent_user_id = p_user_id;

  update public.sc_arena_benefit_need_surveys
  set is_current = false,
      updated_at = now()
  where workspace_id = v_workspace_id
    and respondent_user_id = p_user_id
    and is_current;

  insert into public.sc_arena_benefit_need_surveys (
    workspace_id,
    organization_id,
    respondent_user_id,
    response_version,
    is_current,
    categories,
    details,
    needed_by,
    status
  ) values (
    v_workspace_id,
    v_organization_id,
    p_user_id,
    v_response_version,
    true,
    array(select distinct category from unnest(p_categories) category),
    trim(p_details),
    p_needed_by,
    'submitted'
  )
  returning * into v_response;

  return jsonb_build_object(
    'id', v_response.id,
    'response_version', v_response.response_version,
    'categories', v_response.categories,
    'details', v_response.details,
    'needed_by', v_response.needed_by,
    'status', v_response.status,
    'submitted_at', v_response.submitted_at
  );
end;
$$;

create or replace function public.sc_arena_latest_benefit_need_survey(
  p_workspace_slug text,
  p_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'response_version', s.response_version,
    'categories', s.categories,
    'details', s.details,
    'needed_by', s.needed_by,
    'status', s.status,
    'submitted_at', s.submitted_at
  )
  from public.sc_arena_benefit_need_surveys s
  join public.sc_arena_workspaces w on w.id = s.workspace_id
  where w.slug = p_workspace_slug
    and w.status = 'active'
    and s.respondent_user_id = p_user_id
    and s.is_current
  limit 1;
$$;

revoke all on function public.sc_arena_submit_benefit_need_survey(text, uuid, text, text, text, text[], text, text)
from public, anon, authenticated;
revoke all on function public.sc_arena_latest_benefit_need_survey(text, uuid)
from public, anon, authenticated;

grant execute on function public.sc_arena_submit_benefit_need_survey(text, uuid, text, text, text, text[], text, text)
to service_role;
grant execute on function public.sc_arena_latest_benefit_need_survey(text, uuid)
to service_role;

comment on table public.sc_arena_benefit_need_surveys is
  'Private Claw Member benefit-needs survey responses. Revisions are retained; Community posts are not created.';

commit;
