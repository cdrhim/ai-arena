import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function functionSlice(source, start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}

test("network-bound login, discovery, loading and action flows share visible progress", () => {
  const html = readFileSync("public/arena/index.html", "utf8");
  const css = readFileSync("public/arena/arena.css", "utf8");
  const arena = readFileSync("public/arena/arena.js", "utf8");
  const community = readFileSync("public/arena/community.js", "utf8");
  const market = readFileSync("public/arena/market.js", "utf8");
  const login = functionSlice(arena, "async function handleLogin", "async function loadProgramHub");
  const brief = functionSlice(arena, "async function handlePublicBriefSubmit", "function scrollToTarget");
  const refresh = functionSlice(arena, "async function handleRefresh", "async function handleLogout");
  const discovery = functionSlice(community, "async function runAgenticDiscovery", "function renderAgenticResults");
  const forum = functionSlice(community, "async function loadForum", "function populateThreadCategories");
  const marketAction = functionSlice(market, "async function postMarketAction", "function market");

  assert.match(html, /id="globalProcessStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"[^>]*hidden/);
  assert.match(html, /id="authStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"[^>]*hidden/);
  assert.match(html, /id="agenticDiscoveryStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"[^>]*hidden/);
  assert.match(css, /\.form-status\.process-status\.is-loading/);
  assert.match(css, /\.global-process-status\.process-status/);
  assert.match(css, /\.process-status-spinner/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.process-status-spinner[\s\S]*?animation:\s*none\s*!important/);

  assert.match(login, /startProcessStatus\(els\.authStatus, LOGIN_PROGRESS_STEPS/);
  assert.match(login, /advanceProcessStatus\(els\.authStatus, progressToken, 1\)/);
  assert.match(login, /finishProcessStatus\(els\.authStatus, progressToken/);
  assert.match(login, /finally \{\s*setLoginPending\(false\)/);

  assert.match(discovery, /startProcessStatus\(els\.discoveryStatus, DISCOVERY_PROGRESS_STEPS/);
  assert.match(discovery, /finishProcessStatus\(els\.discoveryStatus, progressToken/);
  assert.match(discovery, /finally \{\s*if \(requestId === discoveryRequestId\) setDiscoveryPending\(false\)/);

  assert.match(brief, /PARTNER_PROFILE_UPDATE_PROGRESS_STEPS/);
  assert.match(brief, /PUBLIC_BRIEF_PROGRESS_STEPS/);
  assert.match(brief, /startProcessStatus\(els\.publicBriefStatus,/);
  assert.match(brief, /finishProcessStatus\(\s*els\.publicBriefStatus,\s*progressToken/);
  assert.match(brief, /finally \{[\s\S]*?aria-busy", "false"/);

  assert.match(refresh, /startProcessStatus\(els\.globalProcessStatus, REFRESH_PROGRESS_STEPS/);
  assert.match(refresh, /finally \{\s*finishProcessStatus\(els\.globalProcessStatus, progressToken\)/);
  assert.match(forum, /startProcessStatus\(els\.threadStatus, COMMUNITY_PROGRESS_STEPS/);
  assert.match(forum, /finishProcessStatus\(els\.threadStatus, progressToken\)/);
  assert.match(marketAction, /startProcessStatus\(els\.globalProcessStatus, MARKET_ACTION_PROGRESS_STEPS/);
  assert.match(marketAction, /finally \{\s*finishProcessStatus\(els\.globalProcessStatus, progressToken\)/);
});

test("instant local filters remain immediate instead of flashing network progress", () => {
  const arena = readFileSync("public/arena/arena.js", "utf8");
  const market = readFileSync("public/arena/market.js", "utf8");
  const renderTeams = functionSlice(arena, "function renderTeams", "function teamCardMarkup");
  const renderDiscover = functionSlice(market, "function renderDiscover", "function marketTeamCardMarkup");

  assert.doesNotMatch(renderTeams, /startProcessStatus|fetch\(/);
  assert.doesNotMatch(renderDiscover, /startProcessStatus|fetch\(/);
});
