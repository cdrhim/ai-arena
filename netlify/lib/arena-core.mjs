import crypto from "node:crypto";

import { ARENA_SEED } from "./arena-data.mjs";
import { applySubmissionEvent, publishedSubmissionsToStartups } from "./arena-submissions.mjs";

const FORBIDDEN_SUBMISSION_KEYS = new Set(["code", "script", "source", "sourceCode", "notebook", "dockerfile"]);
const STAGE_ORDER = ["Pre-Seed", "Seed", "Series A", "Growth"];

export function buildArenaSnapshot(events = [], now = new Date().toISOString(), persistedSubmissions = []) {
  const state = cloneSeed();
  state.upvoteVoters = new Set();
  state.submissions = persistedSubmissions.map((submission) => ({ ...submission }));
  for (const event of events) {
    if (event?.type?.startsWith("submission_")) applyArenaEvent(state, event);
  }
  state.startups.push(...publishedSubmissionsToStartups(state.submissions));
  for (const event of events) {
    if (!event?.type?.startsWith("submission_")) applyArenaEvent(state, event);
  }

  const leaderboards = state.challenges.map((challenge) => computeChallengeLeaderboard(challenge, state));
  const startupScores = scoreStartups(state.startups, leaderboards, state.connectionRequests);
  const submissionsById = new Map(state.submissions.map((submission) => [submission.id, submission]));
  const matches = Object.fromEntries(
    state.startups.map((startup) => [startup.id, matchConnectionProfiles(startup, state.connectionProfiles)])
  );

  return {
    generatedAt: now,
    source: {
      concept: "How to Build an AI Arena.pdf",
      appendix: "Building an AI Arena System.docx"
    },
    startups: state.startups.map((startup) => ({
      ...startup,
      arenaScore: startupScores.get(startup.id) || 0,
      techStack: extractTechStack(startup, submissionsById.get(startup.id)),
      products: startup.products.map((product) => ({ ...product }))
    })),
    challenges: state.challenges.map((challenge) => ({ ...challenge })),
    leaderboards,
    matches,
    connectionProfiles: state.connectionProfiles.map((profile) => ({ ...profile })),
    connectionRequests: state.connectionRequests.map((request) => ({ ...request })),
    bountyRequests: (state.bountyRequests || []).map((request) => ({ ...request })),
    submissions: state.submissions.map((submission) => ({ ...submission })),
    metrics: summarizeArena(state, leaderboards),
    architecture: productionArchitectureStatus()
  };
}

export function createArenaEvent(action, payload, now = new Date().toISOString(), viewer = null, context = {}) {
  if (action === "upvoteProduct") {
    const error = new Error("Peer popularity voting is disabled. Teams are compared with evidence, not social votes.");
    error.status = 410;
    throw error;
  }

  if (action === "requestConnection") {
    const request = validateConnectionRequest(payload, now, viewer);
    return { id: request.id, type: "connection_requested", request, createdAt: now };
  }

  if (action === "requestBounty") {
    const request = validateBountyRequest(payload, now, viewer);
    return { id: request.id, type: "bounty_requested", request, createdAt: now };
  }

  if (action === "updateConnectionRequest") {
    const update = validatePipelineUpdate(payload, now, viewer, "connection");
    return { id: eventId("connection_update", `${update.requestId}:${update.status}`, now), type: "connection_request_updated", update, createdAt: now };
  }

  if (action === "respondToConnectionRequest") {
    const update = validateMemberConnectionResponse(payload, now, viewer, context.snapshot);
    return { id: eventId("connection_consent", `${update.requestId}:${update.founderConsent}`, now), type: "connection_request_updated", update, createdAt: now };
  }

  if (action === "updateBountyRequest") {
    const update = validatePipelineUpdate(payload, now, viewer, "bounty");
    return { id: eventId("bounty_update", `${update.requestId}:${update.status}`, now), type: "bounty_request_updated", update, createdAt: now };
  }

  if (action === "submitBenchmark") {
    const submission = validateBenchmarkSubmission(payload, now);
    return { id: submission.id, type: "benchmark_submitted", submission, createdAt: now };
  }

  if (action === "recordVote") {
    const vote = validatePairwiseVote(payload, now);
    return { id: vote.id, type: "pairwise_vote_recorded", vote, createdAt: now };
  }

  throw new Error(`Unsupported arena action: ${action || "missing"}`);
}

