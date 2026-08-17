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
  assert.match(metricCard, /role="button"/);
  assert.match(metricCard, /aria-expanded="false"/);
  assert.match(metricCard, /role="region"/);
  assert.match(metricCard, /tabindex="0"/);
  assert.match(overviewSource, /metrics\.collaborationFitCount/);
  assert.match(overviewSource, /metrics\.collaborationFitCompanies/);
  assert.doesNotMatch(overviewSource, /metrics\.profilesReady|metrics\.profilePopulation/);
});

test("collaboration-fit card renders zero instead of a dash and lists recommendation ranks without scores", () => {
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
  assert.match(js, /추천 \$\{index \+ 1\}위/);
  assert.match(js, /fit-company-rank/);
  assert.doesNotMatch(js, /fit-company-score">\$\{formatNumber\(Math\.round\(Number\(company\.score\)\)\)\}점/);
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
  assert.match(js, /클로이 협업 활용 제안/);
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

test("collaboration-fit dropdown escapes the metric card while decoration stays bounded", () => {
  assert.match(css, /\.collaboration-fit-card\s*\{[\s\S]*?overflow:\s*visible/);
  assert.match(css, /\.collaboration-fit-card\s*\{[\s\S]*?cursor:\s*pointer/);
  assert.match(css, /\.metric-card::after\s*\{[\s\S]*?inset:\s*0;[\s\S]*?border-radius:\s*inherit;[\s\S]*?radial-gradient/);
  assert.match(css, /\.metric-card::after\s*\{[\s\S]*?pointer-events:\s*none/);
  assert.doesNotMatch(css, /\.metric-card::after\s*\{[\s\S]*?right:\s*-32px/);
});

test("collaboration-fit details keep their wide dropdown shape but start beside the metric", () => {
  assert.match(css, /\.metric-fit-tooltip\s*\{[\s\S]*?top:\s*14px;[\s\S]*?right:\s*auto;[\s\S]*?left:\s*clamp\(224px, 34%, 278px\);[\s\S]*?width:\s*min\(680px, calc\(200% \+ 14px\)\);[\s\S]*?max-height:\s*min\(480px, calc\(100vh - 190px\)\);/);
  assert.match(css, /\.metric-fit-tooltip::before\s*\{[\s\S]*?right:\s*100%;[\s\S]*?width:\s*24px;[\s\S]*?height:\s*100%;/);
  assert.match(css, /\.metric-fit-tooltip\s*\{[\s\S]*?transform:\s*translate3d\(0, -8px, 0\) scale\(0\.985\);/);
  assert.match(css, /\.collaboration-fit-card\.is-open \.metric-fit-tooltip/);
  assert.match(js, /function setCollaborationFitDropdownOpen\(open\)/);
  assert.match(js, /closeCollaborationFitDropdownOnEscape/);
  assert.match(css, /body\.is-claw-member #overviewPage > \.metric-grid > \.collaboration-fit-card\s*\{[\s\S]*?min-width:\s*0;/);
  const clawMemberMetricCardRule = css.match(/body\.is-claw-member #overviewPage > \.metric-grid > \.collaboration-fit-card\s*\{([^}]*)\}/)?.[1] || "";
  assert.doesNotMatch(clawMemberMetricCardRule, /grid-column:\s*1 \/ -1/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.collaboration-fit-card \.metric-fit-tooltip,[\s\S]*?top:\s*calc\(100% \+ 8px\);[\s\S]*?width:\s*100%;[\s\S]*?max-height:\s*min\(430px, calc\(100vh - 150px\)\);/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.metric-fit-tooltip\s*\{\s*transition:\s*none !important;/);
});

test("administrator accounts do not see the collaboration-fit metric", () => {
  const metricCard = html.match(/<article id="collaborationFitCard"[\s\S]*?<\/article>/)?.[0] || "";

  assert.match(metricCard, /data-hide-from-admin/);
  assert.match(js, /const adminViewer = Boolean\(hub\.viewer\?\.canScore\)/);
  assert.match(js, /document\.body\.classList\.toggle\("is-admin-viewer", adminViewer\)/);
  assert.match(js, /querySelectorAll\("\[data-hide-from-admin\]"\)/);
  assert.match(css, /body\.is-admin-viewer #overviewPage > \.metric-grid\s*{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
});

test("Community Events copy and fallback data use the BootCamp Orientation cutoff", () => {
  assert.match(js, /isCommunityEventFromOrientation\(event\)/);
  assert.match(overviewSource, /8월 13일 BootCamp Orientation 포함 · 이후 일정/);
});
