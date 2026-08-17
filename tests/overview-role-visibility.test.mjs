import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/arena/index.html", import.meta.url), "utf8");
const js = await readFile(new URL("../public/arena/arena.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/arena/arena.css", import.meta.url), "utf8");

test("Arena Updates remains preserved but hidden from every viewer", () => {
  assert.match(
    html,
    /class="panel arena-news-panel" data-hide-from-admin-or-partner data-arena-updates-hidden hidden>[\s\S]*?ARENA UPDATES/
  );
  assert.match(js, /const externalPartnerViewer = role === "b2b_partner"/);
  assert.match(
    js,
    /querySelectorAll\("\[data-hide-from-admin-or-partner\]"\)[\s\S]*?element\.hidden = element\.hasAttribute\("data-arena-updates-hidden"\) \|\| adminViewer \|\| externalPartnerViewer/
  );
});

test("Our Partners is hidden only from administrators while member and partner variants remain available", () => {
  assert.match(
    html,
    /class="panel partner-callout" data-hide-from-admin hidden>[\s\S]*?class="partner-callout-provider" data-hide-from-claw-member[\s\S]*?OUR PARTNERS/
  );
  assert.match(
    html,
    /id="memberBenefitSurveyForm"[\s\S]*?data-show-for-claw-member/
  );
});

test("Community Map is hidden from SparkLabs administrators and Claw Members", () => {
  assert.match(
    html,
    /id="taskMapPanel" class="panel sector-panel" data-hide-from-admin-or-claw-member/
  );
  assert.match(
    js,
    /querySelectorAll\("\[data-hide-from-admin-or-claw-member\]"\)[\s\S]*?element\.hidden = adminViewer \|\| clawMemberViewer/
  );
});

test("Task-driven Search and Tech Passports are hidden from SparkLabs administrators", () => {
  assert.match(
    html,
    /data-nav-page="discover" data-hide-from-claw-member data-hide-from-admin[^>]*>[\s\S]*?Task-driven Search/
  );
  assert.match(
    html,
    /data-nav-page="passports" data-hide-from-claw-member data-hide-from-admin[^>]*>[\s\S]*?Tech Passports/
  );
  assert.match(
    js,
    /function isAdminViewer\(\)[\s\S]*?\["sparklabs", "admin"\]\.includes\(role\)/
  );
  assert.match(
    js,
    /isAdminViewer\(\) && \["discover", "passports"\]\.includes\(pageName\)[\s\S]*?pageName = "overview"/
  );
});

test("Compare and Partnerships are also removed from the administrator Discover menu", () => {
  assert.match(
    html,
    /data-nav-page="compare" data-hide-from-claw-member data-hide-from-admin[^>]*>[\s\S]*?Compare/
  );
  assert.match(
    html,
    /data-nav-page="partnerships" data-nav-roles="b2b_partner,sparklabs,admin" data-hide-from-admin[^>]*>[\s\S]*?Partnerships/
  );
  assert.match(
    js,
    /const hiddenForAdmin = button\.hasAttribute\("data-hide-from-admin"\) && adminViewer;[\s\S]*?button\.hidden = !\(roleAllowed && featureAllowed\) \|\| hiddenForAdmin \|\| hiddenForClawMember;/
  );
  assert.match(css, /body\.is-admin-viewer \.nav-menu-discover \.nav-dropdown-wide\s*\{[\s\S]*?width:\s*300px;[\s\S]*?grid-template-columns:\s*1fr;/);
});

test("the role-aware overview row collapses cleanly when zero or one panels remain", () => {
  assert.match(html, /id="roleAwareCommunityPanels" class="community-news-grid"/);
  assert.match(js, /roleAwareCommunityPanels\.hidden = visiblePanels\.length === 0/);
  assert.match(js, /classList\.toggle\("has-one-visible-panel", visiblePanels\.length === 1\)/);
  assert.match(css, /\.community-news-grid\.has-one-visible-panel\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
});
