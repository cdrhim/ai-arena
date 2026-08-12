import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/arena/index.html", import.meta.url), "utf8");
const arenaJs = await readFile(new URL("../public/arena/arena.js", import.meta.url), "utf8");
const marketJs = await readFile(new URL("../public/arena/market.js", import.meta.url), "utf8");

const partnerRoles = "b2b_partner,sparklabs,admin";

test("Claw members do not receive Partnerships navigation or partner intake entry points", () => {
  assert.match(html, new RegExp(`data-nav-page="partnerships" data-nav-roles="${partnerRoles}"[\\s\\S]*?>Partnerships<`));
  assert.match(html, new RegExp(`data-nav-target="bountyBriefPanel" data-nav-roles="${partnerRoles}"`));
  assert.match(html, new RegExp(`data-nav-target="partnershipPipelinePanel" data-nav-roles="${partnerRoles}"`));
  assert.match(html, new RegExp(`data-go-page="partnerships" data-nav-roles="${partnerRoles}"[^>]*>파트너 연결 요청<`));
  assert.match(html, /data-page-panel="partnerships" hidden/);
});

test("direct Partnerships navigation returns Claw members to Discover", () => {
  assert.match(arenaJs, /isClawMemberViewer\(\) && pageName === "partnerships"[\s\S]*?pageName = "overview"/);
  assert.match(arenaJs, /Claw Member의 기업 간 협업은 기업 상세의 협업 검토 요청과 My Log에서 진행/);
  assert.match(arenaJs, /data-page-panel="partnerships"\]\.is-active/);
});

test("member company actions use collaboration review instead of the partner intake page", () => {
  assert.match(marketJs, /function companyReviewActionMarkup\(startup, partnerLabel\)[\s\S]*?isClawMemberViewer\(\)[\s\S]*?data-collaboration-review-team/);
  assert.match(marketJs, /clawMember \? "" : `<button class="secondary-button compact" data-market-page="partnerships"/);
  assert.match(marketJs, /isClawMemberViewer\(\) \? "discover" : "partnerships"/);
  assert.doesNotMatch(marketJs, /소개 요청 검토[\s\S]{0,180}partnerships/);
});
