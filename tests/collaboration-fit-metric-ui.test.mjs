import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("public/arena/index.html", "utf8");
const js = readFileSync("public/arena/arena.js", "utf8");
const css = readFileSync("public/arena/arena.css", "utf8");
const overviewSource = js.slice(js.indexOf("function renderOverview()"), js.indexOf("function partnerProfileForViewer()"));

test("overview exposes the signed-in account collaboration-fit metric", () => {
  const metricCard = html.match(/<article id="collaborationFitCard"[\s\S]*?<\/article>/)?.[0] || "";

  assert.match(metricCard, /id="metricProfiles"/);
  assert.match(metricCard, /<strong id="metricProfiles">0<\/strong>/);
  assert.doesNotMatch(metricCard, /—/);
  assert.match(metricCard, /id="metricProfilesTooltip"/);
  assert.match(metricCard, /role="tooltip"/);
  assert.match(metricCard, /tabindex="0"/);
  assert.match(overviewSource, /metrics\.collaborationFitCount/);
  assert.match(overviewSource, /metrics\.collaborationFitCompanies/);
  assert.doesNotMatch(overviewSource, /metrics\.profilesReady|metrics\.profilePopulation/);
});

test("collaboration-fit card renders zero instead of a dash and lists company names with scores and reasons", () => {
  assert.match(overviewSource, /collaborationFitStatus\s*===\s*["']ready["']/);
  assert.match(overviewSource, /collaborationFitStatus\s*===\s*["']profile_required["']/);
  assert.match(overviewSource, /formatNumber\(metrics\.collaborationFitCount\)/);
  assert.match(overviewSource, /:\s*["']0["']/);

  const metricAssignment = overviewSource.match(/els\.metricProfiles\.textContent\s*=[\s\S]{0,500}?;/)?.[0] || "";
  assert.ok(metricAssignment, "metricProfiles must receive the personalized collaboration-fit value");
  assert.doesNotMatch(metricAssignment, /—/, "the collaboration-fit metric must never render an em dash");

  assert.match(js, /function renderCollaborationFitTooltip\(metrics = \{\}\)/);
  assert.match(js, /company\.name/);
  assert.match(js, /company\.score/);
  assert.match(js, /function collaborationFitReason\(company = \{\}\)/);
  assert.match(js, /company\.fitReason/);
  assert.match(js, /company\.evidence/);
  assert.doesNotMatch(js, /역량 일치/);
  assert.doesNotMatch(js, /키워드 일치/);
  assert.match(js, /fit-company-copy/);
  assert.match(js, /els\.collaborationFitCard\.removeAttribute\("title"\)/);
  assert.doesNotMatch(js, /els\.collaborationFitCard\.title\s*=/);
  assert.match(css, /\.metric-fit-tooltip \.fit-company-copy small/);
  assert.match(css, /\.collaboration-fit-card:hover \.metric-fit-tooltip/);
  assert.match(css, /\.collaboration-fit-card:focus \.metric-fit-tooltip/);
});

test("each collaboration-fit company reveals a server-generated one-sentence reason on hover or focus", () => {
  const config = readFileSync("netlify.toml", "utf8");

  assert.match(js, /fetch\("\/api\/collaboration-fit-reasons"/);
  assert.match(js, /data-fit-company-id/);
  assert.match(js, /class="fit-company-item" tabindex="0"/);
  assert.match(js, /SPARK AI 협업 활용 제안/);
  assert.match(js, /function collaborationFitHoverReason\(company = \{\}\)/);
  assert.match(js, /function collaborationFitUseSuggestion\(company = \{\}\)/);
  assert.doesNotMatch(js, /근거가 현재 계정의 협업 방향과 겹쳐 우선 검토 대상으로 선정했습니다/);
  assert.match(js, /function resetCollaborationFitReasonState\(\)/);
  assert.match(css, /\.fit-company-item:hover \.fit-company-selection-reason/);
  assert.match(css, /\.fit-company-item:focus-visible \.fit-company-selection-reason/);
  assert.match(css, /@keyframes fit-reason-pulse/);
  assert.match(config, /from = "\/api\/collaboration-fit-reasons"/);
  assert.doesNotMatch(`${html}\n${js}`, /GEMINI_API_KEY|GOOGLE_API_KEY|x-goog-api-key|Gemini/);
});

test("collaboration-fit decoration stays clipped while its tooltip can escape the card", () => {
  assert.match(css, /\.collaboration-fit-card\s*\{[\s\S]*?overflow:\s*visible/);
  assert.match(css, /\.metric-card::after\s*\{[\s\S]*?inset:\s*0;[\s\S]*?border-radius:\s*inherit;[\s\S]*?radial-gradient/);
  assert.match(css, /\.metric-card::after\s*\{[\s\S]*?pointer-events:\s*none/);
  assert.doesNotMatch(css, /\.metric-card::after\s*\{[\s\S]*?right:\s*-32px/);
});

test("collaboration-fit details begin inside the right metric card and may extend beyond it", () => {
  assert.match(css, /\.metric-fit-tooltip\s*\{[\s\S]*?top:\s*16px;[\s\S]*?left:\s*calc\(100% - 58px\);/);
  assert.match(css, /\.metric-fit-tooltip\s*\{[\s\S]*?transform:\s*translate3d\(var\(--fit-tooltip-enter-x\), 0, 0\) scale\(0\.965\);/);
  assert.match(css, /body\.is-claw-member \.collaboration-fit-card \.metric-fit-tooltip\s*\{[\s\S]*?right:\s*16px;[\s\S]*?left:\s*clamp\(210px, 38%, 300px\);[\s\S]*?width:\s*auto;/);
  assert.match(css, /body\.is-claw-member #overviewPage > \.metric-grid > \.collaboration-fit-card\s*\{[\s\S]*?min-width:\s*0;/);
  assert.doesNotMatch(css, /body\.is-claw-member #overviewPage > \.metric-grid > \.collaboration-fit-card\s*\{[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.match(css, /body\.is-claw-member #overviewPage > \.metric-grid > \.collaboration-fit-card \.metric-fit-tooltip\s*\{[\s\S]*?right:\s*auto;[\s\S]*?left:\s*clamp\(180px, 38%, 250px\);[\s\S]*?width:\s*min\(430px, calc\(100vw - 42px\)\);/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?body\.is-claw-member #overviewPage > \.metric-grid > \.collaboration-fit-card \.metric-fit-tooltip\s*\{[\s\S]*?top:\s*calc\(100% - 4px\);[\s\S]*?left:\s*10px;/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.collaboration-fit-card \.metric-fit-tooltip,[\s\S]*?top:\s*calc\(100% - 4px\);[\s\S]*?right:\s*10px;[\s\S]*?left:\s*10px;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.metric-fit-tooltip\s*\{\s*transition:\s*none !important;/);
});

test("administrator accounts explain why collaboration fit is not calculated", () => {
  assert.match(overviewSource, /operatorViewer[\s\S]*?hub\?\.viewer\?\.canScore/);
  assert.match(overviewSource, /관리자 운영 계정 · 회사별 계산 제외/);
  assert.match(js, /관리자 계정은 계산 대상이 아닙니다/);
  assert.match(js, /특정 회사 프로필에 귀속되지 않아 협업 적합도를 계산하지 않습니다/);
  assert.match(js, /해당 파트너 또는 참가기업 계정으로 로그인해 확인하세요/);
});
