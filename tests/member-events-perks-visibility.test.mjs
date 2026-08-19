import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/arena/index.html", import.meta.url), "utf8");
const js = await readFile(new URL("../public/arena/arena.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/arena/arena.css", import.meta.url), "utf8");

test("Claw members do not see Events & Perks navigation or Discover entry points", () => {
  assert.match(
    html,
    /data-page="calendar" data-nav-roles="b2b_partner,human_validator"/
  );
  assert.equal((html.match(/data-hide-from-claw-member/g) || []).length, 8);
  assert.match(html, /data-nav-page="overview" role="menuitem"[^>]*>[\s\S]*?<strong>Discover Home<\/strong>/);
  assert.doesNotMatch(html, /data-nav-page="overview"[^>]*data-hide-from-claw-member/);
  assert.match(html, /data-nav-page="discover" data-hide-from-claw-member[\s\S]*?>Task-driven Search</);
  assert.match(html, /data-nav-page="passports" data-hide-from-claw-member[\s\S]*?>Tech Passports</);
  assert.match(html, /data-nav-page="compare" data-hide-from-claw-member[\s\S]*?>Compare</);
  assert.match(html, /id="taskMapPanel" class="panel sector-panel" data-hide-from-admin-or-claw-member/);
  assert.match(html, /data-nav-page="teams" role="menuitem" type="button"><strong>Company Directory<\/strong>/);
  assert.match(css, /body\.is-claw-member \.nav-menu-discover \.nav-dropdown-wide[\s\S]*?width: 260px[\s\S]*?grid-template-columns: 1fr/);
  assert.match(js, /const clawMemberViewer = role === "member"/);
  assert.match(js, /function isClawMemberViewer\(\)[\s\S]*?=== "member"/);
  assert.match(js, /element\.hidden = clawMemberViewer/);
  assert.match(js, /\[data-hide-from-admin-or-claw-member\][\s\S]*?element\.hidden = adminViewer \|\| clawMemberViewer/);
  assert.doesNotMatch(html, /id="memberBenefitSurveyForm"|data-show-for-claw-member/);
  assert.match(html, /class="panel partner-callout"[^>]*data-hide-from-claw-member/);
  assert.match(js, /\[data-show-for-claw-member\][\s\S]*?element\.hidden = !clawMemberViewer/);
  assert.match(js, /clawMemberViewer[\s\S]*?기업 둘러보기[\s\S]*?: `<button[\s\S]*?혜택 확인/);
});

test("Claw member direct Events & Perks navigation returns to Discover", () => {
  assert.match(js, /\(isClawMemberViewer\(\) \|\| isAdminViewer\(\)\) && \["calendar", "benefits"\]\.includes\(pageName\)/);
  assert.match(js, /Events & Perks는 기존 SparkClaw 프로그램 사이트에서 확인해 주세요\./);
});

test("SparkLabs administrators do not see Events & Perks or its Discover entry points", () => {
  assert.doesNotMatch(html, /data-page="calendar"[^>]*data-nav-roles="[^"]*(?:sparklabs|admin)/);
  assert.match(html, /class="metric-card accent-violet" data-hide-from-claw-member data-hide-from-admin/);
  assert.match(html, /class="metric-card accent-orange" data-hide-from-claw-member data-hide-from-admin/);
  assert.match(html, /class="panel" data-hide-from-claw-member data-hide-from-admin>[\s\S]*?FEATURED PERKS/);
  assert.match(js, /SparkLabs 관리자 화면에서는 Events & Perks를 표시하지 않습니다\./);
  assert.match(js, /clawMemberViewer \|\| operatorViewer[\s\S]*?기업 둘러보기/);
  assert.match(js, /\.metric-card:not\(\.admin-benefit-request-notice\)/);
  assert.match(css, /body\.is-admin-viewer #overviewPage > \.metric-grid\s*{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
});

test("member overview keeps a balanced two-column metric grid", () => {
  assert.match(css, /body\.is-claw-member #overviewPage > \.metric-grid\s*{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
