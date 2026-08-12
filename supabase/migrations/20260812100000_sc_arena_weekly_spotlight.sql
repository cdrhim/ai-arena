-- Weekly Highlighted Companies snapshots for SparkClaw AI Arena.
-- Source: completed Program DB weekly updates. Public copy intentionally excludes raw traction details.

begin;

create table if not exists public.sc_arena_featured_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.sc_arena_workspaces(id) on delete restrict,
  cycle_key text not null check (cycle_key ~ '^program-(week-[0-9]+|date-[0-9]{4}-[0-9]{2}-[0-9]{2})$'),
  week_label text not null check (char_length(week_label) between 1 and 80),
  status text not null default 'published' check (status in ('published', 'archived')),
  source_updated_at timestamptz not null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, cycle_key),
  unique (workspace_id, id)
);

create table if not exists public.sc_arena_featured_snapshot_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  snapshot_id uuid not null,
  organization_id uuid not null,
  rank smallint not null check (rank between 1 and 4),
  achievement text not null check (char_length(achievement) between 1 and 320),
  hook text not null check (char_length(hook) between 1 and 180),
  keywords jsonb not null default '[]'::jsonb
    check (jsonb_typeof(keywords) = 'array')
    check (jsonb_array_length(keywords) between 1 and 3)
    check (octet_length(keywords::text) <= 1024),
  score smallint not null check (score between 0 and 100),
  signal_count smallint not null default 0 check (signal_count between 0 and 8),
  signals jsonb not null default '{}'::jsonb
    check (jsonb_typeof(signals) = 'object')
    check (octet_length(signals::text) <= 2048),
  created_at timestamptz not null default now(),
  unique (snapshot_id, rank),
  unique (snapshot_id, organization_id),
  foreign key (workspace_id, snapshot_id)
    references public.sc_arena_featured_snapshots(workspace_id, id) on delete cascade,
  foreign key (workspace_id, organization_id)
    references public.sc_arena_organizations(workspace_id, id) on delete restrict
);

create index if not exists sc_arena_featured_snapshots_current_idx
  on public.sc_arena_featured_snapshots (workspace_id, status, published_at desc);

alter table public.sc_arena_featured_snapshots enable row level security;
alter table public.sc_arena_featured_snapshots force row level security;
alter table public.sc_arena_featured_snapshot_items enable row level security;
alter table public.sc_arena_featured_snapshot_items force row level security;

revoke all on public.sc_arena_featured_snapshots from public, anon, authenticated, service_role;
revoke all on public.sc_arena_featured_snapshot_items from public, anon, authenticated, service_role;

