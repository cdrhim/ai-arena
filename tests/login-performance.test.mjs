import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("login opens from a minimal bootstrap and hydrates secondary data in parallel", () => {
  const client = readFileSync("public/arena/arena.js", "utf8");
  const market = readFileSync("public/arena/market.js", "utf8");
  const marketRenderAll = market.slice(market.indexOf("function renderAll()"), market.indexOf("function renderMarketPage"));
  const api = readFileSync("netlify/functions/program-hub.mjs", "utf8");
  const program = readFileSync("netlify/lib/program-hub.mjs", "utf8");

  assert.match(client, /loadProgramHub\(\{ allowRefresh: false, bootstrap: true \}\)/);
  assert.match(client, /loadProgramHub\(\{ allowRefresh: true, quiet: true, bootstrap: true \}\)/);
  assert.match(client, /bootstrap \? "\/api\/program-hub\?bootstrap=1" : "\/api\/program-hub"/);
  assert.match(client, /void hydrateProgramHubInBackground\(loadGeneration\)/);
  assert.match(client, /Promise\.all\(\[hubResponsePromise, arenaPromise\]\)/);
  assert.doesNotMatch(client, /await mergeAuthenticatedSafeSnapshot\(\)/);
  assert.match(client, /function renderHubPage\(pageName\)[\s\S]*?hubPageRenderRevisions\.get\(pageName\) === hubRenderRevision/);
  assert.match(client, /function showPage\(pageName,[\s\S]*?renderHubPage\(pageName\)/);
  assert.match(market, /function renderAll\(\)[\s\S]*?renderMarketPage\(activePage\)/);
  assert.match(market, /function renderMarketPage\(pageName\)[\s\S]*?pageName === "discover"[\s\S]*?pageName === "workspace"/);
  assert.doesNotMatch(marketRenderAll, /renderDiscover\(\)|renderPassports\(\)|renderCompare\(\)|renderPartnerships\(\)|renderWorkspace\(\)/);
  assert.match(client, /const renderTeamsAfterInput = debounceMainThreadRender\(renderTeams\)/);
  assert.match(market, /const renderDiscoverAfterInput = debounceMainThreadRender\(renderDiscover\)/);
  assert.match(client, /function debounceMainThreadRender\(callback, delay = 120\)/);

  assert.match(api, /loadProgramHubBootstrap/);
  assert.match(api, /searchParams\.get\("bootstrap"\) === "1"/);
  assert.match(api, /loadProgramActionEvents\(\)/);
  assert.match(api, /if \(bootstrap\) return json\(\{ \.\.\.current, bootstrap: true \}\)/);
  assert.match(program, /readFixedTable\(config, "teams", PROGRAM_TABLES\.teams, fetchImpl\)/);
  assert.match(program, /export async function loadProgramHubBootstrap/);
});
