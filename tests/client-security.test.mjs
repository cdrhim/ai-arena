import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { escapeHtml } from "../public/arena/sanitize.js";

test("client source keeps Supabase secrets server-side", () => {
  const source = [
    readFileSync("public/arena/arena.js", "utf8"),
    readFileSync("public/arena/market.js", "utf8"),
    readFileSync("public/arena/community.js", "utf8"),
    readFileSync("public/arena/index.html", "utf8")
  ].join("\n");

  assert.doesNotMatch(source, /sk-ant|ANTHROPIC_API_KEY|api\.anthropic\.com|x-api-key|sb_secret_|sb_publishable_/i);
  assert.match(source, /\/api\/arena-auth/);
  assert.match(source, /\/api\/program-hub/);
  assert.match(source, /\/api\/program-database/);
});

test("user-authored markup is escaped before insertion into HTML strings", () => {
  const payload = `<img src=x onerror="globalThis.__xss=1"><script>globalThis.__xss=1</script>`;
  const escaped = escapeHtml(payload);

  assert.doesNotMatch(escaped, /<script/i);
  assert.doesNotMatch(escaped, /<img/i);
  assert.match(escaped, /&lt;script&gt;/);
  assert.match(escaped, /&quot;globalThis\.__xss=1&quot;/);
});

