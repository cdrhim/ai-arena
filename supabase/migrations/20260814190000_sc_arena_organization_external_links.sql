-- SparkClaw AI Arena official organization channels and product-store links.

begin;

create table if not exists public.sc_arena_organization_external_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  organization_id uuid not null,
  link_kind text not null check (
    link_kind in (
      'google_play', 'apple_app_store', 'instagram', 'linkedin', 'youtube',
      'x', 'facebook', 'threads', 'tiktok', 'naver_blog', 'kakao_channel'
    )
  ),
  label text not null check (char_length(label) between 1 and 80),
  url text not null check (char_length(url) between 8 and 2000 and url ~ '^https://'),
  source_url text not null check (char_length(source_url) between 8 and 2000 and source_url ~ '^https://'),
  source_host text not null default '' check (char_length(source_host) <= 255),
  verification_status text not null default 'verified'
    check (verification_status in ('verified', 'curated', 'pending', 'rejected')),
  verified_at timestamptz,
  display_order smallint not null default 0 check (display_order between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, organization_id, link_kind, url),
  foreign key (workspace_id, organization_id)
    references public.sc_arena_organizations(workspace_id, id)
    on delete cascade
);

create index if not exists sc_arena_organization_external_links_org_idx
  on public.sc_arena_organization_external_links (
    workspace_id, organization_id, display_order, link_kind
  );

alter table public.sc_arena_organization_external_links enable row level security;
alter table public.sc_arena_organization_external_links force row level security;

drop policy if exists sc_arena_organization_external_links_select
  on public.sc_arena_organization_external_links;
create policy sc_arena_organization_external_links_select
  on public.sc_arena_organization_external_links
  for select
  to authenticated
  using (
    verification_status in ('verified', 'curated')
    and exists (
      select 1
      from public.sc_arena_memberships membership
      where membership.workspace_id = sc_arena_organization_external_links.workspace_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    )
  );

revoke all on table public.sc_arena_organization_external_links
  from public, anon, authenticated, service_role;
grant select on table public.sc_arena_organization_external_links to authenticated;

create or replace function public.sc_arena_replace_organization_external_links(
  p_workspace_slug text,
  p_organization_source text,
  p_organization_key text,
  p_organization_name text,
  p_organization_type text,
  p_links jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_organization_id uuid;
  v_link jsonb;
  v_count integer := 0;
  v_allowed_kind constant text[] := array[
    'google_play', 'apple_app_store', 'instagram', 'linkedin', 'youtube',
    'x', 'facebook', 'threads', 'tiktok', 'naver_blog', 'kakao_channel'
  ];
begin
  if p_organization_source <> 'program_team'
     or p_organization_type <> 'startup'
     or p_organization_key is null
     or char_length(p_organization_key) not between 1 and 160
     or p_organization_name is null
     or char_length(p_organization_name) not between 1 and 240
     or jsonb_typeof(coalesce(p_links, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_links, '[]'::jsonb)) > 25 then
    raise exception 'Invalid organization external-link payload' using errcode = '22023';
  end if;

  select workspace.id
  into v_workspace_id
  from public.sc_arena_workspaces workspace
  where workspace.slug = p_workspace_slug
    and workspace.status = 'active';

  if v_workspace_id is null then
    raise exception 'Unknown active workspace' using errcode = '22023';
  end if;

  insert into public.sc_arena_organizations (
    workspace_id, external_source, external_key, name, organization_type, status
  )
  values (
    v_workspace_id, p_organization_source, p_organization_key,
    p_organization_name, p_organization_type, 'active'
  )
  on conflict (workspace_id, external_source, external_key) do update
  set name = excluded.name, status = 'active', updated_at = now()
  returning id into v_organization_id;

  delete from public.sc_arena_organization_external_links link
  where link.workspace_id = v_workspace_id
    and link.organization_id = v_organization_id;

  for v_link in select value from jsonb_array_elements(coalesce(p_links, '[]'::jsonb))
  loop
    if not ((v_link ->> 'kind') = any(v_allowed_kind))
       or char_length(coalesce(v_link ->> 'label', '')) not between 1 and 80
       or char_length(coalesce(v_link ->> 'url', '')) not between 8 and 2000
       or (v_link ->> 'url') !~ '^https://'
       or char_length(coalesce(v_link ->> 'source_url', '')) not between 8 and 2000
       or (v_link ->> 'source_url') !~ '^https://'
       or coalesce(v_link ->> 'verification_status', 'verified')
          not in ('verified', 'curated', 'pending', 'rejected')
       or coalesce((v_link ->> 'display_order')::integer, 0) not between 0 and 100 then
      raise exception 'Invalid organization external link' using errcode = '22023';
    end if;

    insert into public.sc_arena_organization_external_links (
      workspace_id, organization_id, link_kind, label, url, source_url,
      source_host, verification_status, verified_at, display_order
    )
    values (
      v_workspace_id,
      v_organization_id,
      v_link ->> 'kind',
      v_link ->> 'label',
      v_link ->> 'url',
      v_link ->> 'source_url',
      left(coalesce(v_link ->> 'source_host', ''), 255),
      coalesce(v_link ->> 'verification_status', 'verified'),
      nullif(v_link ->> 'verified_at', '')::timestamptz,
      coalesce((v_link ->> 'display_order')::integer, 0)
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.sc_arena_replace_organization_external_links(
  text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.sc_arena_replace_organization_external_links(
  text, text, text, text, text, jsonb
) to service_role;

comment on table public.sc_arena_organization_external_links is
  'Verified official social channels and product-store links for SparkClaw AI Arena organization cards.';

commit;
