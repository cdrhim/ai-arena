import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { marketDataFromProgramHub } from "../public/arena/program-market.js";

const arena = readFileSync("public/arena/arena.js", "utf8");
const market = readFileSync("public/arena/market.js", "utf8");
const community = readFileSync("public/arena/community.js", "utf8");
const css = readFileSync("public/arena/arena.css", "utf8");
const html = readFileSync("public/arena/index.html", "utf8");

test("B2B company search and comparison use Program DB participants instead of prototype startups", () => {
  const result = marketDataFromProgramHub(
    {
      viewer: { id: "partner-user", role: "b2b_partner" },
      teams: [
        {
          id: "alpha",
          name: "Alpha AI",
          sector: "Manufacturing",
          oneLiner: "Factory inspection",
          serviceSummary: "Detects visual defects",
          matchingKeywords: ["컴퓨터 비전", "품질 검사", "컴퓨터 비전"],
          websiteUrl: "https://alpha.example",
          email: "private@alpha.example",
          founder: "Private Founder"
        },
        { id: "beta", name: "Beta AI", sector: "Data", serviceSummary: "Document automation" }
      ]
    },
    {
      startups: [{ id: "test", name: "Test" }],
      submissions: [{ id: "test", name: "Test" }],
      connectionRequests: [{ id: "connection-1", startupId: "alpha" }],
      bountyRequests: [{ id: "bounty-1" }],
      metrics: { connections: 1 }
    }
  );

  assert.deepEqual(result.startups.map((team) => team.name), ["Alpha AI", "Beta AI"]);
  assert.equal(result.startups.some((team) => team.name === "Test"), false);
  assert.deepEqual(result.startups[0].functions, ["컴퓨터 비전", "품질 검사"]);
  assert.equal(result.connectionRequests.length, 1);
  assert.equal(result.bountyRequests.length, 1);
  assert.equal(result.metrics.source, "program_directory");
  assert.equal(JSON.stringify(result).includes("private@alpha.example"), false);
  assert.equal(JSON.stringify(result).includes("Private Founder"), false);
});

test("Claw members search other participant teams through contact-safe Program DB profiles", () => {
  const result = marketDataFromProgramHub({
    viewer: { id: "member-user", role: "member" },
    viewerTeam: { id: "alpha", name: "Alpha AI" },
    directoryScope: "other_participating_companies",
    teams: [{ id: "alpha", name: "Alpha AI", founder: "Own founder" }],
    memberDirectory: [
      {
        id: "beta",
        name: "Beta AI",
        sector: "Data",
        oneLiner: "Automates document workflows",
        serviceSummary: "Document automation",
        matchingKeywords: ["문서 AI", "업무 자동화"],
        privateDetailsVisible: false
      }
    ]
  });

  assert.deepEqual(result.startups.map((team) => team.name), ["Beta AI"]);
  assert.equal(result.startups.some((team) => team.id === "alpha"), false);
  assert.deepEqual(result.startups[0].functions, ["문서 AI", "업무 자동화"]);
  assert.equal(result.metrics.source, "program_directory");
  assert.equal(result.metrics.directoryScope, "other_participating_companies");
  assert.equal(JSON.stringify(result).includes("Own founder"), false);
});

test("partner prototype snapshot never publishes before Program DB replacement", () => {
  assert.match(arena, /loadArenaSnapshot\(\{ allowRefresh: false, publish: false \}\)/);
  assert.match(arena, /fetch\("\/api\/arena-competition"/);
  assert.match(arena, /hasCompetitionChallenges\(competition\)[\s\S]*?loadCompetitionSnapshot/);
  assert.match(arena, /function usesProgramDirectoryForViewer\(\)/);
  assert.match(arena, /\["member", "b2b_partner"\]/);
  assert.match(arena, /marketDataFromProgramHub\(hub, marketData\)/);
  assert.match(arena, /if \(publish\) publishMarketContext\(\)/);
});

test("comparison state is account-scoped, removes the legacy Test selection, and never auto-selects companies", () => {
  assert.match(market, /COMPARE_KEY_PREFIX = "sparklabs-ai-arena-compare-v2"/);
  assert.match(market, /currentViewer\?\.id \|\| currentViewer\?\.subject/);
  assert.match(market, /localStorage\.removeItem\(LEGACY_COMPARE_KEY\)/);
  assert.match(market, /selectedTeamIds = reconciled/);
  assert.doesNotMatch(market, /startups\.slice\(0, 2\)\.map/);
  assert.match(market, /임의의 기본 기업은 자동으로 선택하지 않습니다/);
});

test("Company Directory, Task-driven Search, and Compare remain separate linked surfaces", () => {
  assert.match(html, /data-nav-page="teams"[\s\S]*?Company Directory/);
  assert.match(html, /data-nav-page="discover"[\s\S]*?Task-driven Search/);
  assert.match(html, /data-nav-page="compare"[\s\S]*?Compare/);
  assert.match(arena, /spark-arena:compare-program-team/);
  assert.match(market, /window\.addEventListener\("spark-arena:compare-program-team"/);
  assert.match(market, /TASK-DRIVEN COMPANY SEARCH/);
});

test("agentic recommendations open the existing verified company profile directly", () => {
  assert.match(community, /class="agentic-result-card"[\s\S]*?data-recommended-product-id/);
  assert.match(community, /type="button"[\s\S]*?기업 프로필 보기/);
  assert.match(community, /spark-arena:open-program-team/);
  assert.match(arena, /window\.addEventListener\("spark-arena:open-program-team", handleRecommendedCompanyOpen\)/);
  assert.match(arena, /productId\.startsWith\("program-team-"\)/);
  assert.match(arena, /function handleRecommendedCompanyOpen[\s\S]*?openTeamDialog\(team\)/);
  assert.match(css, /\.agentic-result-card:focus-visible/);
});

test("agentic recommendation cards explain the grounded match in structured detail", () => {
  assert.match(community, /function recommendationEvidence\(match = \{\}\)/);
  assert.match(community, /recommendationLens/);
  assert.match(community, /service_focus/);
  assert.match(community, /핵심 역량/);
  assert.match(community, /요청어 일치/);
  assert.match(community, /산업·업무 영역/);
  assert.match(community, /확인 질문/);
  assert.match(community, /agentic-results-policy/);
  assert.match(css, /\.agentic-evidence-list/);
});
