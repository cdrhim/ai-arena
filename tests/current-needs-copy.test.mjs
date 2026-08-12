import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("ongoing member needs use current language instead of a weekly cadence", () => {
  const arena = readFileSync("public/arena/arena.js", "utf8");
  const community = readFileSync("public/arena/community.js", "utf8");
  const market = readFileSync("public/arena/market.js", "utf8");
  const html = readFileSync("public/arena/index.html", "utf8");

  assert.match(arena, /현재 필요한 고객, 파트너와 동료의 도움/);
  assert.match(arena, /현재 어떤 도움이 필요하신가요\?/);
  assert.doesNotMatch(arena, /이번 주 필요한 고객|이번 주 어떤 도움이 필요하신가요/);
  assert.doesNotMatch(community, /이번 주에 온보딩 에이전트/);
  assert.doesNotMatch(html, /이번 주에 출시한 제품을 보여주고/);
  assert.doesNotMatch(market, /\["이번 주 안내"/);
});
