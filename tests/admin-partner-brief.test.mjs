import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const js = readFileSync("public/arena/arena.js", "utf8");

test("SparkLabs operators receive a partner proxy Brief workflow", () => {
  assert.match(js, /const isOperatorProxy = Boolean\(hub\?\.viewer\?\.canScore\)/);
  assert.match(js, /switchMode\("operator-proxy-brief"\)/);
  assert.match(js, /파트너사를 대신해<br>탐색 Brief를<br>작성하세요/);
  assert.match(js, /운영진 대리 입력/);
  assert.match(js, /파트너사 탐색 Brief 등록/);
  assert.match(js, /파트너사와 공유 및 입력 권한을 확인한 정보/);
  assert.match(js, /setFieldLabel\("organization", "파트너사명"\)/);
  assert.match(js, /setFieldLabel\("problem", "파트너사가 해결하려는 문제"\)/);
});

test("partner accounts keep their own profile update workflow separate", () => {
  assert.match(js, /const isPartnerUpdate = hub\?\.viewer\?\.role === "b2b_partner"/);
  assert.match(js, /switchMode\("partner-profile-update"\)/);
  assert.match(js, /니즈 변경 요청/);
  assert.match(js, /현재 로그인한 파트너사/);
});

test("Claw members do not see the Discover Brief while public, partner, and operator flows remain available", () => {
  const briefRenderer = js.slice(
    js.indexOf("function renderPartnerBriefExperience"),
    js.indexOf("function partnerProfileForViewer")
  );

  assert.match(briefRenderer, /const isClawMember = viewerRole === "member"/);
  assert.match(briefRenderer, /els\.publicBriefSection\.hidden = isClawMember/);
  assert.match(briefRenderer, /if \(isClawMember\) return/);
  assert.match(briefRenderer, /const isOperatorProxy/);
  assert.match(briefRenderer, /const isPartnerUpdate/);
});