export function applyArenaEvent(state, event) {
  if (!event || typeof event !== "object") return state;

  if (event.type?.startsWith("submission_")) {
    return applySubmissionEvent(state, event);
  }

  if (event.type === "product_upvoted") {
    const voterKey = event.voterKey || event.voterEmail || event.id;
    const voteKey = `${event.productId}:${voterKey}`;
    if (state.upvoteVoters?.has(voteKey)) return state;
    for (const startup of state.startups) {
      const product = startup.products.find((item) => item.id === event.productId);
      if (!product) continue;
      state.upvoteVoters?.add(voteKey);
      product.upvotes += 1;
      startup.upvotes += 1;
      return state;
    }
    return state;
  }

  if (event.type === "connection_requested" && event.request) {
    const startup = state.startups.find((item) => item.id === event.request.startupId);
    if (startup) {
      startup.demoRequests += 1;
      if (/invest/i.test(event.request.intent || "")) startup.investorInterest += 1;
      if (/pilot|demo|corporate/i.test(event.request.intent || "")) startup.corporateInterest += 1;
    }
    state.connectionRequests.unshift(event.request);
    return state;
  }

  if (event.type === "bounty_requested" && event.request) {
    if (!Array.isArray(state.bountyRequests)) state.bountyRequests = [];
    state.bountyRequests.unshift(event.request);
    return state;
  }

  if (event.type === "connection_request_updated" && event.update) {
    const request = state.connectionRequests.find((item) => item.id === event.update.requestId);
    if (request) Object.assign(request, event.update);
    return state;
  }

  if (event.type === "bounty_request_updated" && event.update) {
    if (!Array.isArray(state.bountyRequests)) state.bountyRequests = [];
    const request = state.bountyRequests.find((item) => item.id === event.update.requestId);
    if (request) Object.assign(request, event.update);
    return state;
  }

  if (event.type === "benchmark_submitted" && event.submission) {
    state.benchmarkSubmissions.unshift(event.submission);
    const startup = state.startups.find((item) => item.id === event.submission.startupId);
    if (startup) startup.benchmarkScore = Math.max(startup.benchmarkScore || 0, event.submission.score);
    return state;
  }

  if (event.type === "pairwise_vote_recorded" && event.vote) {
    state.pairwiseVotes.unshift(event.vote);
  }

  return state;
}

export function validateBenchmarkSubmission(payload, now = new Date().toISOString()) {
  assertPlainObject(payload, "submission");
  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_SUBMISSION_KEYS.has(key)) {
      throw new Error("Raw code submissions require the production E2B sandbox path and are disabled in this Netlify MVP.");
    }
  }

  const challengeId = requiredString(payload, "challengeId", 80);
  const startupId = requiredString(payload, "startupId", 80);
  const score = boundedNumber(payload, "score", 0, 100);
  const latencyMs = optionalBoundedNumber(payload, "latencyMs", 0, 120000);
  const costPer1k = optionalBoundedNumber(payload, "costPer1k", 0, 1000);
  const sandboxReceipt = optionalString(payload, "sandboxReceipt", 160);

  return {
    id: eventId("sub", `${challengeId}:${startupId}:${score}`, now),
    challengeId,
    startupId,
    score,
    latencyMs,
    costPer1k,
    sandboxReceipt,
    createdAt: now
  };
}

export function validateConnectionRequest(payload, now = new Date().toISOString(), viewer = null) {
  assertPlainObject(payload, "connection request");
  const startupId = requiredString(payload, "startupId", 80);
  const intent = requiredString(payload, "intent", 80);
  const organization = optionalString(payload, "organization", 120) || optionalString(viewer || {}, "organization", 120) || "B2B partner";
  const name = requiredString(payload, "name", 120);
  const email = viewer?.email || requiredString(payload, "email", 160);
  const message = optionalString(payload, "message", 800);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid email is required.");
  }

  return {
    id: eventId("req", `${startupId}:${email}:${intent}`, now),
    startupId,
    intent,
    organization,
    name,
    email,
    requesterUserId: viewer?.id || null,
    requesterEmail: viewer?.email || email,
    requesterRole: viewer?.role || "",
    message,
    status: "interest",
    requesterConsent: "accepted",
    requesterConsentAt: now,
    founderConsent: "pending",
    founderConsentAt: null,
    introductionPolicy: "double_opt_in",
    nextStep: "SparkLabs qualification before founder review",
    updatedAt: now,
    createdAt: now
  };
}

