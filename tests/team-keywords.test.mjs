import assert from "node:assert/strict";
import test from "node:test";

import { deriveTeamKeywords, normalizeStoredKeywords } from "../netlify/lib/team-keywords.mjs";

test("team keywords combine service taxonomy and capability concepts", () => {
  const keywords = deriveTeamKeywords({
    name: "Factory Vision",
    sector: "Manufacturing",
    service_summary: "Computer vision quality inspection and smart factory automation",
    ai_idea_summary: "MES-connected visual defect detection"
  });

  assert.ok(keywords.includes("Manufacturing"));
  assert.ok(keywords.includes("컴퓨터 비전"));
  assert.ok(keywords.includes("품질 검사"));
  assert.ok(keywords.includes("스마트 팩토리"));
});

test("short AR alias only matches a complete token", () => {
  const unrelated = deriveTeamKeywords({
    name: "MarketFlow",
    sector: "Commerce",
    service_summary: "Marketing campaign workflow for retail brands"
  });
  const spatial = deriveTeamKeywords({
    name: "Room AR",
    sector: "Spatial Computing",
    service_summary: "AR product visualization"
  });

  assert.equal(unrelated.includes("공간 컴퓨팅"), false);
  assert.equal(spatial.includes("공간 컴퓨팅"), true);
});

test("sparse profiles are marked incomplete without invented capabilities", () => {
  const keywords = deriveTeamKeywords({ name: "Unknown Service" });

  assert.deepEqual(keywords, ["Unknown Service", "프로필 정보 부족"]);
  assert.equal(keywords.includes("AI 에이전트"), false);
});

test("stored keyword normalization removes duplicates", () => {
  assert.deepEqual(normalizeStoredKeywords(["SaaS", "saas", "문서 AI"]), ["SaaS", "문서 AI"]);
});
