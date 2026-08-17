-- SparkClaw AI Arena: add the member's reason to the simplified benefit request.

begin;

alter table public.sc_arena_benefit_need_surveys
  add column if not exists solution_name text,
  add column if not exists solution_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sc_arena_benefit_need_surveys_solution_reason_length'
      and conrelid = 'public.sc_arena_benefit_need_surveys'::regclass
  ) then
    alter table public.sc_arena_benefit_need_surveys
      add constraint sc_arena_benefit_need_surveys_solution_reason_length
      check (solution_reason is null or char_length(solution_reason) between 10 and 500);
  end if;
end;
$$;

create or replace function public.sc_arena_submit_benefit_solution_request(
  p_workspace_slug text,
  p_user_id uuid,
  p_organization_source text,
  p_organization_key text,
  p_organization_name text,
  p_solution_name text,
  p_solution_details text,
  p_solution_reason text
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
  if char_length(trim(coalesce(p_solution_name, ''))) not between 2 and 100 then
    raise exception 'solution name must be between 2 and 100 characters';
  end if;
  if char_length(trim(coalesce(p_solution_details, ''))) not between 10 and 500 then
    raise exception 'solution details must be between 10 and 500 characters';
  end if;
  if char_length(trim(coalesce(p_solution_reason, ''))) not between 10 and 500 then
    raise exception 'solution reason must be between 10 and 500 characters';
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
    solution_name,
    details,
    solution_reason,
    needed_by,
    status
  ) values (
    v_workspace_id,
    v_organization_id,
    p_user_id,
    v_response_version,
    true,
    array['other']::text[],
    trim(p_solution_name),
    trim(p_solution_details),
    trim(p_solution_reason),
    'exploring',
    'submitted'
  )
  returning * into v_response;

  return jsonb_build_object(
    'id', v_response.id,
    'response_version', v_response.response_version,
    'solution_name', v_response.solution_name,
    'solution_details', v_response.details,
    'solution_reason', v_response.solution_reason,
    'status', v_response.status,
    'submitted_at', v_response.submitted_at
  );
end;
$$;

create or replace function public.sc_arena_latest_benefit_solution_request(
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
    'solution_name', s.solution_name,
    'solution_details', s.details,
    'solution_reason', s.solution_reason,
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

revoke all on function public.sc_arena_submit_benefit_solution_request(text, uuid, text, text, text, text, text, text)
from public, anon, authenticated;
revoke all on function public.sc_arena_latest_benefit_solution_request(text, uuid)
from public, anon, authenticated;

grant execute on function public.sc_arena_submit_benefit_solution_request(text, uuid, text, text, text, text, text, text)
to service_role;
grant execute on function public.sc_arena_latest_benefit_solution_request(text, uuid)
to service_role;

comment on column public.sc_arena_benefit_need_surveys.solution_reason is
  'Member-provided reason and expected value for the requested benefit solution.';

commit;
