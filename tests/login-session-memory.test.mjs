import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(new URL("../public/arena/arena.js", import.meta.url), "utf8");

test("a previously saved Arena login is restored before showing the login gate", () => {
  const initialize = client.slice(client.indexOf("async function initialize"), client.indexOf("async function loadAuthConfig"));
  assert.match(initialize, /const restoredSession = await restoreStoredSession\(\)/);
  assert.match(initialize, /if \(restoredSession && authConfig\?\.authConfigured\)/);
  assert.match(initialize, /loadProgramHub\(\{ allowRefresh: true, quiet: true, bootstrap: true \}\)/);
});

test("stored sessions refresh near expiry and survive temporary workspace errors", () => {
  const restore = client.slice(client.indexOf("async function restoreStoredSession"), client.indexOf("function saveStoredSession"));
  const initialize = client.slice(client.indexOf("async function initialize"), client.indexOf("async function loadAuthConfig"));
  assert.match(restore, /authSession = readStoredSession\(\)/);
  assert.match(restore, /expiresAt <= Math\.floor\(Date\.now\(\) \/ 1000\) \+ 60/);
  assert.match(restore, /await refreshSession\(\)/);
  assert.match(initialize, /catch \(error\) \{\s*authConfigError = authSession\?\.access_token/);
});

test("explicit logout remains the only user action that deliberately forgets the session", () => {
  const logout = client.slice(client.indexOf("async function handleLogout"), client.indexOf("function showApp"));
  assert.match(logout, /clearStoredSession\(\)/);
  assert.match(client, /localStorage\.setItem\(SESSION_KEY, JSON\.stringify\(session\)\)/);
  assert.doesNotMatch(client, /localStorage\.setItem\([^\n]*(password|credential)/i);
});
