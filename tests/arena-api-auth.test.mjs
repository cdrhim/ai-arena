import assert from "node:assert/strict";
import test from "node:test";

import arena from "../netlify/functions/arena.mjs";

test("arena API masks all data before login", async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousAnon = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";

  try {
    const response = await arena(new Request("https://example.test/api/arena"));
    const payload = await response.json();
    assert.equal(response.status, 401);
    assert.equal(payload.error, "Login required.");
    assert.equal(Object.hasOwn(payload, "competition"), false);
    assert.equal(Object.hasOwn(payload, "startups"), false);
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousAnon === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = previousAnon;
  }
});