export function validateMemberConnectionResponse(payload, now = new Date().toISOString(), viewer = null, snapshot = null) {
  assertPlainObject(payload, "connection response");
  const requestId = requiredString(payload, "requestId", 100);
  const decision = requiredString(payload, "decision", 20);
  if (!["accepted", "declined"].includes(decision)) throw statusError("Connection decision must be accepted or declined.", 400);
  const request = (snapshot?.connectionRequests || []).find((item) => item.id === requestId);
  if (!request) throw statusError("Connection request not found.", 404);
  if (!viewer?.canScore) {
    const ownsTarget = (snapshot?.submissions || []).some(
      (submission) =>
        submission.id === request.startupId &&
        (submission.ownerId === viewer?.id || submission.ownerEmail === viewer?.email)
    );
    if (!ownsTarget) throw statusError("Only the requested member company can respond.", 403);
    if (!["qualified", "founder_review"].includes(request.status)) {
      throw statusError("SparkLabs must qualify the request before member review.", 409);
    }
  }
  return {
    requestId,
    status: decision === "accepted" ? "mutually_accepted" : "declined",
    founderConsent: decision,
    founderConsentAt: now,
    founderConsentByUserId: viewer?.id || null,
    nextStep: decision === "accepted" ? "SparkLabs schedules the consented introduction" : "Close without sharing contact details",
    updatedBy: viewer?.email || "",
    updatedAt: now
  };
}

export function validateBountyRequest(payload, now = new Date().toISOString(), viewer = null) {
  assertPlainObject(payload, "bounty request");
  const problemTitle = requiredString(payload, "problemTitle", 160);
  const problem = requiredString(payload, "problem", 1600);
  const targetKpi = requiredString(payload, "targetKpi", 500);
  const currentWorkflow = optionalString(payload, "currentWorkflow", 1200);
  const dataAvailability = optionalString(payload, "dataAvailability", 800);
  const constraints = optionalString(payload, "constraints", 1000);
  const budget = optionalString(payload, "budget", 200);
  const pilotBudget = optionalString(payload, "pilotBudget", 200);
  const deadline = optionalString(payload, "deadline", 40);
  const visibility = ["invite_only", "arena_members", "public"].includes(String(payload.visibility || ""))
    ? String(payload.visibility)
    : "invite_only";
  const contactName = requiredString(payload, "contactName", 120);
  const staffSubmittingForPartner = Boolean(viewer?.canScore);
  const requesterEmail = staffSubmittingForPartner
    ? optionalString(payload, "requesterEmail", 160) || viewer?.email || ""
    : viewer?.email || requiredString(payload, "requesterEmail", 160);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) throw new Error("A valid requester email is required.");
  const organization = staffSubmittingForPartner
    ? optionalString(payload, "organization", 160) || optionalString(viewer || {}, "organization", 160) || "B2B partner"
    : optionalString(viewer || {}, "organization", 160) || optionalString(payload, "organization", 160) || "B2B partner";
  return {
    id: eventId("bounty_req", `${requesterEmail}:${problemTitle}`, now),
    problemTitle,
    problem,
    currentWorkflow,
    targetKpi,
    dataAvailability,
    constraints,
    budget,
    pilotBudget,
    deadline,
    visibility,
    opportunity: optionalString(payload, "opportunity", 1000),
    evaluationMode: enumString(payload.evaluationMode, ["automatic", "staff_recorded", "hybrid"], "hybrid"),
    evaluationCriteria: optionalStringList(payload, "evaluationCriteria", 12, 160),
    challengeType: enumString(payload.challengeType, ["product_benchmark", "endpoint_eval", "pairwise_validation", "composite"], "product_benchmark"),
    dataPolicy: optionalString(payload, "dataPolicy", 1600),
    rules: optionalString(payload, "rules", 4000),
    contactName,
    requesterEmail,
    requesterUserId: requesterEmail === viewer?.email ? viewer?.id || null : null,
    organization,
    submittedByEmail: viewer?.email || requesterEmail,
    submittedByUserId: viewer?.id || null,
    submittedByRole: viewer?.role || "b2b_partner",
    status: "intake",
    nextStep: "Scope workshop",
    createdAt: now,
    updatedAt: now
  };
}

