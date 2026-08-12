import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const arena = readFileSync("public/arena/arena.js", "utf8");
const community = readFileSync("public/arena/community.js", "utf8");

function functionSlice(source, start, end) {
  const from = source.indexOf(start);
  return source.slice(from, source.indexOf(end, from));
}

test("login and logout always clear discovery results before another account can see them", () => {
  const login = functionSlice(arena, "async function handleLogin", "async function loadProgramHub");
  const logout = functionSlice(arena, "async function handleLogout", "function showApp");
  const reset = functionSlice(community, "function resetAgenticDiscovery", "function renderAgenticResults");

  assert.match(login, /spark-arena:discovery-reset/);
  assert.match(logout, /spark-arena:discovery-reset/);
  assert.match(community, /window\.addEventListener\("spark-arena:discovery-reset", resetAgenticDiscovery\)/);
  assert.match(reset, /discoveryRequestId \+= 1/);
  assert.match(reset, /setDiscoveryPending\(false\)/);
  assert.match(reset, /setProcessStatus\(els\.discoveryStatus\)/);
  assert.match(reset, /els\.discoveryResults\.hidden = true/);
  assert.match(reset, /els\.discoveryResults\.replaceChildren\(\)/);
});

test("a stale discovery response cannot repopulate results after session reset", () => {
  const discovery = functionSlice(community, "async function runAgenticDiscovery", "function resetAgenticDiscovery");

  assert.match(discovery, /const requestId = \+\+discoveryRequestId/);
  assert.match(discovery, /if \(requestId !== discoveryRequestId\) return;\s*renderAgenticResults/);
  assert.match(discovery, /catch \(error\) \{\s*if \(requestId !== discoveryRequestId\) return/);
  assert.match(discovery, /finally \{\s*if \(requestId === discoveryRequestId\) setDiscoveryPending\(false\)/);
});
