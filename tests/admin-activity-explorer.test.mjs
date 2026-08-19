import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("My Log ends with a staff-only cross-user Activity Explorer", async () => {
  const html = await readFile(new URL("../public/arena/index.html", import.meta.url), "utf8");
  assert.match(html, /id="adminActivityExplorer"[\s\S]*?data-permission="canViewOperations"[\s\S]*?hidden/);
  assert.match(html, /id="adminActivityUserFilter"/);
  assert.match(html, /id="adminActivityDomainFilter"/);
  assert.match(html, /id="adminActivityActionFilter"/);
  assert.match(html, /id="adminActivityFromFilter"/);
  assert.match(html, /id="adminActivityToFilter"/);
  assert.match(html, /id="adminActivityTableBody"/);
  assert.ok(html.indexOf("id=\"adminActivityExplorer\"") > html.indexOf("id=\"staffMarketQueue\""));
});
test("browser telemetry is server-bound, allowlisted, and loaded before the Arena boot module", async () => {
  const [html, client, config] = await Promise.all([
    readFile(new URL("../public/arena/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/arena/arena-activity-client.js", import.meta.url), "utf8"),
    readFile(new URL("../netlify.toml", import.meta.url), "utf8")
  ]);
  assert.ok(html.indexOf("arena-activity-client.js") < html.indexOf("arena.js?v="));
  assert.match(client, /new Set\(\[[\s\S]*?"overview"[\s\S]*?"workspace"/);
  assert.match(client, /action:\s*"session_started"|recordActivity\("session_started"\)/);
  assert.match(client, /recordActivity\("page_viewed", page\)/);
  assert.doesNotMatch(client, /bodyMarkdown|password|refresh_token/);
  assert.match(config, /from = "\/api\/arena-activity"[\s\S]*?to = "\/\.netlify\/functions\/arena-activity"/);
});

test("admin explorer filters and renders only for staff viewers", async () => {
  const client = await readFile(new URL("../public/arena/market.js", import.meta.url), "utf8");
  assert.match(client, /\["system", "system\.auth_login", "인증 로그인"\]/);
  assert.match(client, /\["system", "system\.auth_logout", "인증 로그아웃"\]/);
  assert.match(client, /function isStaffViewer\(\)[\s\S]*?role === "sparklabs"[\s\S]*?role === "admin"/);
  assert.match(client, /fetch\(`\/api\/arena-activity\?\$\{params\.toString\(\)\}`/);
  assert.match(client, /params\.set\("user", filters\.user\)/);
  assert.match(client, /params\.set\("domain", filters\.domain\)/);
  assert.match(client, /params\.set\("action", filters\.action\)/);
  assert.match(client, /els\.adminActivityExplorer\.hidden = !staff/);
  assert.match(client, /requestId !== adminActivityRequestId/);
  assert.match(client, /\["전체 활동", `\$\{formatNumber\(totalCount\)\}건`/);
  assert.match(client, /참여사 대표 계정/);
  assert.match(client, /expectedRepresentativeCount = 75/);
  assert.doesNotMatch(client, /Supabase에 등록된 Arena 사용자/);
  assert.doesNotMatch(client, /\["조회된 활동", `\$\{formatNumber\(state\.events\.length\)\}건`/);
});
