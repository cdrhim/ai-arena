import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  "supabase/migrations/20260812093000_sc_arena_organization_assets.sql",
  "utf8"
);
const syncScript = await readFile("scripts/sync-company-logo-assets.mjs", "utf8");

test("organization logos use an sc_arena table related to the workspace organization", () => {
  assert.match(migration, /create table if not exists public\.sc_arena_organization_assets/);
  assert.match(migration, /references public\.sc_arena_organizations\(workspace_id, id\)/);
  assert.match(migration, /unique \(workspace_id, organization_id, asset_kind\)/);
  assert.match(migration, /unique \(storage_bucket, storage_path\)/);
});

test("organization asset metadata is protected and image bytes use a bounded public Storage bucket", () => {
  assert.match(migration, /'sc-arena-company-assets',[\s\S]*?true,[\s\S]*?1048576/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /membership\.status = 'active'/);
  assert.match(migration, /revoke all on table public\.sc_arena_organization_assets[\s\S]*?service_role/);
  assert.match(migration, /grant select on table public\.sc_arena_organization_assets to authenticated/);
});

test("logo synchronization uploads local bytes and records traceable metadata through one RPC", () => {
  assert.match(syncScript, /storage\/v1\/object\/\$\{BUCKET\}/);
  assert.match(syncScript, /rpc\/sc_arena_upsert_organization_asset/);
  assert.match(syncScript, /createHash\("sha256"\)/);
  assert.match(syncScript, /p_organization_source: "program_team"/);
  assert.match(syncScript, /p_source_url:/);
  assert.match(syncScript, /p_verified_at:/);
});
