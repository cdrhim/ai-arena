import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const arenaSource = await readFile(new URL("public/arena/arena.js", root), "utf8");
const marketSource = await readFile(new URL("public/arena/market.js", root), "utf8");
const communitySource = await readFile(new URL("public/arena/community.js", root), "utf8");
const htmlSource = await readFile(new URL("public/arena/index.html", root), "utf8");

test("browser history is connected to internal Arena page navigation", () => {
  assert.match(arenaSource, /advisors: "global-advisors"/);
  assert.match(arenaSource, /window\.addEventListener\("popstate", handleArenaPopState\)/);
  assert.match(arenaSource, /window\.history\.pushState\(nextState/);
  assert.match(arenaSource, /window\.history\.replaceState\(nextState/);
  assert.match(arenaSource, /historyMode = "push", restoreScrollY = null/);
  assert.match(arenaSource, /window\.history\.scrollRestoration = "manual"/);
});

test("history entries are scoped to the signed-in viewer and preserve scroll position", () => {
  assert.match(arenaSource, /function arenaViewerKey\(\)/);
  assert.match(arenaSource, /state\.viewerKey === arenaViewerKey\(\)/);
  assert.match(arenaSource, /scrollY: Math\.max\(0, Math\.round/);
  assert.match(arenaSource, /restoreScrollY: state\.scrollY/);
  assert.doesNotMatch(arenaSource, /arenaPageUrl[\s\S]{0,500}(email|ownerEmail)/i);
});

test("company detail dialogs form their own back-button history entry", () => {
  assert.match(arenaSource, /spark-arena:team-dialog-opened/);
  assert.match(arenaSource, /kind: "team-dialog"/);
  assert.match(arenaSource, /if \(historyMode === "back" && isCurrentTeamDialogHistory\(\)\)/);
  assert.match(arenaSource, /window\.history\.back\(\)/);
  assert.match(marketSource, /spark-arena:restore-team-dialog/);
  assert.match(marketSource, /openMarketTeam\(startup, \{ recordHistory: false \}\)/);
});

test("community threads and collaboration reviews also return through browser history", () => {
  assert.match(arenaSource, /spark-arena:history-overlay-opened/);
  assert.match(arenaSource, /spark-arena:history-overlay-close-request/);
  assert.match(arenaSource, /overlayType: String\(event\.detail\.type\)/);
  assert.match(arenaSource, /restoreArenaOverlayFromHistory/);
  assert.match(communitySource, /pendingHistoryThreadId = threadId/);
  assert.match(communitySource, /openThreadDialog\(threadId, \{ recordHistory: false \}\)/);
  assert.match(communitySource, /spark-arena:history-overlay-close-request/);
});

test("deployed browser assets keep the shared current cache version", () => {
  const assetReferences = htmlSource.match(/\/arena\/(?:arena-activity-client|arena|market|community)\.js\?v=ai-arena-20260817-partner-events-perks-v112/g) || [];
  assert.equal(assetReferences.length, 4);
});