function validatePipelineUpdate(payload, now, viewer, kind) {
  assertPlainObject(payload, `${kind} pipeline update`);
  const requestId = requiredString(payload, "requestId", 100);
  const allowed = kind === "bounty"
    ? ["intake", "qualified", "design", "published", "evaluating", "pilot", "production", "closed"]
    : ["interest", "qualified", "founder_review", "mutually_accepted", "intro_scheduled", "discovery", "pilot", "production", "expansion", "declined", "closed", "matched", "nda", "proposal"];
  const status = requiredString(payload, "status", 40);
  if (!allowed.includes(status)) throw new Error(`Invalid ${kind} pipeline status.`);
  const update = {
    requestId,
    status,
    nextStep: optionalString(payload, "nextStep", 300),
    internalNote: optionalString(payload, "internalNote", 1000),
    updatedBy: viewer?.email || "",
    updatedAt: now
  };
  if (kind !== "bounty") return update;

  const stringFields = [
    ["problemTitle", 160, true],
    ["problem", 1600, true],
    ["currentWorkflow", 1200, false],
    ["targetKpi", 500, true],
    ["dataAvailability", 800, false],
    ["constraints", 1000, false],
    ["budget", 200, false],
    ["pilotBudget", 200, false],
    ["deadline", 40, false],
    ["opportunity", 1000, false],
    ["dataPolicy", 1600, false],
    ["rules", 4000, false],
    ["contactName", 120, true],
    ["organization", 160, true],
    ["requesterEmail", 160, true]
  ];
  for (const [key, maxLength, required] of stringFields) {
    if (!Object.hasOwn(payload, key)) continue;
    update[key] = required ? requiredString(payload, key, maxLength) : optionalString(payload, key, maxLength);
  }
  if (Object.hasOwn(payload, "requesterEmail") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(update.requesterEmail)) {
    throw new Error("A valid requester email is required.");
  }
  if (Object.hasOwn(payload, "requesterEmail")) {
    update.requesterUserId = update.requesterEmail === viewer?.email ? viewer?.id || null : null;
  }
  if (Object.hasOwn(payload, "visibility")) {
    update.visibility = enumString(payload.visibility, ["invite_only", "arena_members", "public"], "invite_only");
  }
  if (Object.hasOwn(payload, "evaluationMode")) {
    update.evaluationMode = enumString(payload.evaluationMode, ["automatic", "staff_recorded", "hybrid"], "hybrid");
  }
  if (Object.hasOwn(payload, "challengeType")) {
    update.challengeType = enumString(payload.challengeType, ["product_benchmark", "endpoint_eval", "pairwise_validation", "composite"], "product_benchmark");
  }
  if (Object.hasOwn(payload, "evaluationCriteria")) {
    update.evaluationCriteria = optionalStringList(payload, "evaluationCriteria", 12, 160);
  }
  return update;
}

export function validatePairwiseVote(payload, now = new Date().toISOString()) {
  assertPlainObject(payload, "pairwise vote");
  const challengeId = requiredString(payload, "challengeId", 80);
  const winnerId = requiredString(payload, "winnerId", 80);
  const loserId = requiredString(payload, "loserId", 80);
  const outcome = optionalString(payload, "outcome", 20) || "win";
  if (winnerId === loserId) throw new Error("Pairwise vote requires two different startups.");
  if (!["win", "tie"].includes(outcome)) throw new Error("Pairwise outcome must be win or tie.");

  return {
    id: eventId("vote", `${challengeId}:${winnerId}:${loserId}:${outcome}`, now),
    challengeId,
    winnerId,
    loserId,
    outcome,
    createdAt: now
  };
}

export function computeChallengeLeaderboard(challenge, state) {
  const entrants = new Set(challenge.entrants || []);
  for (const submission of state.benchmarkSubmissions) {
    if (submission.challengeId === challenge.id) entrants.add(submission.startupId);
  }
  for (const vote of state.pairwiseVotes) {
    if (vote.challengeId !== challenge.id) continue;
    entrants.add(vote.winnerId);
    entrants.add(vote.loserId);
  }

  const ids = [...entrants];
  const latestScores = latestBenchmarkScores(challenge.id, state.benchmarkSubmissions);
  const ratings = computeBradleyTerryRatings(
    ids,
    state.pairwiseVotes.filter((vote) => vote.challengeId === challenge.id)
  );
  const startupsById = new Map(state.startups.map((startup) => [startup.id, startup]));
  const weights = challenge.weights || { benchmark: 0.6, pairwise: 0.3, traction: 0.1 };

  const rows = ids
    .map((id) => {
      const startup = startupsById.get(id);
      const benchmarkScore = latestScores.get(id)?.score ?? startup?.benchmarkScore ?? 0;
      const pairwiseScore = ratings.get(id)?.score ?? 1000;
      const pairwiseNormalized = clamp((pairwiseScore - 800) / 4, 0, 100);
      const tractionScore = startup ? clamp(startup.demoRequests * 1.8 + startup.corporateInterest * 1.4, 0, 100) : 0;
      const finalScore =
        benchmarkScore * weights.benchmark + pairwiseNormalized * weights.pairwise + tractionScore * weights.traction;

      return {
        startupId: id,
        startupName: startup?.name || id,
        affiliation: startup?.affiliation || "Independent Startup",
        benchmarkScore: round1(benchmarkScore),
        pairwiseScore: Math.round(pairwiseScore),
        confidence: ratings.get(id)?.confidence ?? 0.35,
        tractionScore: round1(tractionScore),
        finalScore: round1(finalScore),
        latestSubmissionAt: latestScores.get(id)?.createdAt || null
      };
    })
    .sort((left, right) => right.finalScore - left.finalScore)
    .map((row, index) => ({ rank: index + 1, ...row }));

  return {
    challengeId: challenge.id,
    title: challenge.title,
    metric: challenge.metric,
    status: challenge.status,
    rows
  };
}

