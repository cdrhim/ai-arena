-- SparkClaw AI Arena: persisted Claw Member similar-team recommendations.
-- Target project guard: gfmummaahlrnmrgnirxu (SparkClaw AI Arena auth/data project).

begin;

create table if not exists public.sc_arena_similarity_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.sc_arena_workspaces(id) on delete restrict,
  subject_organization_id uuid not null,
  subject_user_id uuid references auth.users(id) on delete set null,
  algorithm_version text not null check (algorithm_version ~ '^[a-z][a-z0-9_]{2,79}$'),
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  candidate_population integer not null default 0 check (candidate_population between 0 and 10000),
  is_current boolean not null default true,
  generated_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (workspace_id, subject_organization_id, algorithm_version, source_fingerprint),
  unique (workspace_id, id),
  foreign key (workspace_id, subject_organization_id)
    references public.sc_arena_organizations(workspace_id, id) on delete restrict
);

create table if not exists public.sc_arena_similarity_recommendations (
  workspace_id uuid not null,
  run_id uuid not null,
  candidate_organization_id uuid not null,
  rank smallint not null check (rank between 1 and 12),
  score smallint not null check (score between 0 and 100),
  reason text not null check (char_length(reason) between 1 and 500),
  shared_signals text[] not null default '{}'::text[] check (cardinality(shared_signals) <= 8),
  evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence) = 'array')
    check (jsonb_array_length(evidence) <= 8)
    check (octet_length(evidence::text) <= 4096),
  created_at timestamptz not null default now(),
  primary key (run_id, candidate_organization_id),
  unique (run_id, rank),
  foreign key (workspace_id, run_id)
    references public.sc_arena_similarity_runs(workspace_id, id) on delete cascade,
  foreign key (workspace_id, candidate_organization_id)
    references public.sc_arena_organizations(workspace_id, id) on delete restrict
);

create unique index if not exists sc_arena_similarity_runs_one_current_idx
  on public.sc_arena_similarity_runs (workspace_id, subject_organization_id, algorithm_version)
  where is_current;

create index if not exists sc_arena_similarity_runs_subject_generated_idx
  on public.sc_arena_similarity_runs (subject_organization_id, generated_at desc);

create index if not exists sc_arena_similarity_recommendations_candidate_idx
  on public.sc_arena_similarity_recommendations (candidate_organization_id, created_at desc);

alter table public.sc_arena_similarity_runs enable row level security;
alter table public.sc_arena_similarity_runs force row level security;
alter table public.sc_arena_similarity_recommendations enable row level security;
alter table public.sc_arena_similarity_recommendations force row level security;

revoke all on public.sc_arena_similarity_runs, public.sc_arena_similarity_recommendations
from public, anon, authenticated, service_role;

