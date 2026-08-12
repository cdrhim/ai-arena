-- SparkClaw AI Arena organization assets
-- Stores traceable logo metadata in Postgres and the image objects in Supabase Storage.

begin;

create table if not exists public.sc_arena_organization_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  organization_id uuid not null,
  asset_kind text not null default 'logo' check (asset_kind in ('logo')),
  storage_bucket text not null check (storage_bucket ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  storage_path text not null check (
    char_length(storage_path) between 1 and 500
    and storage_path !~ '(^|/)\.\.(/|$)'
    and storage_path !~ '^/'
  ),
  source_url text not null default '' check (char_length(source_url) <= 2000),
  source_host text not null default '' check (char_length(source_host) <= 255),
  content_type text not null check (
    content_type in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')
  ),
  byte_size bigint not null check (byte_size between 1 and 1048576),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  tone text not null default 'light' check (tone in ('light', 'dark')),
  verification_status text not null default 'verified'
    check (verification_status in ('verified', 'curated', 'pending', 'rejected')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, organization_id, asset_kind),
  unique (storage_bucket, storage_path),
  foreign key (workspace_id, organization_id)
    references public.sc_arena_organizations(workspace_id, id)
    on delete cascade
);

create index if not exists sc_arena_organization_assets_org_idx
  on public.sc_arena_organization_assets (workspace_id, organization_id, asset_kind);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'sc-arena-company-assets',
  'sc-arena-company-assets',
  true,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.sc_arena_organization_assets enable row level security;
alter table public.sc_arena_organization_assets force row level security;

drop policy if exists sc_arena_organization_assets_select
  on public.sc_arena_organization_assets;
create policy sc_arena_organization_assets_select
  on public.sc_arena_organization_assets
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.sc_arena_memberships membership
      where membership.workspace_id = sc_arena_organization_assets.workspace_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    )
  );

revoke all on table public.sc_arena_organization_assets
  from public, anon, authenticated, service_role;
grant select on table public.sc_arena_organization_assets to authenticated;

create or replace function public.sc_arena_upsert_organization_asset(
  p_workspace_slug text,
  p_organization_source text,
  p_organization_key text,
  p_organization_name text,
  p_organization_type text,
  p_asset_kind text,
  p_storage_bucket text,
  p_storage_path text,
  p_source_url text,
  p_source_host text,
  p_content_type text,
  p_byte_size bigint,
  p_sha256 text,
  p_tone text,
  p_verification_status text,
  p_verified_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_organization_id uuid;
  v_asset_id uuid;
begin
  if p_organization_source <> 'program_team'
     or p_asset_kind <> 'logo'
     or p_storage_bucket <> 'sc-arena-company-assets'
     or p_organization_type <> 'startup'
     or p_organization_key is null
     or char_length(p_organization_key) not between 1 and 160
     or p_organization_name is null
     or char_length(p_organization_name) not between 1 and 240
     or p_storage_path is null
     or char_length(p_storage_path) not between 1 and 500
     or p_storage_path ~ '(^|/)\.\.(/|$)'
     or p_storage_path ~ '^/'
     or p_content_type not in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')
     or p_byte_size not between 1 and 1048576
     or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_tone not in ('light', 'dark')
     or p_verification_status not in ('verified', 'curated', 'pending', 'rejected') then
    raise exception 'Invalid organization asset payload' using errcode = '22023';
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
    workspace_id,
    external_source,
    external_key,
    name,
    organization_type,
    status
  )
  values (
    v_workspace_id,
    p_organization_source,
    p_organization_key,
    p_organization_name,
    p_organization_type,
    'active'
  )
  on conflict (workspace_id, external_source, external_key) do update
  set
    name = excluded.name,
    status = 'active',
    updated_at = now()
  returning id into v_organization_id;

  insert into public.sc_arena_organization_assets (
    workspace_id,
    organization_id,
    asset_kind,
    storage_bucket,
    storage_path,
    source_url,
    source_host,
    content_type,
    byte_size,
    sha256,
    tone,
    verification_status,
    verified_at
  )
  values (
    v_workspace_id,
    v_organization_id,
    p_asset_kind,
    p_storage_bucket,
    p_storage_path,
    coalesce(left(p_source_url, 2000), ''),
    coalesce(left(p_source_host, 255), ''),
    p_content_type,
    p_byte_size,
    p_sha256,
    p_tone,
    p_verification_status,
    p_verified_at
  )
  on conflict (workspace_id, organization_id, asset_kind) do update
  set
    storage_bucket = excluded.storage_bucket,
    storage_path = excluded.storage_path,
    source_url = excluded.source_url,
    source_host = excluded.source_host,
    content_type = excluded.content_type,
    byte_size = excluded.byte_size,
    sha256 = excluded.sha256,
    tone = excluded.tone,
    verification_status = excluded.verification_status,
    verified_at = excluded.verified_at,
    updated_at = now()
  returning id into v_asset_id;

  return v_asset_id;
end;
$$;

revoke all on function public.sc_arena_upsert_organization_asset(
  text, text, text, text, text, text, text, text,
  text, text, text, bigint, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.sc_arena_upsert_organization_asset(
  text, text, text, text, text, text, text, text,
  text, text, text, bigint, text, text, text, timestamptz
) to service_role;

comment on table public.sc_arena_organization_assets is
  'Traceable organization logo metadata. Image bytes live in the sc-arena-company-assets Storage bucket.';
comment on column public.sc_arena_organization_assets.source_url is
  'Official source URL or a short curated-local provenance label; never a credential-bearing URL.';

commit;
