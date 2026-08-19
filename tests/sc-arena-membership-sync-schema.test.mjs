import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260818160000_sc_arena_membership_sync_ambiguity.sql",
  import.meta.url
);

test("membership sync resolves OUT-parameter and physical column names deterministically", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create or replace function public\.sc_arena_sync_membership/i);
  assert.match(sql, /#variable_conflict use_column/i);
  assert.match(sql, /on conflict \(workspace_id, external_source, external_key\)/i);
  assert.match(sql, /on conflict \(workspace_id, user_id\)/i);
  assert.match(sql, /and m\.status = 'revoked'/i);
});
