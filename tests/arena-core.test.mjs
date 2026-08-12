import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArenaSnapshot,
  computeBradleyTerryRatings,
  createArenaEvent,
  extractTechStack,
  matchConnectionProfiles,
  validateBenchmarkSubmission,
  validateBountyRequest,
  validateMemberConnectionResponse
} from "../netlify/lib/arena-core.mjs";
import { ARENA_SEED } from "../netlify/lib/arena-data.mjs";

test("benchmark submission rejects raw code fields until sandbox integration exists", () => {
  const challenge = ARENA_SEED.challenges[0];
  const startupId = challenge.entrants[0];
  assert.throws(
    () =>
      validateBenchmarkSubmission({
        challengeId: challenge.id,
        startupId,
        score: 91,
        code: "print('unsafe')"
      }),
    /Raw code submissions require the production E2B sandbox path/
  );
});

test("Bradley-Terry ratings rank repeated winners above repeated losers", () => {
  const ratings = computeBradleyTerryRatings(
    ["alpha", "beta"],
    [
      { winnerId: "alpha", loserId: "beta", outcome: "win" },
      { winnerId: "alpha", loserId: "beta", outcome: "win" },
      { winnerId: "alpha", loserId: "beta", outcome: "win" }
    ]
  );

  assert.ok(ratings.get("alpha").score > ratings.get("beta").score);
  assert.ok(ratings.get("alpha").confidence > 0.35);
});

test("hybrid matchmaking respects structured stage and category filters", () => {
  const healthcareApplicant = ARENA_SEED.startups.find((startup) => startup.category === "Healthcare / Bio");
  const matches = matchConnectionProfiles(healthcareApplicant, ARENA_SEED.connectionProfiles);

  assert.equal(matches[0].profileId, "healthcare-bio-review-board");
  assert.ok(matches[0].score > 70);
});

test("arena snapshot applies connection events without creating peer votes", () => {
  const targetStartup = ARENA_SEED.startups[0];
  const targetProduct = targetStartup.products[0];
  const previousUpvotes = targetProduct.upvotes;
  const request = createArenaEvent(
    "requestConnection",
    {
      startupId: targetStartup.id,
      intent: "Investor review",
      organization: "SparkLabs",
      name: "Investor",
      email: "investor@example.com",
      message: "Review request"
    },
    "2026-06-07T00:01:00.000Z"
  );

  const snapshot = buildArenaSnapshot([request], "2026-06-07T00:02:00.000Z");
  const updated = snapshot.startups.find((startup) => startup.id === targetStartup.id);

  assert.equal(updated.products[0].upvotes, previousUpvotes);
  assert.equal(snapshot.connectionRequests.length, 2);
  assert.equal(snapshot.metrics.connectionRequests, 2);
  assert.equal(request.request.introductionPolicy, "double_opt_in");
  assert.equal(request.request.requesterConsent, "accepted");
  assert.equal(request.request.founderConsent, "pending");
});

test("member connection response enforces ownership, qualification, and double opt-in", () => {
  const member = { id: "member_1", email: "founder@example.com", role: "member" };
  const snapshot = {
    submissions: [{ id: "startup_1", ownerId: member.id, ownerEmail: member.email }],
    connectionRequests: [{ id: "request_1", startupId: "startup_1", status: "founder_review" }]
  };
  const accepted = validateMemberConnectionResponse(
    { requestId: "request_1", decision: "accepted" },
    "2026-08-07T00:00:00.000Z",
    member,
    snapshot
  );
  assert.equal(accepted.status, "mutually_accepted");
  assert.equal(accepted.founderConsent, "accepted");
  assert.throws(
    () => validateMemberConnectionResponse({ requestId: "request_1", decision: "accepted" }, "2026-08-07T00:00:00.000Z", { ...member, id: "other", email: "other@example.com" }, snapshot),
    /requested member company/
  );
});

test("B2B bounty briefs persist as governed intake records", () => {
  const viewer = { id: "buyer_1", email: "buyer@partner.com", role: "b2b_partner", organization: "Partner Co" };
  const request = validateBountyRequest(
    {
      problemTitle: "Reduce Korean contract review time",
      problem: "Legal teams manually review every clause and cannot scale.",
      currentWorkflow: "Email attachments and spreadsheet tracking.",
      targetKpi: "Reduce review time by 80% while maintaining 95% clause recall.",
      dataAvailability: "500 de-identified contracts.",
      constraints: "Korea region and no training on customer data.",
      budget: "KRW 10M",
      pilotBudget: "KRW 30M",
      visibility: "invite_only",
      contactName: "Buyer One"
    },
    "2026-07-28T00:00:00.000Z",
    viewer
  );
  const event = createArenaEvent("requestBounty", request, "2026-07-28T00:00:00.000Z", viewer);
  const snapshot = buildArenaSnapshot([event], "2026-07-28T00:01:00.000Z");

  assert.equal(request.requesterEmail, viewer.email);
  assert.equal(request.status, "intake");
  assert.equal(snapshot.bountyRequests.length, 1);
  assert.equal(snapshot.metrics.bountyRequests, 1);
});

test("tech stack extraction structures evidence without inventing a global score", () => {
  const startup = ARENA_SEED.startups.find((item) => item.name === "비바시티");
  const techStack = extractTechStack(startup);
  const items = techStack.groups.flatMap((group) => group.items);

  assert.equal(techStack.source, "evidence_extracted");
  assert.ok(items.includes("BullMQ"));
  assert.ok(items.includes("Redis"));
  assert.ok(items.includes("pgvector"));
  assert.ok(items.includes("RAG"));
  assert.equal(Object.hasOwn(techStack, "score"), false);
});

test("peer product upvotes are disabled for every viewer", () => {
  const targetProduct = ARENA_SEED.startups[0].products[0];
  const memberViewer = { id: "member_1", email: "member@example.com", role: "member" };

  for (const viewer of [memberViewer, null]) {
    assert.throws(
      () => createArenaEvent("upvoteProduct", { productId: targetProduct.id }, "2026-06-07T00:01:00.000Z", viewer),
      (error) => {
        assert.equal(error.status, 410);
        assert.match(error.message, /Peer popularity voting is disabled/);
        return true;
      }
    );
  }
});
