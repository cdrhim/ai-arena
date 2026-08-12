import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildSimilarTeamRecommendations,
  similarTeamSourceFingerprint,
  SIMILAR_TEAM_ALGORITHM_VERSION
} from "../netlify/lib/similar-team-recommendations.mjs";
import { storeSimilarTeamRecommendations } from "../netlify/lib/similar-team-recommendations-store.mjs";

test("Claw Member similar-team recommendations exclude self and expose grounded similarity reasons", () => {
  const viewerTeam = factoryTeam("viewer", "Computer Vision", "Manufacturing");
  const candidateTeams = [
    viewerTeam,
    factoryTeam("factory-peer", "Computer Vision", "Manufacturing"),
    factoryTeam("factory-peer-two", "Quality Inspection", "Manufacturing"),
    factoryTeam("health-peer", "Healthcare", "Healthcare")
  ];

  const result = buildSimilarTeamRecommendations({ candidateTeams, viewerTeam, limit: 6 });

  assert.equal(result.status, "ready");
  assert.equal(result.algorithmVersion, SIMILAR_TEAM_ALGORITHM_VERSION);
  assert.equal(result.population, 3);
  assert.ok(result.recommendations.length >= 2);
  assert.ok(result.recommendations.every((item) => item.teamId !== "viewer"));
  assert.ok(result.recommendations.every((item) => item.reason.includes("팀입니다")));
  assert.ok(result.recommendations.every((item) => item.score >= 0 && item.score <= 100));
  assert.deepEqual(result.recommendations.map((item) => item.rank), result.recommendations.map((_, index) => index + 1));
});

test("similar-team fingerprint is stable across candidate ordering and changes with profile data", () => {
  const viewerTeam = factoryTeam("viewer", "Computer Vision", "Manufacturing");
  const first = factoryTeam("one", "Computer Vision", "Manufacturing");
  const second = factoryTeam("two", "LLM", "SaaS");
  const forward = similarTeamSourceFingerprint({ viewerTeam, candidateTeams: [first, second] });
  const reverse = similarTeamSourceFingerprint({ viewerTeam, candidateTeams: [second, first] });
  const changed = similarTeamSourceFingerprint({ viewerTeam, candidateTeams: [{ ...first, serviceSummary: "changed" }, second] });

  assert.match(forward, /^[0-9a-f]{64}$/);
  assert.equal(forward, reverse);
  assert.notEqual(forward, changed);
});

test("similar-team store writes only through the service RPC with bounded recommendation data", async () => {
  let request;
  const result = await storeSimilarTeamRecommendations({
    viewer: { id: "11111111-1111-4111-8111-111111111111" },
    subjectTeam: { id: "viewer", name: "Viewer Team" },
    recommendations: [{
      teamId: "peer",
      teamName: "Peer Team",
      rank: 1,
      score: 88,
      reason: "Computer Vision 역량과 적용 맥락이 유사한 팀입니다.",
      sharedSignals: ["Computer Vision"],
      evidence: ["프로필에 명시된 역량: Computer Vision"]
    }],
    algorithmVersion: SIMILAR_TEAM_ALGORITHM_VERSION,
    sourceFingerprint: "a".repeat(64),
    candidatePopulation: 75,
    env: {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "sb_secret_example"
    },
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify("22222222-2222-4222-8222-222222222222"), { status: 200 });
    }
  });

  assert.equal(result.stored, true);
  assert.match(request.url, /\/rest\/v1\/rpc\/sc_arena_publish_similarity_run$/);
  assert.equal(request.options.headers.apikey, "sb_secret_example");
  assert.equal(request.options.headers.Authorization, undefined);
  assert.equal(request.body.p_candidate_population, 75);
  assert.equal(request.body.p_recommendations[0].candidate_team_key, "peer");
});

test("schema and Compare UI keep recommendations private, relational, and user-selected", async () => {
  const [migration, html, client, css, netlify] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260812123000_sc_arena_similar_team_recommendations.sql", import.meta.url), "utf8"),
    readFile(new URL("../public/arena/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/arena/market.js", import.meta.url), "utf8"),
    readFile(new URL("../public/arena/market.css", import.meta.url), "utf8"),
    readFile(new URL("../netlify.toml", import.meta.url), "utf8")
  ]);

  assert.match(migration, /create table if not exists public\.sc_arena_similarity_runs/i);
  assert.match(migration, /create table if not exists public\.sc_arena_similarity_recommendations/i);
  assert.match(migration, /references public\.sc_arena_organizations/i);
  assert.match(migration, /force row level security/i);
  assert.match(migration, /to service_role/i);
  assert.doesNotMatch(migration, /grant\s+(?:select|insert|update|delete)\s+on[\s\S]+to authenticated/i);
  assert.match(html, /id="similarTeamPanel"[\s\S]+TEAMS LIKE MINE/);
  assert.match(client, /isClawMemberViewer\(\)[\s\S]+loadSimilarTeamRecommendations/);
  assert.match(client, /data-similar-team-compare/);
  assert.match(client, /비교 슬롯은 직접 선택/);
  assert.match(css, /\.similar-team-list\s*\{[\s\S]*grid-template-columns/);
  assert.match(netlify, /from = "\/api\/similar-team-recommendations"/);
});

function factoryTeam(id, capability, sector) {
  return {
    id,
    name: `Team ${id}`,
    sector,
    domain: `${sector} workflow`,
    oneLiner: `${capability} 기반 ${sector} 자동화`,
    serviceSummary: `${capability} technology for ${sector} workflow automation and operations.`,
    aiIdeaSummary: `${capability} AI application`,
    matchingKeywords: [sector, capability, "Workflow Automation"]
  };
}
