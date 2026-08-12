import assert from "node:assert/strict";
import test from "node:test";

import arena, { filterStartupTechStacksForViewer } from "../netlify/functions/arena.mjs";

test("ordinary members cannot call privileged Arena API actions directly", async () => {
  const previous = captureEnv(["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"]);
  const originalFetch = global.fetch;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_KEY;

  global.fetch = async (url) => {
    if (String(url).includes("/auth/v1/user")) {
      return Response.json({ id: "ordinary_member", email: "ordinary.member@example.com", app_metadata: { role: "member" } });
    }
    if (String(url).includes("/rest/v1/arena_submissions")) {
      return Response.json([]);
    }
    return originalFetch(url);
  };

  const privilegedActions = [
    ["submitBenchmark", { challengeId: "challenge_1", startupId: "startup_1", score: 90 }],
    ["recordVote", { challengeId: "challenge_1", winnerId: "a", loserId: "b" }],
    ["publishSubmission", { id: "submission_1" }],
    ["nominateHumanValidation", { id: "submission_1" }],
    ["assignHumanValidator", { id: "submission_1", reviewerEmail: "mentor@example.com" }],
    ["issueHumanValidationBadge", { id: "submission_1" }],
    ["requestMoreEvidence", { id: "submission_1", note: "Add evidence." }],
    ["revokeHumanValidationBadge", { id: "submission_1" }],
    ["requestBounty", { problemTitle: "Private brief" }],
    ["updateConnectionRequest", { requestId: "request_1", status: "pilot" }],
    ["updateBountyRequest", { requestId: "request_1", status: "published" }],
    ["saveCompetitionChallenge", { title: "Staff Challenge" }],
    ["uploadCompetitionSolution", { challengeId: "demo-product-classification" }],
    ["reviewCompetitionSubmission", { submissionId: "submission_1" }],
    ["rerunCompetitionValidation", { submissionId: "submission_1" }],
    ["recordCompetitionManualBenchmark", { challengeId: "demo-product-classification", teamName: "Manual", publicScore: 80 }],
    ["recordCompetitionPairwiseVote", { challengeId: "demo-product-classification", winnerSubmissionId: "a", loserSubmissionId: "b" }],
    ["revealCompetitionPrivateLeaderboard", { challengeId: "demo-product-classification" }]
  ];

  try {
    for (const [action, payload] of privilegedActions) {
      const response = await arena(
        new Request("https://example.test/api/arena", {
          method: "POST",
          headers: {
            Authorization: "Bearer member-token",
            "content-type": "application/json"
          },
          body: JSON.stringify({ action, payload })
        })
      );
      assert.equal(response.status, 403, `${action} should be denied`);
    }
  } finally {
    global.fetch = originalFetch;
    restoreEnv(previous);
  }
});

test("converted B2B accounts cannot inherit legacy member tech-stack ownership", () => {
  const convertedPartner = {
    id: "legacy_member",
    email: "legacy.member@example.com",
    role: "b2b_partner",
    canScore: false,
    b2bProfileId: "corporate_partner"
  };
  const startups = [
    {
      id: "legacy_submission",
      name: "Legacy Member Product",
      ownerId: convertedPartner.id,
      ownerEmail: convertedPartner.email,
      products: [
        {
          id: "legacy_product",
          links: [
            { type: "github", url: "https://github.com/example/private" },
            { type: "website", url: "https://example.com" }
          ]
        }
      ],
      techStack: {
        groups: [{ label: "Runtime", items: ["Private framework"] }],
        itemCount: 1,
        hasDisclosure: true
      }
    }
  ];
  const submissions = [
    {
      id: "legacy_submission",
      status: "published",
      visibility: "public",
      ownerId: convertedPartner.id,
      ownerEmail: convertedPartner.email,
      technicalProfile: { stackVisibility: "arena_members" }
    }
  ];

  const [visible] = filterStartupTechStacksForViewer(startups, submissions, convertedPartner);

  assert.equal(Object.hasOwn(visible, "ownerId"), false);
  assert.equal(Object.hasOwn(visible, "ownerEmail"), false);
  assert.deepEqual(visible.techStack.groups, []);
  assert.equal(visible.techStack.restricted, true);
  assert.deepEqual(visible.products[0].links, [{ type: "website", url: "https://example.com" }]);
});

test("direct Arena API cannot bypass the staged Claw Member Bounty release gate", async () => {
  const previous = captureEnv([
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "SPARKCLAW_ENABLE_BOUNTIES"
  ]);
  const originalFetch = global.fetch;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.SPARKCLAW_ENABLE_BOUNTIES = "false";
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_KEY;

  global.fetch = async (url) => {
    if (String(url).includes("/auth/v1/user")) {
      return Response.json({ id: "staged_member", email: "member@example.com", app_metadata: { role: "member" } });
    }
    if (String(url).includes("/rest/v1/arena_submissions")) return Response.json([]);
    return originalFetch(url);
  };

  try {
    const response = await arena(new Request("https://example.test/api/arena", {
      method: "POST",
      headers: { Authorization: "Bearer member-token", "content-type": "application/json" },
      body: JSON.stringify({
        action: "joinCompetitionChallenge",
        payload: { challengeId: "document-workflow-agent-pilot", teamName: "Direct bypass" }
      })
    }));
    const payload = await response.json();
    assert.equal(response.status, 423);
    assert.match(payload.error, /Sponsor Brief/);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(previous);
  }
});

function captureEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
