import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { YOUNGONE_EXTERNAL_PARTNER_PROFILE } from "../netlify/data/external-partner-profiles/youngone-profile.mjs";

const profiles = JSON.parse(readFileSync("netlify/data/external-partner-profiles/profiles.json", "utf8"));

test("영원무역 외부 파트너·LP 프로필 seed와 JSON이 동기화되어 있다", () => {
  assert.equal(profiles.length, 1);
  assert.deepEqual(profiles[0], YOUNGONE_EXTERNAL_PARTNER_PROFILE);
  assert.equal(YOUNGONE_EXTERNAL_PARTNER_PROFILE.id, "youngone-corporation");
  assert.equal(YOUNGONE_EXTERNAL_PARTNER_PROFILE.logoUrl, "/arena/assets/partner-logos/youngone.png");
  assert.equal(existsSync("public/arena/assets/partner-logos/youngone.png"), true);
  assert.deepEqual(YOUNGONE_EXTERNAL_PARTNER_PROFILE.accountEmails, ["test@gmail.com"]);
  assert.equal(YOUNGONE_EXTERNAL_PARTNER_PROFILE.entityType, "corporate_cvc");
  assert.ok(YOUNGONE_EXTERNAL_PARTNER_PROFILE.classifications.includes("pilot_customer"));
  assert.ok(YOUNGONE_EXTERNAL_PARTNER_PROFILE.classifications.includes("corporate_lp"));
});

test("프로필은 공식 근거, 우선순위 가설과 미확인 항목을 구분한다", () => {
  const profile = YOUNGONE_EXTERNAL_PARTNER_PROFILE;
  assert.equal(profile.researchAsOf, "2026-08-07");
  assert.equal(profile.nextReviewDate, "2026-11-07");
  assert.ok(profile.evidence.length >= 8);
  assert.ok(profile.evidence.every((item) => item.publisher && item.accessedAt === "2026-08-07" && /^https:\/\//.test(item.url)));
  assert.deepEqual(profile.priorities.map((item) => item.rank), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(profile.priorities.every((item) => item.hypothesis && item.validationQuestions.length));
  assert.deepEqual(
    profile.unknowns.slice(0, 4).map((item) => item.field),
    ["annualPilotBudget", "investmentCheckSize", "targetStages", "activeRfp"]
  );
  assert.match(profile.evidenceNote, /RFP·예산/);
});

test("운영자용 리서치 문서는 사실, 가설, 미확인 항목을 분리한다", () => {
  const research = readFileSync("netlify/data/external-partner-profiles/RESEARCH.md", "utf8");
  assert.match(research, /공식 자료로 확인된 사실/);
  assert.match(research, /AI Arena 협업 가설/);
  assert.match(research, /미확인 항목과 운영자 확인 질문/);
  assert.match(research, /https:\/\/kind\.krx\.co\.kr/);
  assert.match(research, /2026-08-07/);
});

test("클라이언트는 안전한 hub.partnerProfile만 표시하고 계정 이메일을 번들에 넣지 않는다", () => {
  const html = readFileSync("public/arena/index.html", "utf8");
  const js = readFileSync("public/arena/arena.js", "utf8");
  const marketJs = readFileSync("public/arena/market.js", "utf8");
  const css = readFileSync("public/arena/arena.css", "utf8");
  const publicSource = `${html}\n${js}\n${css}`;

  assert.match(html, /id="partnerProfileCard"/);
  assert.match(js, /hub\?\.partnerProfile/);
  assert.match(js, /function renderPartnerProfile/);
  assert.match(js, /partnerProfile\?\.logoUrl/);
  assert.match(css, /\.account-avatar\.has-logo/);
  assert.match(js, /다음 실증 파트너를 찾습니다/);
  assert.match(js, /영원무역 확인 전/);
  assert.match(html, /id="featuredCompaniesTitle">Highlighted Companies/);
  assert.match(html, /id="featuredSpotlight"/);
  assert.match(html, /EDITORIAL SPOTLIGHT/);
  assert.match(js, /curatedFeaturedTeams/);
  assert.match(js, /featuredCurationUpdatedLabel/);
  assert.match(js, /refineFeaturedSpotlight/);
  assert.match(js, /function renderPartnerBriefExperience/);
  assert.match(js, /니즈 업데이트/);
  assert.match(js, /니즈 업데이트 요청/);
  assert.match(js, /profileSeeded !== profileSeedKey/);
  assert.match(js, /if \(previousMode && previousMode !== mode\) \{\s*form\.reset\(\)/);
  assert.match(css, /partner-profile-update/);
  assert.match(js, /AI Arena 전체 참가기업/);
  assert.match(js, /PARTNER-SAFE/);
  assert.match(js, /marketDataFromProgramHub\(hub, marketData\)/);
  assert.match(marketJs, /function isProgramDirectoryMarket\(\)/);
  assert.match(marketJs, /Program DB의 안전한 공개 필드만 표시/);
  assert.match(marketJs, /"Diligence 요청"[^\n]+"teams"/);
  assert.match(marketJs, /\[data-go-page=/);
  assert.doesNotMatch(html, /이번 주 주목할 회사/);
  assert.match(css, /\.partner-profile-card\s*\{/);
  assert.doesNotMatch(publicSource, /test@gmail\.com/i);
  assert.doesNotMatch(js, /accountEmails/);
});