create or replace function public.sc_arena_publish_similarity_run(
  p_workspace_slug text,
  p_subject_user_id uuid,
  p_subject_team_key text,
  p_subject_team_name text,
  p_algorithm_version text,
  p_source_fingerprint text,
  p_candidate_population integer,
  p_generated_at timestamptz,
  p_recommendations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_subject_organization_id uuid;
  v_candidate_organization_id uuid;
  v_run_id uuid;
  v_item jsonb;
  v_rank integer;
  v_candidate_key text;
  v_candidate_name text;
begin
  if p_subject_user_id is null then raise exception 'subject user is required'; end if;
  if nullif(trim(p_subject_team_key), '') is null then raise exception 'subject team key is required'; end if;
  if nullif(trim(p_algorithm_version), '') is null
     or p_algorithm_version !~ '^[a-z][a-z0-9_]{2,79}$' then
    raise exception 'invalid algorithm version';
  end if;
  if nullif(trim(p_source_fingerprint), '') is null
     or p_source_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid source fingerprint';
  end if;
  if p_recommendations is null or jsonb_typeof(p_recommendations) <> 'array' then
    raise exception 'recommendations must be an array';
  end if;
  if jsonb_array_length(p_recommendations) > 12 then raise exception 'too many recommendations'; end if;

  select w.id into v_workspace_id
  from public.sc_arena_workspaces w
  where w.slug = p_workspace_slug and w.status = 'active';
  if v_workspace_id is null then raise exception 'Arena workspace not found'; end if;

  select synced.organization_id into v_subject_organization_id
  from public.sc_arena_sync_membership(
    p_subject_user_id,
    'claw_member',
    'program_team',
    left(trim(p_subject_team_key), 160),
    left(coalesce(nullif(trim(p_subject_team_name), ''), trim(p_subject_team_key)), 240),
    'startup',
    p_workspace_slug
  ) synced;
  if v_subject_organization_id is null then raise exception 'subject organization could not be resolved'; end if;

  update public.sc_arena_similarity_runs
  set is_current = false
  where workspace_id = v_workspace_id
    and subject_organization_id = v_subject_organization_id
    and algorithm_version = p_algorithm_version
    and is_current;

  insert into public.sc_arena_similarity_runs (
    workspace_id,
    subject_organization_id,
    subject_user_id,
    algorithm_version,
    source_fingerprint,
    candidate_population,
    is_current,
    generated_at
  ) values (
    v_workspace_id,
    v_subject_organization_id,
    p_subject_user_id,
    p_algorithm_version,
    p_source_fingerprint,
    greatest(0, least(10000, coalesce(p_candidate_population, 0))),
    true,
    coalesce(p_generated_at, now())
  )
  on conflict (workspace_id, subject_organization_id, algorithm_version, source_fingerprint)
  do update set
    subject_user_id = excluded.subject_user_id,
    candidate_population = excluded.candidate_population,
    is_current = true,
    generated_at = excluded.generated_at
  returning id into v_run_id;

  delete from public.sc_arena_similarity_recommendations where run_id = v_run_id;

  for v_item in select value from jsonb_array_elements(p_recommendations)
  loop
    v_candidate_key := left(trim(coalesce(v_item ->> 'candidate_team_key', '')), 160);
    v_candidate_name := left(trim(coalesce(v_item ->> 'candidate_team_name', v_candidate_key)), 240);
    v_rank := coalesce((v_item ->> 'rank')::integer, 0);
    if v_candidate_key = '' then raise exception 'candidate team key is required'; end if;
    if v_candidate_key = left(trim(p_subject_team_key), 160) then raise exception 'subject team cannot recommend itself'; end if;
    if v_rank < 1 or v_rank > 12 then raise exception 'invalid recommendation rank'; end if;

    insert into public.sc_arena_organizations (
      workspace_id, external_source, external_key, name, organization_type
    ) values (
      v_workspace_id, 'program_team', v_candidate_key, v_candidate_name, 'startup'
    )
    on conflict (workspace_id, external_source, external_key) do update
    set name = excluded.name,
        organization_type = 'startup',
        status = 'active',
        updated_at = now()
    returning id into v_candidate_organization_id;

    insert into public.sc_arena_similarity_recommendations (
      workspace_id,
      run_id,
      candidate_organization_id,
      rank,
      score,
      reason,
      shared_signals,
      evidence
    ) values (
      v_workspace_id,
      v_run_id,
      v_candidate_organization_id,
      v_rank,
      greatest(0, least(100, coalesce((v_item ->> 'score')::integer, 0))),
      left(coalesce(nullif(trim(v_item ->> 'reason'), ''), '공개 프로필의 산업·역량 구성이 유사한 팀입니다.'), 500),
      array(
        select left(trim(signal), 100)
        from jsonb_array_elements_text(coalesce(v_item -> 'shared_signals', '[]'::jsonb)) signal
        where trim(signal) <> ''
        limit 8
      ),
      coalesce(v_item -> 'evidence', '[]'::jsonb)
    );
  end loop;

  return v_run_id;
end;
$$;

revoke all on function public.sc_arena_publish_similarity_run(text, uuid, text, text, text, text, integer, timestamptz, jsonb)
from public, anon, authenticated;
grant execute on function public.sc_arena_publish_similarity_run(text, uuid, text, text, text, text, integer, timestamptz, jsonb)
to service_role;

comment on table public.sc_arena_similarity_runs is
  'Claw Member profile-similarity calculation runs; one current run per team and algorithm.';
comment on table public.sc_arena_similarity_recommendations is
  'Ranked similar-team results with grounded public-profile evidence.';

commit;
