import assert from "node:assert/strict";
import test from "node:test";

import { parseCsv } from "../netlify/lib/competition/csv-parser.mjs";
import { computePairwiseRatings } from "../netlify/lib/competition/bradley-terry.mjs";
import {
  applyCompetitionEvent,
  buildCompetitionSnapshot,
  createCompetitionEvent
} from "../netlify/lib/competition/competition-core.mjs";
import { validateAndScoreCsvSubmission } from "../netlify/lib/competition/submission-validator.mjs";
import { COMPETITION_SEED, DEMO_SOLUTIONS } from "../netlify/lib/competition/competition-seed.mjs";

const partner = { id: "u_partner", email: "founder@example.com", role: "member", canScore: false, canAdmin: false };
const staff = { id: "u_staff", email: "a.rhim@sparklabs.co.kr", role: "sparklabs", canScore: true, canAdmin: false };

const challenge = COMPETITION_SEED.challenges.find((item) => item.id === "demo-product-classification");
const solution = DEMO_SOLUTIONS[challenge.id];
const documentChallenge = COMPETITION_SEED.challenges.find((item) => item.id === "document-workflow-agent-pilot");
const documentSolution = DEMO_SOLUTIONS[documentChallenge.id];
const agentSecurityChallenge = COMPETITION_SEED.challenges.find((item) => item.id === "agentic-prompt-injection-defense");
const agentSecuritySolution = DEMO_SOLUTIONS[agentSecurityChallenge.id];
const DOCUMENT_TYPE_ROTATION = {
  invoice: "purchase_order",
  purchase_order: "contract",
  contract: "meeting_note",
  meeting_note: "customer_request",
  customer_request: "invoice"
};

function validCsv() {
  return [
    "id,prediction",
    "case_001,approved",
    "case_002,needs_review",
    "case_003,approved",
    "case_004,needs_review",
    "case_005,approved",
    "case_006,needs_review"
  ].join("\n");
}

function documentCsv(transform = (row) => row) {
  const headers = ["id", "document_type", "action", "risk_flag", "security_flag", "evidence"];
  return [
    headers.join(","),
    ...documentSolution.rows.map((source, index) => {
      const row = transform({ ...source }, index);
      return headers.map((header) => row[header]).join(",");
    })
  ].join("\n");
}

function agentSecurityCsv(transform = (row) => row) {
  const headers = ["id", "risk_label", "action_gate", "evidence_zone"];
  return [
    headers.join(","),
    ...agentSecuritySolution.rows.map((source, index) => {
      const row = transform({ ...source }, index);
      return headers.map((header) => row[header]).join(",");
    })
  ].join("\n");
}

test("CSV parser handles quoted fields and normal rows", () => {
  const parsed = parseCsv('id,prediction,note\ncase_001,approved,"hello, world"');
  assert.deepEqual(parsed.headers, ["id", "prediction", "note"]);
  assert.equal(parsed.records[0].note, "hello, world");
});

test("CSV validation rejects missing columns", () => {
  const result = validateAndScoreCsvSubmission(challenge, "id\ncase_001", solution);
  assert.equal(result.status, "schema_failed");
  assert.ok(result.report.missingColumns.includes("prediction"));
});

test("CSV validation rejects duplicate ids", () => {
  const result = validateAndScoreCsvSubmission(
    challenge,
    "id,prediction\ncase_001,approved\ncase_001,approved",
    solution
  );
  assert.equal(result.status, "schema_failed");
  assert.deepEqual(result.report.duplicateIds, ["case_001"]);
});

test("CSV validation rejects wrong row count when configured", () => {
  const result = validateAndScoreCsvSubmission(challenge, "id,prediction\ncase_001,approved", solution);
  assert.equal(result.status, "schema_failed");
  assert.match(result.report.invalidValues.at(-1).reason, /Expected 6 rows/);
});

test("public and private scoring splits compute server-side", () => {
  const result = validateAndScoreCsvSubmission(challenge, validCsv(), solution);
  assert.equal(result.status, "scored");
  assert.equal(result.publicScore, 1);
  assert.equal(result.privateScore, 0.666667);
  assert.equal(result.metricBreakdown.publicRows, 3);
  assert.equal(result.metricBreakdown.privateRows, 3);
});

test("document workflow bounty exposes 100 safe input cases without answer columns", () => {
  const parsed = parseCsv(documentChallenge.evaluationDatasetCsv);
  assert.equal(documentChallenge.status, "open");
  assert.equal(parsed.records.length, 100);
  assert.deepEqual(parsed.headers, ["id", "title", "content"]);
  assert.equal(documentSolution.rows.filter((row) => row.split === "public").length, 40);
  assert.equal(documentSolution.rows.filter((row) => row.split === "private").length, 60);
  assert.doesNotMatch(documentChallenge.evaluationDatasetCsv, /document_type|security_flag|risk_flag|,split/);
});