create or replace function public.sc_arena_publish_weekly_spotlight(
  p_workspace_slug text,
  p_cycle_key text,
  p_week_label text,
  p_source_updated_at timestamptz,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_workspace_id uuid;
  v_snapshot_id uuid;
  v_item jsonb;
  v_organization_id uuid;
  v_rank integer;
  v_source_key text;
  v_company_name text;
  v_keywords jsonb;
begin
  if p_cycle_key !~ '^program-(week-[0-9]+|date-[0-9]{4}-[0-9]{2}-[0-9]{2})$' then
    raise exception 'Invalid weekly spotlight cycle key';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 4 then
    raise exception 'Weekly spotlight requires one to four items';
  end if;

  select id into v_workspace_id
  from public.sc_arena_workspaces
  where slug = p_workspace_slug and status = 'active';
  if v_workspace_id is null then raise exception 'Arena workspace not found'; end if;

  perform pg_advisory_xact_lock(hashtext('sc_arena_weekly_spotlight:' || v_workspace_id::text));

  update public.sc_arena_featured_snapshots
  set status = 'archived', updated_at = now()
  where workspace_id = v_workspace_id and status = 'published' and cycle_key <> p_cycle_key;

  insert into public.sc_arena_featured_snapshots (
    workspace_id, cycle_key, week_label, status, source_updated_at, published_at, updated_at
  ) values (
    v_workspace_id, p_cycle_key, left(trim(p_week_label), 80), 'published', p_source_updated_at, now(), now()
  )
  on conflict (workspace_id, cycle_key) do update set
    week_label = excluded.week_label,
    status = 'published',
    source_updated_at = excluded.source_updated_at,
    published_at = now(),
    updated_at = now()
  returning id into v_snapshot_id;

  delete from public.sc_arena_featured_snapshot_items where snapshot_id = v_snapshot_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_rank := (v_item->>'rank')::integer;
    v_source_key := left(trim(v_item->>'teamId'), 160);
    v_company_name := left(trim(v_item->>'companyName'), 240);
    v_keywords := v_item->'keywords';
    if v_rank not between 1 and 4 or coalesce(v_source_key, '') = '' or coalesce(v_company_name, '') = '' then
      raise exception 'Invalid weekly spotlight item identity';
    end if;
    if jsonb_typeof(v_keywords) <> 'array' or jsonb_array_length(v_keywords) not between 1 and 3 then
      raise exception 'Invalid weekly spotlight keywords';
    end if;

    insert into public.sc_arena_organizations (
      workspace_id, external_source, external_key, name, organization_type, status, updated_at
    ) values (
      v_workspace_id, 'program_team', v_source_key, v_company_name, 'startup', 'active', now()
    )
    on conflict (workspace_id, external_source, external_key) do update set
      name = excluded.name,
      organization_type = 'startup',
      status = 'active',
      updated_at = now()
    returning id into v_organization_id;

    insert into public.sc_arena_featured_snapshot_items (
      workspace_id, snapshot_id, organization_id, rank, achievement, hook, keywords,
      score, signal_count, signals
    ) values (
      v_workspace_id,
      v_snapshot_id,
      v_organization_id,
      v_rank,
      left(trim(v_item->>'achievement'), 320),
      left(trim(v_item->>'hook'), 180),
      v_keywords,
      greatest(0, least(100, coalesce((v_item->>'score')::integer, 0))),
      greatest(0, least(8, coalesce((v_item->>'signalCount')::integer, 0))),
      coalesce(v_item->'signals', '{}'::jsonb)
    );
  end loop;

  return v_snapshot_id;
end;
$$;

create or replace function public.sc_arena_current_weekly_spotlight(
  p_workspace_slug text
) returns table (
  snapshot_id uuid,
  cycle_key text,
  week_label text,
  source_updated_at timestamptz,
  published_at timestamptz,
  rank smallint,
  organization_key text,
  company_name text,
  achievement text,
  hook text,
  keywords jsonb
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    s.id,
    s.cycle_key,
    s.week_label,
    s.source_updated_at,
    s.published_at,
    i.rank,
    o.external_key,
    o.name,
    i.achievement,
    i.hook,
    i.keywords
  from public.sc_arena_workspaces w
  join public.sc_arena_featured_snapshots s
    on s.workspace_id = w.id and s.status = 'published'
  join public.sc_arena_featured_snapshot_items i
    on i.workspace_id = s.workspace_id and i.snapshot_id = s.id
  join public.sc_arena_organizations o
    on o.workspace_id = i.workspace_id and o.id = i.organization_id
  where w.slug = p_workspace_slug and w.status = 'active'
  order by s.published_at desc, i.rank asc
  limit 4;
$$;

revoke all on function public.sc_arena_publish_weekly_spotlight(text, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.sc_arena_current_weekly_spotlight(text) from public, anon, authenticated;
grant execute on function public.sc_arena_publish_weekly_spotlight(text, text, text, timestamptz, jsonb) to service_role;
grant execute on function public.sc_arena_current_weekly_spotlight(text) to service_role;

comment on table public.sc_arena_featured_snapshots is 'Weekly Monday snapshots of the SparkClaw Highlighted Companies selection.';
comment on table public.sc_arena_featured_snapshot_items is 'Ranked weekly spotlight items; raw traction values remain server-only in signals.';

commit;