export function computeBradleyTerryRatings(participantIds, votes, options = {}) {
  const ids = [...new Set(participantIds)];
  const indexById = new Map(ids.map((id, index) => [id, index]));
  const strengths = Array(ids.length).fill(0);
  const learningRate = options.learningRate ?? 0.08;
  const iterations = options.iterations ?? 250;
  const regularization = options.regularization ?? 0.02;
  const matchCounts = new Map(ids.map((id) => [id, 0]));

  for (const vote of votes) {
    if (indexById.has(vote.winnerId)) matchCounts.set(vote.winnerId, (matchCounts.get(vote.winnerId) || 0) + 1);
    if (indexById.has(vote.loserId)) matchCounts.set(vote.loserId, (matchCounts.get(vote.loserId) || 0) + 1);
  }

  for (let step = 0; step < iterations; step += 1) {
    const gradient = Array(ids.length).fill(0);
    for (const vote of votes) {
      const winnerIndex = indexById.get(vote.winnerId);
      const loserIndex = indexById.get(vote.loserId);
      if (winnerIndex === undefined || loserIndex === undefined) continue;
      const observed = vote.outcome === "tie" ? 0.5 : 1;
      const probability = logistic(strengths[winnerIndex] - strengths[loserIndex]);
      const delta = observed - probability;
      gradient[winnerIndex] += delta;
      gradient[loserIndex] -= delta;
    }

    for (let i = 0; i < strengths.length; i += 1) {
      gradient[i] -= regularization * strengths[i];
      strengths[i] += learningRate * gradient[i];
    }

    center(strengths);
  }

  return new Map(
    ids.map((id, index) => {
      const matches = matchCounts.get(id) || 0;
      return [
        id,
        {
          strength: strengths[index],
          score: 1000 + strengths[index] * 120,
          confidence: round2(clamp(0.35 + matches / 18, 0.35, 0.96)),
          matches
        }
      ];
    })
  );
}