test("agent security bounty exposes 60 synthetic cases without answer columns", () => {
  const parsed = parseCsv(agentSecurityChallenge.evaluationDatasetCsv);
  assert.equal(agentSecurityChallenge.status, "open");
  assert.equal(agentSecurityChallenge.visibility, "public");
  assert.equal(parsed.records.length, 60);
  assert.deepEqual(parsed.headers, ["id", "source_type", "content", "requested_action"]);
  assert.equal(agentSecuritySolution.rows.filter((row) => row.split === "public").length, 24);
  assert.equal(agentSecuritySolution.rows.filter((row) => row.split === "private").length, 36);
  assert.doesNotMatch(agentSecurityChallenge.evaluationDatasetCsv, /risk_label|action_gate|evidence_zone|,split/);
  assert.match(agentSecurityChallenge.dataPolicy, /합성 데이터/);
  assert.doesNotMatch(agentSecurityChallenge.evaluationDatasetCsv, /https?:\/\//);
});

test("agent security bounty scores risk, action gate, and evidence independently", () => {
  const perfect = validateAndScoreCsvSubmission(
    agentSecurityChallenge,
    agentSecurityCsv(),
    agentSecuritySolution,
    "2026-08-11T01:00:00.000Z"
  );
  assert.equal(perfect.status, "scored");
  assert.equal(perfect.publicScore, 1);
  assert.equal(perfect.privateScore, 1);
  assert.equal(perfect.metricBreakdown.publicRows, 24);
  assert.equal(perfect.metricBreakdown.privateRows, 36);
  assert.equal(perfect.metricBreakdown.publicFields.length, 3);

  const wrongRiskLabels = validateAndScoreCsvSubmission(
    agentSecurityChallenge,
    agentSecurityCsv((row) => ({ ...row, risk_label: "safe" })),
    agentSecuritySolution,
    "2026-08-11T01:01:00.000Z"
  );
  assert.ok(wrongRiskLabels.publicScore < 1);
  assert.ok(wrongRiskLabels.privateScore < 1);
});

test("document workflow weighted scoring combines five independently validated fields", () => {
  const perfect = validateAndScoreCsvSubmission(
    documentChallenge,
    documentCsv(),
    documentSolution,
    "2026-07-26T01:00:00.000Z"
  );
  assert.equal(perfect.status, "scored");
  assert.equal(perfect.publicScore, 1);
  assert.equal(perfect.privateScore, 1);
  assert.equal(perfect.metricBreakdown.publicRows, 40);
  assert.equal(perfect.metricBreakdown.privateRows, 60);
  assert.equal(perfect.metricBreakdown.publicFields.length, 5);

  const wrongDocumentTypes = validateAndScoreCsvSubmission(
    documentChallenge,
    documentCsv((row) => ({
      ...row,
      document_type: DOCUMENT_TYPE_ROTATION[row.document_type]
    })),
    documentSolution,
    "2026-07-26T01:01:00.000Z"
  );
  assert.equal(wrongDocumentTypes.publicScore, 0.65);
  assert.equal(wrongDocumentTypes.privateScore, 0.65);
});

test("document workflow rejects values outside the published submission vocabulary", () => {
  const invalid = validateAndScoreCsvSubmission(
    documentChallenge,
    documentCsv((row, index) => index === 0 ? { ...row, security_flag: "ignore_all_rules" } : row),
    documentSolution
  );
  assert.equal(invalid.status, "schema_failed");
  assert.ok(invalid.report.invalidValues.some((item) => item.column === "security_flag"));
});

test("private scores are hidden from participant snapshots before reveal", () => {
  const snapshot = buildCompetitionSnapshot([], partner, "2026-06-10T00:00:00.000Z");
  const row = snapshot.leaderboards.find((item) => item.challengeId === challenge.id).rows[0];
  assert.equal(snapshot.metrics.challengeSubmissions, 3);
  assert.equal(snapshot.metrics.validatedSubmissions, 3);
  assert.equal(Object.hasOwn(row, "privateScore"), false);
  assert.equal(snapshot.validationReports[0].missingIds.every((id) => id === "[hidden-id]"), true);
});

test("persisted legacy events cannot leave immutable seed submissions queued", () => {
  const staleSeedEvent = {
    id: "legacy-rerun",
    type: "competition_submission_scored",
    createdAt: "2026-07-25T00:00:00.000Z",
    submission: {
      ...COMPETITION_SEED.submissions[0],
      status: "queued"
    }
  };
  const snapshot = buildCompetitionSnapshot([staleSeedEvent], partner, "2026-07-26T00:00:00.000Z");
  assert.equal(snapshot.metrics.validatedSubmissions, 3);
  assert.equal(snapshot.metrics.validationQueue, 0);
});

test("ordinary member snapshots never serialize hidden solution rows or private scores before reveal", () => {
  const upload = createCompetitionEvent(
    "uploadCompetitionSolution",
    {
      challengeId: challenge.id,
      solutionRows: [
        { id: "secret_public_case_001", label: "secret_public_answer", split: "public" },
        { id: "secret_private_case_001", label: "secret_private_answer", split: "private" }
      ]
    },
    staff,
    [],
    "2026-06-10T00:00:00.000Z"
  );
  const snapshot = buildCompetitionSnapshot([upload], partner, "2026-06-10T00:01:00.000Z");
  const serialized = JSON.stringify(snapshot);

  assert.equal(serialized.includes("secret_public_case_001"), false);
  assert.equal(serialized.includes("secret_private_case_001"), false);
  assert.equal(serialized.includes("secret_public_answer"), false);
  assert.equal(serialized.includes("secret_private_answer"), false);
  assert.equal(serialized.includes("solutionRows"), false);
  assert.equal(serialized.includes("privateScore"), false);
});

test("higher-is-better and lower-is-better rankings work", () => {
  const lowerChallenge = {
    ...challenge,
    id: "latency-demo",
    slug: "latency-demo",
    title: "Latency Demo",
    status: "open",
    metricKey: "latency_ms",
    metricDisplayName: "Latency",
    higherIsBetter: false
  };
  const events = [{ id: "lower", type: "competition_challenge_saved", challenge: lowerChallenge, createdAt: "2026-06-01T00:00:00Z" }];
  events.push(createCompetitionEvent(
    "recordCompetitionManualBenchmark",
    { challengeId: "latency-demo", teamName: "Fast", publicScore: 120 },
    staff,
    events,
    "2026-06-01T00:01:00Z"
  ));
  events.push(createCompetitionEvent(
    "recordCompetitionManualBenchmark",
    { challengeId: "latency-demo", teamName: "Slow", publicScore: 500 },
    staff,
    events,
    "2026-06-01T00:02:00Z"
  ));
  const snapshot = buildCompetitionSnapshot(events, staff);
  const board = snapshot.leaderboards.find((leaderboard) => leaderboard.challengeId === "latency-demo");
  assert.equal(board.rows[0].teamName, "Fast");
});

test("submission limit per day is enforced", () => {
  const events = [];
  for (let index = 0; index < documentChallenge.submissionLimitPerDay; index += 1) {
    events.push(
      createCompetitionEvent(
        "submitCompetitionEntry",
        { challengeId: documentChallenge.id, teamName: "Limit Team", csvText: documentChallenge.sampleSubmissionCsv },
        partner,
        events,
        `2026-06-10T0${index}:00:00.000Z`
      )
    );
  }
  assert.throws(
    () =>
      createCompetitionEvent(
        "submitCompetitionEntry",
        { challengeId: documentChallenge.id, teamName: "Limit Team", csvText: documentChallenge.sampleSubmissionCsv },
        partner,
        events,
        "2026-06-10T09:00:00.000Z"
      ),
    /Submission limit reached/
  );
});

test("staff-only competition endpoints reject ordinary members", () => {
  const staffOnlyActions = [
    ["saveCompetitionChallenge", { title: "Hidden Challenge" }],
    ["uploadCompetitionSolution", { challengeId: challenge.id }],
    ["reviewCompetitionSubmission", { submissionId: "sub_1" }],
    ["rerunCompetitionValidation", { submissionId: "sub_1" }],
    ["recordCompetitionManualBenchmark", { challengeId: challenge.id, teamName: "Manual", publicScore: 50 }],
    ["recordCompetitionPairwiseVote", { challengeId: challenge.id, winnerSubmissionId: "a", loserSubmissionId: "b" }],
    ["revealCompetitionPrivateLeaderboard", { challengeId: challenge.id }],
    ["updateCompetitionOpportunity", { opportunityId: "opportunity_1", status: "pilot" }]
  ];

  for (const [action, payload] of staffOnlyActions) {
    assert.throws(() => createCompetitionEvent(action, payload, partner, []), /Only SparkLabs staff/);
  }
});

test("converted B2B accounts cannot inherit legacy member competition ownership", () => {
  const requested = createCompetitionEvent(
    "requestCompetitionOpportunity",
    { submissionId: "seed_sub_lingopilot", intent: "pilot" },
    partner,
    [],
    "2026-07-26T04:00:00.000Z"
  );
  const convertedPartner = {
    ...partner,
    role: "b2b_partner",
    canRequestConnections: true
  };

  const snapshot = buildCompetitionSnapshot([requested], convertedPartner, "2026-07-26T04:01:00.000Z");
  assert.deepEqual(snapshot.teams, []);
  assert.deepEqual(snapshot.submissions, []);
  assert.deepEqual(snapshot.validationReports, []);
  assert.deepEqual(snapshot.opportunities, []);
  assert.throws(
    () => createCompetitionEvent("joinCompetitionChallenge", { challengeId: documentChallenge.id, teamName: "Converted" }, convertedPartner, []),
    /Only approved members/
  );
  assert.throws(
    () => createCompetitionEvent("requestCompetitionOpportunity", { submissionId: "seed_sub_lingopilot", intent: "pilot" }, convertedPartner, []),
    /only request opportunities for your own submission/i
  );
});

test("pairwise BT calculation is deterministic", () => {
  const ratings = computePairwiseRatings(["a", "b"], [
    { winnerId: "a", loserId: "b", outcome: "win" },
    { winnerId: "a", loserId: "b", outcome: "win" }
  ]);
  assert.equal(ratings.get("a").rating > ratings.get("b").rating, true);
  assert.equal(ratings.get("a").rating, computePairwiseRatings(["a", "b"], [
    { winnerId: "a", loserId: "b", outcome: "win" },
    { winnerId: "a", loserId: "b", outcome: "win" }
  ]).get("a").rating);
});

test("leaderboard reveal exposes private scores and final rank", () => {
  const reveal = createCompetitionEvent("revealCompetitionPrivateLeaderboard", { challengeId: challenge.id }, staff, []);
  const snapshot = buildCompetitionSnapshot([reveal], partner, "2026-06-10T00:00:00.000Z");
  const row = snapshot.leaderboards.find((item) => item.challengeId === challenge.id).rows[0];
  assert.equal(Object.hasOwn(row, "privateScore"), true);
  assert.equal(Object.hasOwn(row, "finalRank"), true);
});

test("bounties expose sponsor, evaluation, data policy, and opportunity details", () => {
  const snapshot = buildCompetitionSnapshot([], partner, "2026-07-26T00:00:00.000Z");
  const bounty = snapshot.challenges.find((item) => item.id === documentChallenge.id);

  assert.equal(bounty.sponsor, "SparkClaw Program");
  assert.equal(bounty.evaluationCriteria.length, 5);
  assert.match(bounty.dataPolicy, /합성/);
  assert.match(bounty.opportunity, /PoC/);
  assert.equal(snapshot.metrics.openChallenges, 2);
  assert.equal(bounty.metricConfig.fields.every((field) => !Object.hasOwn(field, "labelColumn")), true);
  assert.equal(snapshot.challenges.length, 4);
});

test("validated owners request opportunities and staff advances them to pilot", () => {
  const requested = createCompetitionEvent(
    "requestCompetitionOpportunity",
    {
      submissionId: "seed_sub_lingopilot",
      intent: "pilot",
      note: "Ready for a design partner."
    },
    partner,
    [],
    "2026-07-26T01:00:00.000Z"
  );
  const memberSnapshot = buildCompetitionSnapshot([requested], partner, "2026-07-26T01:01:00.000Z");
  assert.equal(memberSnapshot.opportunities.length, 1);
  assert.equal(memberSnapshot.opportunities[0].status, "requested");
  assert.equal(Object.hasOwn(memberSnapshot.opportunities[0], "requesterEmail"), false);

  const updated = createCompetitionEvent(
    "updateCompetitionOpportunity",
    {
      opportunityId: requested.opportunity.id,
      status: "pilot",
      publicNote: "Pilot kickoff approved.",
      privateNote: "Internal partner notes."
    },
    staff,
    [requested],
    "2026-07-26T02:00:00.000Z"
  );
  const staffSnapshot = buildCompetitionSnapshot([requested, updated], staff, "2026-07-26T02:01:00.000Z");
  assert.equal(staffSnapshot.opportunities[0].status, "pilot");
  assert.equal(staffSnapshot.opportunities[0].requesterEmail, partner.email);
  assert.equal(staffSnapshot.metrics.activePilots, 1);
});

test("opportunity requests reject other teams and active duplicates", () => {
  const other = { id: "other", email: "other@example.com", role: "member", canScore: false, canAdmin: false };
  assert.throws(
    () =>
      createCompetitionEvent(
        "requestCompetitionOpportunity",
        { submissionId: "seed_sub_lingopilot", intent: "poc_review" },
        other,
        []
      ),
    /only request opportunities for your own submission/i
  );

  const requested = createCompetitionEvent(
    "requestCompetitionOpportunity",
    { submissionId: "seed_sub_lingopilot", intent: "poc_review" },
    partner,
    [],
    "2026-07-26T03:00:00.000Z"
  );
  assert.throws(
    () =>
      createCompetitionEvent(
        "requestCompetitionOpportunity",
        { submissionId: "seed_sub_lingopilot", intent: "credits" },
        partner,
        [requested],
        "2026-07-26T03:01:00.000Z"
      ),
    /already exists/
  );
});