test("AI Arena keeps all primary navigation behind login while role-specific surfaces remain gated", () => {
  const html = readFileSync("public/arena/index.html", "utf8");
  const css = readFileSync("public/arena/arena.css", "utf8");
  const js = readFileSync("public/arena/arena.js", "utf8");
  const marketJs = readFileSync("public/arena/market.js", "utf8");
  const communityJs = readFileSync("public/arena/community.js", "utf8");

  assert.match(html, /<html lang="ko">/);
  assert.match(html, /<title>SparkLabs AI Arena<\/title>/);
  assert.match(html, /Where AI companies/);
  assert.match(html, /id="agenticDiscoveryForm"/);
  assert.match(html, /id="publicBriefTitle">찾는 기술·<br>해결할 문제부터 알려주세요<\/h2>/);
  assert.doesNotMatch(html, /찾는 기술보다/);
  assert.match(html, /id="communityPage"/);
  assert.match(html, /data-page="overview"[^>]*>Discover<\/button>/);
  assert.match(html, /data-page="community"[^>]*data-founder-only[^>]*data-feature="forum"/);
  assert.match(html, /data-page="arena"[^>]*>Bounty<\/button>/);
  assert.match(html, /data-page="calendar"[^>]*>Events &amp; Perks<\/button>/);
  assert.match(html, /data-page="workspace"[^>]*data-member-only[^>]*>My Log<\/button>/);
  assert.match(html, /id="primaryNav"[^>]*hidden/);
  assert.doesNotMatch(html, />Arena Preview<\/button>/);
  assert.match(html, /data-page-panel="workspace"/);
  assert.match(html, /id="teamGrid"/);
  assert.match(html, /id="eventTimeline"/);
  assert.match(html, /id="benefitGrid"/);
  assert.doesNotMatch(html, /STAFF BENEFIT OPS/);
  assert.doesNotMatch(html, /id="benefitConfigForm"/);
  assert.doesNotMatch(html, /id="benefitApplicationQueue"/);
  assert.match(html, /id="eventRegistrationQueue"/);
  assert.match(html, /ARENA UPDATES/);
  assert.match(html, /FEATURED PERKS/);
  assert.match(html, /Feature a perk/);
  assert.match(html, /id="featuredSpotlight"/);
  assert.match(html, /EDITORIAL SPOTLIGHT/);
  assert.match(html, /로그인한 팀 상태와 제공 조건을 비교해 활용 가능한 혜택을 분류/);
  assert.match(js, /function renderTeams/);
  assert.match(js, /function renderCalendar/);
  assert.match(js, /function renderBenefits/);
  assert.doesNotMatch(js, /function renderBenefitOperations/);
  assert.match(js, /function renderEventRegistrationQueue/);
  assert.match(js, /function renderOperations/);
  assert.match(js, /function configurePermissions/);
  assert.match(js, /querySelectorAll\("\[data-nav-roles\]"\)/);
  assert.match(js, /authConfig\?\.features\?\.\[feature\]/);
  assert.match(js, /function shouldLoadPrototypeData/);
  assert.match(js, /features\?\.arena && authConfig\?\.features\?\.publicTechDisclosure/);
  assert.match(js, /features\?\.b2bPortal/);
  assert.match(js, /"applyBenefit"/);
  assert.match(js, /"registerEvent"/);
  assert.match(css, /\.team-grid\s*{/);
  assert.match(css, /\.program-hero\s*{/);
  assert.match(css, /\.benefit-operations-panel/);
  assert.match(css, /\.program-action-queue/);
  assert.match(css, /\.agentic-discovery\s*{/);
  assert.match(css, /\.community-layout\s*{/);
  assert.match(marketJs, /viewer\(\)\?\.role === "b2b_partner"/);
  assert.match(marketJs, /SparkLabs My Log/);
  assert.match(communityJs, /fetch\("\/api\/b2b-match"/);
  assert.match(communityJs, /fetch\("\/api\/forum"/);
  assert.match(communityJs, /fetch\("\/api\/forum-draft-analysis"/);
  assert.match(js, /const COMMUNITY_ROLES = new Set\(\["member", "b2b_partner", "human_validator", "sparklabs", "admin"\]\)/);
  assert.match(html, /Public · SparkClaw 산업 파트너 포함/);
});

test("anonymous landing exposes only the reusable public Brief while member data stays login-gated", () => {
  const html = readFileSync("public/arena/index.html", "utf8");
  const js = readFileSync("public/arena/arena.js", "utf8");
  const initializeSource = js.slice(js.indexOf("async function initialize"), js.indexOf("async function loadAuthConfig"));

  assert.match(html, /id="loginGate"[^>]*data-auth-required[^>]*hidden/);
  assert.match(html, /id="publicBriefGate"[^>]*hidden/);
  assert.match(html, /id="publicBriefPublicMount"/);
  assert.match(html, /id="publicBriefAuthenticatedMount"/);
  assert.match(html, /id="programApp" class="program-app" hidden/);
  assert.match(html, /로그인하고 발견하세요/);
  assert.match(html, /id="memberAccessButton"[^>]*hidden>회원 로그인/);
  assert.match(html, /id="memberAccessClose"[^>]*aria-label="로그인 창 닫기"/);
  assert.match(html, /data-close-member-access/);
  assert.equal((html.match(/id="publicBriefForm"/g) || []).length, 1);
  assert.equal((html.match(/id="publicBriefSection"/g) || []).length, 1);
  assert.match(html, /data-public-brief-login[^>]*>AI Arena 회원이신가요\?/);
  assert.match(html, /id="staffUtilityNav"[^>]*hidden/);
  assert.match(html, /id="arenaStaffPanel"[^>]*hidden/);
  assert.match(html, /id="staffMarketQueue"[^>]*hidden/);
  assert.match(html, /data-page="community"[^>]*data-founder-only/);
  assert.match(html, /data-page="workspace"[^>]*data-member-only/);
  assert.match(html, /접수일로부터 90일 후 보관 필요성을 재검토/);
  assert.match(js, /function showLogin/);
  assert.match(js, /function showPublicBriefGate/);
  assert.match(js, /function mountPublicBrief/);
  assert.match(js, /mountPublicBrief\("public"\)/);
  assert.match(js, /mountPublicBrief\("authenticated"\)/);
  assert.match(js, /els\.programApp\.hidden = true/);
  assert.match(js, /els\.primaryNav\.hidden = true/);
  assert.match(js, /els\.memberAccessButton\.hidden = false/);
  assert.match(initializeSource, /showPublicBriefGate\(authConfigError/);
  assert.doesNotMatch(initializeSource, /\/api\/arena-public|loadPublicHub/);
  assert.match(js, /fetch\("\/api\/arena-public", \{\s*method: "POST"/);
  assert.match(js, /async function mergeAuthenticatedSafeSnapshot/);
  assert.doesNotMatch(js, /function showPublicApp|function loadPublicHub/);
  assert.match(js, /fetch\("\/api\/arena-public", \{[\s\S]{0,160}\.\.\.authHeaders\(\)/);
  assert.match(js, /if \(!hub \|\| !isAuthenticatedViewer\(\)\)/);
  assert.match(js, /canViewOperations/);
  assert.match(js, /canViewRawDatabase/);
  assert.match(js, /if \(pageName === "operations"/);
  assert.match(js, /if \(pageName === "database"/);
  assert.match(js, /Authorization: `Bearer \$\{authSession\.access_token\}`/);
});

test("member access entrance stays accessible, motion-safe, and authentication-neutral", () => {
  const html = readFileSync("public/arena/index.html", "utf8");
  const css = readFileSync("public/arena/arena.css", "utf8");
  const js = readFileSync("public/arena/arena.js", "utf8");

  assert.match(
    html,
    /id="loginGate"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="memberAccessTitle"[^>]*aria-describedby="memberAccessDescription"[^>]*hidden/
  );
  assert.match(html, /class="login-visual-system" aria-hidden="true"/);
  assert.match(html, /id="memberAccessDescription"/);
  assert.match(html, /name="email"[^>]*autocomplete="email"[^>]*required/);
  assert.match(html, /name="password"[^>]*autocomplete="current-password"[^>]*required/);
  assert.doesNotMatch(html, /type="submit"[^>]*>\s*(회원가입|가입)/);

  assert.match(css, /button\[hidden\],\s*\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(css, /\.member-access-shell\s*\{[\s\S]{0,520}?overflow:\s*hidden/);
  assert.doesNotMatch(css, /\.member-access-shell\s*\{[\s\S]{0,520}?overflow:\s*auto/);
  assert.match(css, /@media \(max-width:\s*720px\)[\s\S]*?\.member-access-shell\s*\{[\s\S]{0,180}?grid-template-columns:\s*1fr/);
  assert.match(css, /\.member-access-layer:not\(\[hidden\]\) \.member-access-shell\s*\{\s*animation:\s*member-access-shell-in/);
  assert.match(css, /@keyframes member-access-shell-in/);
  assert.match(css, /\.member-access-shell \.login-story h1\s*\{[\s\S]*?word-break:\s*keep-all;[\s\S]*?overflow-wrap:\s*normal;/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.member-access-layer:not\(\[hidden\]\)[\s\S]*?animation:\s*none\s*!important/);

  assert.match(js, /memberAccessReturnFocus = document\.activeElement instanceof HTMLElement/);
  assert.match(js, /els\.loginGate\.hidden = false/);
  assert.match(js, /focus\(\{ preventScroll: true \}\)/);
  assert.match(js, /if \(restoreFocus && memberAccessReturnFocus\?\.isConnected\) memberAccessReturnFocus\.focus\(\)/);
  assert.doesNotMatch(js, /loginGate\.offsetWidth|is-entering/);
});

test("public Brief presents an accessible agentic intake without changing anonymous submission", () => {
  const html = readFileSync("public/arena/index.html", "utf8");
  const css = readFileSync("public/arena/arena.css", "utf8");
  const js = readFileSync("public/arena/arena.js", "utf8");
  const decorationStart = html.indexOf('<div class="brief-agent-map"');
  const decorationEnd = html.indexOf('<ol class="brief-process"', decorationStart);
  const decoration = html.slice(decorationStart, decorationEnd);
  const formStart = html.indexOf('<form id="publicBriefForm"');
  const formEnd = html.indexOf("</form>", formStart) + "</form>".length;
  const form = html.slice(formStart, formEnd);
  const handler = js.slice(js.indexOf("async function handlePublicBriefSubmit"), js.indexOf("function scrollToTarget"));

  assert.ok(decorationStart > -1 && decorationEnd > decorationStart);
  assert.match(decoration, /class="brief-agent-map" aria-hidden="true"/);
  assert.doesNotMatch(decoration, /<(?:a|button|input|select|textarea|form)\b|tabindex=/i);
  assert.match(html, /class="public-brief-form-head"/);
  assert.match(html, /SPARK 에이전트 준비됨/);
  assert.match(html, /문제와 제약 검토/);
  assert.match(html, /근거 기반 후보 선별/);
  assert.match(html, /대상 스타트업 동의 후 소개/);

  assert.match(form, /aria-describedby="publicBriefPrivacy publicBriefStatus"/);
  for (const name of ["organization", "contactName", "email", "problem", "successMetric"]) {
    assert.match(form, new RegExp(`name="${name}"[^>]*required`));
  }
  assert.match(form, /name="consent" type="checkbox" required/);
  assert.match(form, /name="companyUrl" tabindex="-1" autocomplete="off"/);
  assert.equal((form.match(/type="submit"/g) || []).length, 1);
  assert.match(form, /id="publicBriefStatus"[^>]*aria-live="polite"/);

  assert.match(css, /\.brief-agent-map\s*\{[\s\S]{0,520}?pointer-events:\s*none/);
  assert.match(css, /\.public-brief-form\s*\{[\s\S]{0,220}?z-index:\s*2/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.brief-agent-link::after[\s\S]*?animation:\s*none\s*!important/);
  assert.match(css, /@media \(max-width:\s*720px\)[\s\S]*?\.public-brief-form \.field-row\s*\{\s*grid-template-columns:\s*1fr/);

  assert.match(handler, /event\.preventDefault\(\)/);
  assert.match(handler, /fetch\("\/api\/arena-public", \{\s*method: "POST"/);
  assert.match(handler, /body: JSON\.stringify\(payload\)/);
  assert.match(handler, /form\.reset\(\)/);
  assert.match(handler, /form\.setAttribute\("aria-busy", "false"\)/);
  assert.doesNotMatch(handler, /showLogin|openMemberAccess|!isAuthenticatedViewer/);
});

test("raw database remains GET-only while Program Hub accepts bounded actions", () => {
  const js = readFileSync("public/arena/arena.js", "utf8");
  const databaseFunction = readFileSync("netlify/functions/program-database.mjs", "utf8");
  const hubFunction = readFileSync("netlify/functions/program-hub.mjs", "utf8");
  const programActions = readFileSync("netlify/lib/program-actions.mjs", "utf8");

  assert.match(js, /fetch\("\/api\/program-database"/);
  assert.match(js, /fetch\("\/api\/program-hub"/);
  assert.match(databaseFunction, /req\.method !== "GET"/);
  assert.match(hubFunction, /!\["GET", "POST"\]\.includes\(req\.method\)/);
  assert.match(hubFunction, /createProgramActionEvent\(body\.action, body\.payload \|\| \{\}/);
  assert.match(js, /fetch\("\/api\/program-hub", \{\s*method: "POST"/);
  assert.match(programActions, /action === "applyBenefit"/);
  assert.match(programActions, /action === "cancelBenefitApplication"/);
  assert.match(programActions, /action === "upsertBenefitConfig"/);
  assert.match(programActions, /action === "registerEvent"/);
  assert.match(programActions, /action === "submitWeeklyReport"/);
  assert.match(programActions, /action === "updateWeeklyReportStatus"/);
  assert.match(programActions, /throw statusError\(`Unsupported program action:/);
  assert.doesNotMatch(js, /fetch\("\/api\/program-database"[\s\S]{0,180}method:\s*"(POST|PUT|PATCH|DELETE)"/);
  assert.doesNotMatch(js, /method:\s*"(PUT|PATCH|DELETE)"/);
});

test("community UI uses evidence labels, structured human posts, and no fabricated starter feed", () => {
  const communityJs = readFileSync("public/arena/community.js", "utf8");

  assert.doesNotMatch(communityJs, /<span>FIT<\/span>|Fit-ranked/);
  assert.match(communityJs, /근거 강함/);
  assert.match(communityJs, /확인 질문/);
  assert.match(communityJs, /Ask, Ship, Connect 또는 Outcome/);
  assert.match(communityJs, /양측 개별 동의/);
  assert.doesNotMatch(communityJs, /function starterThreads/);
});
