import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const arenaSource = fs.readFileSync(new URL("../public/arena/arena.js", import.meta.url), "utf8");

test("Claw Member Company Directory pins the signed-in team before the selected sort", () => {
  assert.match(arenaSource, /\.sort\(\(left, right\) => directoryTeamSortValue\(left, right, sort\)\)/);
  assert.match(arenaSource, /function directoryTeamSortValue\(left, right, sort\) \{/);
  assert.match(arenaSource, /if \(isClawMemberViewer\(\)\) \{/);
  assert.match(arenaSource, /const leftIsViewerTeam = isViewerDirectoryTeam\(left\);/);
  assert.match(arenaSource, /const rightIsViewerTeam = isViewerDirectoryTeam\(right\);/);
  assert.match(arenaSource, /return leftIsViewerTeam \? -1 : 1;/);
  assert.match(arenaSource, /return teamSortValue\(left, right, sort\);/);
});

test("viewer-team detection survives hydrated directory merges and account switches", () => {
  assert.match(arenaSource, /function isViewerDirectoryTeam\(team\) \{/);
  assert.match(arenaSource, /const viewerTeamId = String\(hub\?\.viewerTeam\?\.id \|\| ""\);/);
  assert.match(arenaSource, /team\?\.isViewerTeam/);
  assert.match(arenaSource, /String\(team\?\.id \|\| ""\) === viewerTeamId/);
});