export function matchConnectionProfiles(startup, profiles, limit = 3) {
  return profiles
    .map((profile) => {
      const stageScore = profile.targetStages.includes(startup.stage) ? 35 : adjacentStageScore(startup.stage, profile.targetStages);
      const categoryScore = profile.focusCategories.includes(startup.category)
        ? 30
        : overlap(profile.focusCategories, startup.functions) * 18;
      const regionScore = profile.preferredRegions.includes(startup.region) || profile.preferredRegions.includes("Global") ? 15 : 0;
      const semanticScore = tokenSimilarity(
        `${startup.name} ${startup.tagline} ${startup.description} ${startup.tags.join(" ")}`,
        `${profile.name} ${profile.thesis} ${profile.focusCategories.join(" ")}`
      );
      const score = clamp(stageScore + categoryScore + regionScore + semanticScore * 20, 0, 100);
      return {
        profileId: profile.id,
        name: profile.name,
        entityType: profile.entityType,
        score: round1(score),
        reason: matchReason(startup, profile, stageScore, categoryScore)
      };
    })
    .filter((match) => match.score >= 30)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function scoreStartups(startups, leaderboards, connectionRequests = []) {
  const bestLeaderboardScore = new Map();
  for (const leaderboard of leaderboards) {
    for (const row of leaderboard.rows) {
      bestLeaderboardScore.set(row.startupId, Math.max(bestLeaderboardScore.get(row.startupId) || 0, row.finalScore));
    }
  }

  const requestsByStartup = countBy(connectionRequests, "startupId");
  return new Map(
    startups.map((startup) => {
      const discovery = clamp(startup.demoRequests * 1.9 + startup.corporateInterest * 1.5, 0, 100);
      const validation = bestLeaderboardScore.get(startup.id) || startup.benchmarkScore || 0;
      const connect = clamp((requestsByStartup.get(startup.id) || 0) * 8 + startup.corporateInterest * 2.2, 0, 100);
      const affiliationBoost = /SparkLabs|SparkClaw/.test(startup.affiliation) ? 3 : 0;
      return [startup.id, round1(discovery * 0.35 + validation * 0.45 + connect * 0.2 + affiliationBoost)];
    })
  );
}

export function summarizeArena(state, leaderboards) {
  return {
    startups: state.startups.length,
    products: state.startups.reduce((total, startup) => total + startup.products.length, 0),
    openChallenges: state.challenges.filter((challenge) => challenge.status === "Open").length,
    benchmarkSubmissions: state.benchmarkSubmissions.length,
    pairwiseVotes: state.pairwiseVotes.length,
    connectionRequests: state.connectionRequests.length,
    bountyRequests: (state.bountyRequests || []).length,
    partnerSubmissions: state.submissions.length,
    pendingPartnerSubmissions: state.submissions.filter((submission) => submission.status === "submitted").length,
    publishedPartnerSubmissions: state.submissions.filter((submission) => submission.status === "published").length,
    topValidatedStartup: topStartupFromLeaderboards(leaderboards),
    sparkAffiliated: state.startups.filter((startup) => /SparkLabs|SparkClaw/.test(startup.affiliation)).length
  };
}

export function productionArchitectureStatus() {
  return [
    {
      module: "Discover",
      current: "Netlify static UI plus validated API payloads",
      production: "Next.js RSC, PostgreSQL, SEO pages, atomic upvotes",
      status: "MVP live"
    },
    {
      module: "Compete",
      current: "Benchmark receipts only; raw code rejected",
      production: "FastAPI orchestration with E2B Firecracker microVM templates",
      status: "Safety gate"
    },
    {
      module: "Validate",
      current: "Bradley-Terry pairwise ranking implemented in JS",
      production: "SciPy L-BFGS-B worker, Redis leaderboard cache, category matrices",
      status: "Functional"
    },
    {
      module: "Connect",
      current: "Hybrid structured/text matching over indexed payloads",
      production: "Qdrant dense vectors, payload indexes, async embedding jobs",
      status: "Functional"
    },
    {
      module: "Member Product Submissions",
      current: "Supabase-authenticated submission workflow backed by Netlify Blob events",
      production: "Postgres RLS tables, object storage buckets, moderation queues",
      status: "MVP live"
    }
  ];
}

const TECH_STACK_CATALOG = [
  ["languages", "Languages & runtimes", "Python", ["python"]],
  ["languages", "Languages & runtimes", "TypeScript", ["typescript"]],
  ["languages", "Languages & runtimes", "JavaScript", ["javascript"]],
  ["languages", "Languages & runtimes", "Java", ["java"]],
  ["languages", "Languages & runtimes", "Kotlin", ["kotlin"]],
  ["languages", "Languages & runtimes", "Swift", ["swift"]],
  ["languages", "Languages & runtimes", "Go", ["golang", "go language"]],
  ["languages", "Languages & runtimes", "Rust", ["rust"]],
  ["languages", "Languages & runtimes", "C++", ["c++"]],
  ["languages", "Languages & runtimes", "Node.js", ["node.js", "nodejs"]],
  ["frameworks", "Frameworks", "React", ["react"]],
  ["frameworks", "Frameworks", "Next.js", ["next.js", "nextjs"]],
  ["frameworks", "Frameworks", "Vue", ["vue.js", "vuejs"]],
  ["frameworks", "Frameworks", "Svelte", ["svelte"]],
  ["frameworks", "Frameworks", "Flutter", ["flutter"]],
  ["frameworks", "Frameworks", "FastAPI", ["fastapi"]],
  ["frameworks", "Frameworks", "Django", ["django"]],
  ["frameworks", "Frameworks", "Flask", ["flask"]],
  ["frameworks", "Frameworks", "Spring", ["spring boot", "spring"]],
  ["frameworks", "Frameworks", "LangChain", ["langchain"]],
  ["frameworks", "Frameworks", "LlamaIndex", ["llamaindex", "llama index"]],
  ["frameworks", "Frameworks", "PyTorch", ["pytorch"]],
  ["frameworks", "Frameworks", "TensorFlow", ["tensorflow"]],
  ["frameworks", "Frameworks", "BullMQ", ["bullmq"]],
  ["ai", "AI & models", "OpenAI", ["openai", "gpt-4", "gpt-5"]],
  ["ai", "AI & models", "Anthropic Claude", ["anthropic", "claude"]],
  ["ai", "AI & models", "Google AI", ["gemini"]],
  ["ai", "AI & models", "Llama", ["llama"]],
  ["ai", "AI & models", "Hugging Face", ["hugging face", "huggingface"]],
  ["ai", "AI & models", "RAG", ["rag", "retrieval augmented"]],
  ["ai", "AI & models", "LLM", ["llm", "large language model"]],
  ["ai", "AI & models", "OCR / Document AI", ["ocr", "document ai"]],
  ["ai", "AI & models", "Computer Vision", ["computer vision", "vision model"]],
  ["ai", "AI & models", "Speech / Voice AI", ["speech", "voice ai", "stt", "tts"]],
  ["data", "Data & storage", "PostgreSQL", ["postgresql", "postgres"]],
  ["data", "Data & storage", "Supabase", ["supabase"]],
  ["data", "Data & storage", "MySQL", ["mysql"]],
  ["data", "Data & storage", "MongoDB", ["mongodb"]],
  ["data", "Data & storage", "Redis", ["redis"]],
  ["data", "Data & storage", "pgvector", ["pgvector"]],
  ["data", "Data & storage", "Pinecone", ["pinecone"]],
  ["data", "Data & storage", "Qdrant", ["qdrant"]],
  ["data", "Data & storage", "Elasticsearch", ["elasticsearch", "elastic search"]],
  ["data", "Data & storage", "BigQuery", ["bigquery"]],
  ["data", "Data & storage", "Snowflake", ["snowflake"]],
  ["infra", "Cloud & infrastructure", "AWS", ["aws", "amazon web services"]],
  ["infra", "Cloud & infrastructure", "Google Cloud", ["google cloud", "gcp"]],
  ["infra", "Cloud & infrastructure", "Microsoft Azure", ["microsoft azure", "azure"]],
  ["infra", "Cloud & infrastructure", "Docker", ["docker"]],
  ["infra", "Cloud & infrastructure", "Kubernetes", ["kubernetes", "k8s"]],
  ["infra", "Cloud & infrastructure", "Vercel", ["vercel"]],
  ["infra", "Cloud & infrastructure", "Netlify", ["netlify"]],
  ["infra", "Cloud & infrastructure", "Cloudflare", ["cloudflare"]],
  ["infra", "Cloud & infrastructure", "NVIDIA", ["nvidia"]],
  ["infra", "Cloud & infrastructure", "Edge deployment", ["edge deployment", "on-device", "on device"]]
];

export function extractTechStack(startup = {}, submission = null) {
  const technical = submission?.technicalProfile || {};
  const declaredValues = [
    ...(technical.stack || []),
    ...(technical.frameworks || []),
    ...(technical.providers || []),
    ...(technical.modalities || []),
    ...(technical.dataSources || [])
  ];
  const evidenceText = [
    startup.name,
    startup.tagline,
    startup.description,
    ...(startup.tags || []),
    ...(startup.functions || []),
    ...(startup.products || []).flatMap((product) => [product.name, product.type, ...(product.useCases || [])]),
    ...declaredValues,
    technical.deployment,
    technical.apiDetails
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const grouped = new Map();
  for (const [key, label, name, aliases] of TECH_STACK_CATALOG) {
    if (!aliases.some((alias) => containsTechTerm(evidenceText, alias))) continue;
    if (!grouped.has(key)) grouped.set(key, { key, label, items: [] });
    grouped.get(key).items.push(name);
  }

  if (submission) {
    const recognized = new Set([...grouped.values()].flatMap((group) => group.items.map((item) => item.toLowerCase())));
    const unclassified = declaredValues.filter((item) => {
      const normalized = String(item || "").trim().toLowerCase();
      if (!normalized) return false;
      return ![...recognized].some((known) => known === normalized || normalized.includes(known) || known.includes(normalized));
    });
    if (unclassified.length) {
      grouped.set("declared", {
        key: "declared",
        label: "Other declared stack",
        items: [...new Set(unclassified.map((item) => String(item).trim()))].slice(0, 16)
      });
    }
  }

  const order = ["languages", "frameworks", "ai", "data", "infra", "declared"];
  const groups = order.map((key) => grouped.get(key)).filter((group) => group?.items?.length);
  const itemCount = groups.reduce((total, group) => total + group.items.length, 0);
  return {
    source: submission ? "team_submitted" : "evidence_extracted",
    sourceLabel: submission ? "Team-submitted Tech Passport" : "Extracted from SparkLabs review materials",
    verification: submission?.review?.staffVerified ? "sparklabs_reviewed" : submission ? "team_supplied" : "evidence_only",
    groups,
    itemCount,
    hasDisclosure: itemCount > 0,
    updatedAt: submission?.updatedAt || null
  };
}

function containsTechTerm(text, alias) {
  const escaped = String(alias).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(text);
}

function latestBenchmarkScores(challengeId, submissions) {
  const latest = new Map();
  for (const submission of submissions) {
    if (submission.challengeId !== challengeId) continue;
    const previous = latest.get(submission.startupId);
    if (!previous || Date.parse(submission.createdAt || 0) >= Date.parse(previous.createdAt || 0)) {
      latest.set(submission.startupId, submission);
    }
  }
  return latest;
}

function topStartupFromLeaderboards(leaderboards) {
  const topRows = leaderboards.flatMap((leaderboard) => leaderboard.rows.slice(0, 1));
  if (!topRows.length) return null;
  return topRows.sort((left, right) => right.finalScore - left.finalScore)[0].startupName;
}

function cloneSeed() {
  const state = JSON.parse(JSON.stringify(ARENA_SEED));
  state.submissions = state.submissions || [];
  return state;
}

function upvoteVoterKey(viewer) {
  const value = String(viewer?.id || viewer?.email || "").trim().toLowerCase();
  if (value) return value;
  const error = new Error("Login required to upvote products.");
  error.status = 401;
  throw error;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label} payload.`);
  }
}

function statusError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requiredString(payload, key, maxLength) {
  const value = String(payload[key] || "").trim();
  if (!value) throw new Error(`${key} is required.`);
  if (value.length > maxLength) throw new Error(`${key} must be ${maxLength} characters or fewer.`);
  return value;
}

function optionalString(payload, key, maxLength) {
  if (payload[key] === null || payload[key] === undefined || payload[key] === "") return null;
  const value = String(payload[key]).trim();
  if (value.length > maxLength) throw new Error(`${key} must be ${maxLength} characters or fewer.`);
  return value;
}

function optionalStringList(payload, key, maxItems, maxLength) {
  const source = Array.isArray(payload[key]) ? payload[key] : String(payload[key] || "").split(/[\n,]+/);
  const values = [...new Set(source.map((item) => String(item || "").trim()).filter(Boolean))];
  if (values.length > maxItems) throw new Error(`${key} must contain ${maxItems} items or fewer.`);
  for (const value of values) {
    if (value.length > maxLength) throw new Error(`${key} items must be ${maxLength} characters or fewer.`);
  }
  return values;
}

function enumString(value, allowed, fallback) {
  const normalized = String(value || "").trim();
  return allowed.includes(normalized) ? normalized : fallback;
}

function boundedNumber(payload, key, min, max) {
  const value = Number(payload[key]);
  if (!Number.isFinite(value)) throw new Error(`${key} must be a number.`);
  if (value < min || value > max) throw new Error(`${key} must be between ${min} and ${max}.`);
  return round2(value);
}

function optionalBoundedNumber(payload, key, min, max) {
  if (payload[key] === null || payload[key] === undefined || payload[key] === "") return null;
  return boundedNumber(payload, key, min, max);
}

function eventId(prefix, material, now) {
  return `${prefix}_${crypto.createHash("sha256").update(`${material}:${now}`).digest("hex").slice(0, 16)}`;
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) {
    counts.set(item[key], (counts.get(item[key]) || 0) + 1);
  }
  return counts;
}

function logistic(value) {
  if (value > 30) return 1;
  if (value < -30) return 0;
  return 1 / (1 + Math.exp(-value));
}

function center(values) {
  if (!values.length) return;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  for (let i = 0; i < values.length; i += 1) values[i] -= mean;
}

function adjacentStageScore(stage, targetStages) {
  const stageIndex = STAGE_ORDER.indexOf(stage);
  if (stageIndex < 0) return 0;
  return targetStages.some((targetStage) => Math.abs(STAGE_ORDER.indexOf(targetStage) - stageIndex) === 1) ? 12 : 0;
}

function overlap(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length;
}

function tokenSimilarity(left, right) {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return intersection / union;
}

function tokens(value) {
  return new Set(
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s-]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );
}

function matchReason(startup, profile, stageScore, categoryScore) {
  const pieces = [];
  if (stageScore >= 35) pieces.push(`${startup.stage} fit`);
  if (categoryScore >= 30) pieces.push(`${startup.category} focus`);
  if (profile.preferredRegions.includes(startup.region)) pieces.push(`${startup.region} mandate`);
  return pieces.length ? pieces.join(" / ") : "semantic thesis overlap";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
