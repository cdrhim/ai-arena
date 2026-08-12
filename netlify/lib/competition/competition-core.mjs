import crypto from "node:crypto";

import { computePairwiseRatings } from "./bradley-terry.mjs";
import { COMPETITION_SEED, DEMO_SOLUTIONS } from "./competition-seed.mjs";
import { parseCsv } from "./csv-parser.mjs";
import { compareScores, normalizeScore } from "./metrics.mjs";
import { validateAndScoreCsvSubmission, validateEndpointUrl } from "./submission-validator.mjs";

const STAFF_ACTIONS = new Set([
  "saveCompetitionChallenge",
  "uploadCompetitionSolution",
  "reviewCompetitionSubmission",
  "rerunCompetitionValidation",
  "recordCompetitionManualBenchmark",
  "recordCompetitionPairwiseVote",
  "revealCompetitionPrivateLeaderboard",
  "updateCompetitionOpportunity"
]);

const PARTICIPANT_ACTIONS = new Set([
  "joinCompetitionChallenge",
  "submitCompetitionEntry",
  "selectCompetitionSubmission",
  "requestCompetitionOpportunity"
]);

export function isCompetitionAction(action) {
  return [
    "saveCompetitionChallenge",
    "uploadCompetitionSolution",
    "joinCompetitionChallenge",
    "submitCompetitionEntry",
    "selectCompetitionSubmission",
    "reviewCompetitionSubmission",
    "rerunCompetitionValidation",
    "recordCompetitionManualBenchmark",
    "recordCompetitionPairwiseVote",
    "revealCompetitionPrivateLeaderboard",
    "requestCompetitionOpportunity",
    "updateCompetitionOpportunity"
  ].includes(action);
}

export function buildCompetitionSnapshot(events = [], viewer = publicViewer(), now = new Date().toISOString(), context = {}) {
  const state = clone(COMPETITION_SEED);
  state.solutions = clone(DEMO_SOLUTIONS);
  for (const event of events) applyCompetitionEvent(state, event);
  restoreSeedSubmissions(state);
  const leaderboards = computeLeaderboards(state);
  const sanitized = sanitizeCompetitionState(state, leaderboards, viewer, now, context);
  return sanitized;
}

export function createCompetitionEvent(action, payload, viewer, events = [], now = new Date().toISOString(), context = {}) {
  if (STAFF_ACTIONS.has(action) && !viewer?.canScore) {
    const error = new Error("Only SparkLabs staff can manage competition validation.");
    error.status = 403;
    throw error;
  }
  if (!viewer?.email && !["listChallenges"].includes(action)) {
    const error = new Error("Login required.");
    error.status = 401;
    throw error;
  }
  const state = clone(COMPETITION_SEED);
  state.solutions = clone(DEMO_SOLUTIONS);
  for (const event of events) applyCompetitionEvent(state, event);
  restoreSeedSubmissions(state);

  if (PARTICIPANT_ACTIONS.has(action) && !viewer?.canScore && canUseMemberOwnership(viewer)) {
    assertParticipantBountyReleased(action, payload, viewer, state, context);
  }

  if (action === "saveCompetitionChallenge") return challengeSavedEvent(payload, viewer, state, now);
  if (action === "uploadCompetitionSolution") return solutionUploadedEvent(payload, viewer, state, now);
  if (action === "joinCompetitionChallenge") return teamJoinedEvent(payload, viewer, state, now);
  if (action === "submitCompetitionEntry") return submissionCreatedEvent(payload, viewer, state, now);
  if (action === "selectCompetitionSubmission") return submissionSelectedEvent(payload, viewer, state, now);
  if (action === "reviewCompetitionSubmission") return reviewEvent(payload, viewer, state, now);
  if (action === "rerunCompetitionValidation") return rerunValidationEvent(payload, viewer, state, now);
  if (action === "recordCompetitionManualBenchmark") return manualBenchmarkEvent(payload, viewer, state, now);
  if (action === "recordCompetitionPairwiseVote") return pairwiseVoteEvent(payload, viewer, state, now);
  if (action === "revealCompetitionPrivateLeaderboard") return privateRevealEvent(payload, viewer, state, now);
  if (action === "requestCompetitionOpportunity") return opportunityRequestedEvent(payload, viewer, state, now);
  if (action === "updateCompetitionOpportunity") return opportunityUpdatedEvent(payload, viewer, state, now);
  throw new Error(`Unsupported competition action: ${action || "missing"}`);
}

function restoreSeedSubmissions(state) {
  const fixtures = new Map(COMPETITION_SEED.submissions.map((submission) => [submission.id, submission]));
  state.submissions = state.submissions.map((submission) =>
    fixtures.has(submission.id) ? clone(fixtures.get(submission.id)) : submission
  );
}

export function applyCompetitionEvent(state, event) {
  if (!event || typeof event !== "object") return state;
  if (event.type === "competition_challenge_saved") upsertById(state.challenges, event.challenge);
  if (event.type === "competition_solution_uploaded") state.solutions[event.solution.challengeId] = event.solution;
  if (event.type === "competition_team_joined") {
    upsertById(state.teams, event.team);
    upsertById(state.teamMembers, event.member);
  }
  if (event.type === "competition_submission_scored" || event.type === "competition_submission_reviewed" || event.type === "competition_manual_benchmark_recorded") {
    if (event.team) upsertById(state.teams, event.team);
    if (event.member) upsertById(state.teamMembers, event.member);
    upsertById(state.submissions, event.submission);
    if (event.report) upsertById(state.validationReports, event.report);
    if (event.review) upsertById(state.reviews, event.review);
  }
  if (event.type === "competition_submission_selected") {
    state.submissions = state.submissions.map((submission) => {
      if (submission.challengeId !== event.challengeId || submission.teamId !== event.teamId) return submission;
      if (event.selectedSubmissionIds.includes(submission.id)) {
        return { ...submission, status: "selected_for_private", selectedForPrivateAt: event.createdAt };
      }
      return submission.status === "selected_for_private" ? { ...submission, status: "scored", selectedForPrivateAt: null } : submission;
    });
  }
  if (event.type === "competition_pairwise_vote_recorded") upsertById(state.pairwiseVotes, event.vote);
  if (event.type === "competition_opportunity_requested" || event.type === "competition_opportunity_updated") {
    upsertById(state.opportunities, event.opportunity);
  }
  if (event.type === "competition_private_leaderboard_revealed") {
    const challenge = state.challenges.find((item) => item.id === event.challengeId);
    if (challenge) {
      challenge.status = "private_revealed";
      challenge.privateRevealedAt = event.createdAt;
      challenge.updatedAt = event.createdAt;
    }
  }
  if (event.audit) state.auditLogs.unshift(event.audit);
  return state;
}

export function computeLeaderboards(state) {
  return state.challenges.map((challenge) => computeChallengeCompetitionLeaderboard(challenge, state));
}

export function computeChallengeCompetitionLeaderboard(challenge, state) {
  const submissions = state.submissions.filter((submission) => submission.challengeId === challenge.id && !["schema_failed", "failed", "withdrawn", "disqualified"].includes(submission.status));
  const selected = selectedSubmissionsForRanking(challenge, submissions);
  const votes = state.pairwiseVotes.filter((vote) => vote.challengeId === challenge.id);
  const ratings = computePairwiseRatings(selected.map((submission) => submission.id), votes);
  const teamsById = new Map(state.teams.map((team) => [team.id, team]));
  const publicRows = rankRows(selected, challenge, ratings, "public");
  const privateRows = rankRows(selected, challenge, ratings, "private");
  const rows = publicRows.map((row) => {
    const privateRow = privateRows.find((item) => item.submissionId === row.submissionId);
    const team = teamsById.get(row.teamId);
    return {
      ...row,
      teamName: team?.name || row.teamId,
      organization: team?.organization || "",
      rankPrivate: privateRow?.rank || null,
      privateScore: privateRow?.score ?? null,
      finalRank: challenge.privateRevealedAt ? privateRow?.rank || row.rank : row.rank,
      finalScore: challenge.privateRevealedAt ? privateRow?.score ?? row.score : row.score,
      selectedForPrivate: true
    };
  });

  return {
    challengeId: challenge.id,
    slug: challenge.slug,
    title: challenge.title,
    status: challenge.status,
    metricKey: challenge.metricKey,
    metricDisplayName: challenge.metricDisplayName,
    higherIsBetter: challenge.higherIsBetter !== false,
    privateRevealedAt: challenge.privateRevealedAt || null,
    submissionCount: state.submissions.filter((submission) => submission.challengeId === challenge.id).length,
    rows
  };
}

function rankRows(submissions, challenge, ratings, split) {
  return submissions
    .map((submission) => {
      const rawScore = split === "private" ? submission.privateScore : submission.publicScore;
      const normalizedBenchmark = normalizeScore(rawScore, challenge.metricKey, challenge.higherIsBetter !== false, challenge.metricConfig || {});
      const bt = ratings.get(submission.id) || { rating: 1000, confidence: 0.35, matches: 0 };
      const btNormalized = clamp((bt.rating - 800) / 4, 0, 100);
      const weights = challenge.compositeWeights || { benchmark: 0.7, pairwise: 0.3 };
      const compositeScore = round4(normalizedBenchmark * weights.benchmark + btNormalized * weights.pairwise);
      return {
        challengeId: submission.challengeId,
        submissionId: submission.id,
        teamId: submission.teamId,
        split,
        score: rawScore,
        normalizedBenchmark: round4(normalizedBenchmark),
        btRating: bt.rating,
        confidence: bt.confidence,
        compositeScore,
        metricBreakdown: {
          benchmark: round4(normalizedBenchmark),
          pairwise: round4(btNormalized),
          weights
        },
        submittedAt: submission.submittedAt,
        status: submission.status
      };
    })
    .sort((left, right) => {
      const primary = compareScores(left.score, right.score, challenge.higherIsBetter !== false);
      if (primary !== 0) return primary;
      return right.compositeScore - left.compositeScore;
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function selectedSubmissionsForRanking(challenge, submissions) {
  const byTeam = new Map();
  for (const submission of submissions) {
    if (!byTeam.has(submission.teamId)) byTeam.set(submission.teamId, []);
    byTeam.get(submission.teamId).push(submission);
  }
  const selected = [];
  const max = Number(challenge.maxSelectedSubmissions || 1);
  for (const teamSubmissions of byTeam.values()) {
    const explicit = teamSubmissions.filter((submission) => submission.status === "selected_for_private").slice(0, max);
    if (explicit.length) {
      selected.push(...explicit);
      continue;
    }
    selected.push(
      [...teamSubmissions].sort((left, right) => {
        const byPublic = compareScores(left.publicScore, right.publicScore, challenge.higherIsBetter !== false);
        if (byPublic !== 0) return byPublic;
        return Date.parse(right.submittedAt || 0) - Date.parse(left.submittedAt || 0);
      })[0]
    );
  }
  return selected.filter(Boolean);
}

function sanitizeCompetitionState(state, leaderboards, viewer, now, context = {}) {
  const staff = Boolean(viewer?.canScore);
  const publicOrJoinedChallenges = state.challenges.filter((challenge) => staff || challenge.visibility === "public" || isTeamMemberForChallenge(state, challenge.id, viewer));
  const visibleSubmissions = state.submissions
    .filter((submission) => staff || ownsSubmission(state, submission, viewer))
    .map((submission) => sanitizeSubmission(submission, staff, isPrivateRevealed(state, submission.challengeId)));
  const visibleReports = state.validationReports
    .filter((report) => {
      const submission = state.submissions.find((item) => item.id === report.submissionId);
      return staff || ownsSubmission(state, submission, viewer);
    })
    .map((report) => sanitizeReport(report, staff));
  const visibleLeaderboards = leaderboards
    .filter((leaderboard) => publicOrJoinedChallenges.some((challenge) => challenge.id === leaderboard.challengeId))
    .map((leaderboard) => sanitizeLeaderboard(leaderboard, staff));
  const approvedBriefIds = approvedSponsorBriefIds(context?.bountyRequests);
  const releasableChallengeIds = new Set(
    state.challenges
      .filter((challenge) => challengeLinkedToApprovedBrief(challenge, approvedBriefIds))
      .map((challenge) => challenge.id)
  );
  const participantReleased = bountyFeatureEnabled(viewer) && releasableChallengeIds.size > 0;
  const releasedChallenges = publicOrJoinedChallenges.filter((challenge) => releasableChallengeIds.has(challenge.id));
  const releasedChallengeIds = new Set(releasedChallenges.map((challenge) => challenge.id));
  const releasedSubmissions = visibleSubmissions.filter((submission) => releasedChallengeIds.has(submission.challengeId));
  const releasedReports = visibleReports.filter((report) => releasedSubmissions.some((submission) => submission.id === report.submissionId));
  const releasedLeaderboards = visibleLeaderboards.filter((leaderboard) => releasedChallengeIds.has(leaderboard.challengeId));

  return {
    generatedAt: now,
    releaseState: participantReleased ? "open" : "preparing",
    previewMode: staff && !participantReleased,
    challenges: staff
      ? publicOrJoinedChallenges.map((challenge) => sanitizeChallenge(challenge, staff))
      : participantReleased
        ? releasedChallenges.map((challenge) => sanitizeChallenge(challenge, staff))
        : [],
    teams: staff ? state.teams : participantReleased ? state.teams.filter((team) => ownsTeam(team, viewer)) : [],
    submissions: staff ? visibleSubmissions : participantReleased ? releasedSubmissions : [],
    validationReports: staff ? visibleReports : participantReleased ? releasedReports : [],
    leaderboards: staff ? visibleLeaderboards : participantReleased ? releasedLeaderboards : [],
    validationQueue: staff
      ? state.submissions
          .filter((submission) => ["uploaded", "queued", "validating", "schema_failed", "scored", "selected_for_private"].includes(submission.status))
          .map((submission) => sanitizeSubmission(submission, true, true))
      : [],
    pairwiseVotes: staff ? state.pairwiseVotes.map((vote) => ({ ...vote })) : [],
    reviews: staff ? state.reviews.map((review) => ({ ...review })) : [],
    opportunities: staff ? state.opportunities.map((opportunity) => sanitizeOpportunity(opportunity, staff)) : participantReleased ? state.opportunities
      .filter((opportunity) => releasedChallengeIds.has(opportunity.challengeId))
      .filter((opportunity) => staff || (canUseMemberOwnership(viewer) && (opportunity.requesterUserId === viewer?.id || opportunity.requesterEmail === viewer?.email)))
      .map((opportunity) => sanitizeOpportunity(opportunity, staff)) : [],
    auditLogs: staff ? state.auditLogs.slice(0, 100).map((log) => ({ ...log })) : [],
    metrics: competitionMetrics(
      state,
      staff ? new Set(publicOrJoinedChallenges.map((challenge) => challenge.id)) : participantReleased ? releasedChallengeIds : new Set()
    )
  };
}

function bountyFeatureEnabled(viewer) {
  return viewer?.canEnterBounties === true;
}

function approvedSponsorBriefIds(bountyRequests = []) {
  return new Set(
    (Array.isArray(bountyRequests) ? bountyRequests : [])
      .filter((request) => ["published", "evaluating", "pilot", "production"].includes(String(request?.status || "")))
      .map((request) => String(request?.id || "").trim())
      .filter(Boolean)
  );
}

function challengeLinkedToApprovedBrief(challenge, approvedBriefIds) {
  return Boolean(
    ["open", "private_revealed"].includes(challenge?.status) &&
    challenge?.visibility === "public" &&
    challenge?.sponsorBriefId &&
    validIsoDate(challenge?.releaseApprovedAt) &&
    approvedBriefIds.has(String(challenge.sponsorBriefId))
  );
}

function assertParticipantBountyReleased(action, payload, viewer, state, context) {
  if (!bountyFeatureEnabled(viewer)) throwBountyPreparing();
  const challenge = participantActionChallenge(action, payload, state);
  if (!challengeLinkedToApprovedBrief(challenge, approvedSponsorBriefIds(context?.bountyRequests))) {
    throwBountyPreparing();
  }
}

function participantActionChallenge(action, payload, state) {
  if (action === "requestCompetitionOpportunity") {
    const submission = requiredSubmission(state, payload?.submissionId);
    return requiredChallenge(state, submission.challengeId);
  }
  return requiredChallenge(state, payload?.challengeId);
}

function throwBountyPreparing() {
  const error = new Error("실제 기업 Sponsor Brief와 평가 정책이 승인된 뒤 Bounty 참가가 열립니다.");
  error.status = 423;
  throw error;
}

function validIsoDate(value) {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}

function competitionMetrics(state, challengeIds) {
  const submissions = state.submissions.filter((submission) => challengeIds.has(submission.challengeId));
  const challenges = state.challenges.filter((challenge) => challengeIds.has(challenge.id));
  const opportunities = state.opportunities.filter((opportunity) => challengeIds.has(opportunity.challengeId));
  return {
    challenges: challenges.length,
    openChallenges: challenges.filter((challenge) => challenge.status === "open").length,
    challengeSubmissions: submissions.length,
    validatedSubmissions: submissions.filter((submission) => ["scored", "selected_for_private"].includes(submission.status)).length,
    validationQueue: submissions.filter((submission) => ["queued", "validating", "schema_failed"].includes(submission.status)).length,
    privateRevealed: challenges.filter((challenge) => challenge.privateRevealedAt).length,
    opportunityRequests: opportunities.length,
    activePilots: opportunities.filter((opportunity) => opportunity.status === "pilot").length
  };
}

function sanitizeChallenge(challenge, staff) {
  const sanitized = {
    id: challenge.id,
    slug: challenge.slug,
    title: challenge.title,
    shortDescription: challenge.shortDescription,
    longDescription: challenge.longDescription,
    sponsor: challenge.sponsor || "",
    prize: challenge.prize || "",
    opportunity: challenge.opportunity || "",
    sponsorBriefId: challenge.sponsorBriefId || null,
    releaseApprovedAt: challenge.releaseApprovedAt || null,
    targetTeams: challenge.targetTeams || [],
    evaluationCriteria: challenge.evaluationCriteria || [],
    dataPolicy: challenge.dataPolicy || "",
    pilotSlots: challenge.pilotSlots || null,
    status: challenge.status,
    visibility: challenge.visibility,
    challengeType: challenge.challengeType,
    evaluationMode: challenge.evaluationMode,
    metricKey: challenge.metricKey,
    metricDisplayName: challenge.metricDisplayName,
    higherIsBetter: challenge.higherIsBetter !== false,
    metricConfig: publicMetricConfig(challenge.metricConfig || {}),
    submissionIdColumn: challenge.submissionIdColumn,
    requiredColumns: challenge.requiredColumns || [],
    expectedRowCount: challenge.expectedRowCount || null,
    submissionLimitPerDay: challenge.submissionLimitPerDay || null,
    maxSelectedSubmissions: challenge.maxSelectedSubmissions || 1,
    publicSplitPercentage: challenge.publicSplitPercentage || null,
    startsAt: challenge.startsAt,
    endsAt: challenge.endsAt,
    privateRevealedAt: challenge.privateRevealedAt || null,
    rules: challenge.rules || "",
    evaluationDatasetCsv: challenge.evaluationDatasetCsv || "",
    sampleSubmissionCsv: challenge.sampleSubmissionCsv || "",
    createdAt: challenge.createdAt,
    updatedAt: challenge.updatedAt
  };
  if (staff) {
    sanitized.staff = {
      createdBy: challenge.createdBy || null,
      solutionConfigured: Boolean(DEMO_SOLUTIONS[challenge.id])
    };
  }
  return sanitized;
}

function sanitizeOpportunity(opportunity, staff) {
  const sanitized = {
    id: opportunity.id,
    challengeId: opportunity.challengeId,
    submissionId: opportunity.submissionId,
    teamId: opportunity.teamId,
    intent: opportunity.intent,
    status: opportunity.status,
    note: opportunity.note,
    publicNote: opportunity.publicNote || "",
    requestedAt: opportunity.requestedAt,
    updatedAt: opportunity.updatedAt
  };
  if (staff) {
    sanitized.requesterEmail = opportunity.requesterEmail;
    sanitized.privateNote = opportunity.privateNote || "";
  }
  return sanitized;
}

function publicMetricConfig(config) {
  const { labelColumn, splitColumn, ...publicConfig } = config;
  if (Array.isArray(publicConfig.fields)) {
    publicConfig.fields = publicConfig.fields.map(({ labelColumn: hiddenLabelColumn, ...field }) => field);
  }
  return publicConfig;
}

function sanitizeSubmission(submission, staff, privateRevealed) {
  const sanitized = {
    id: submission.id,
    challengeId: submission.challengeId,
    teamId: submission.teamId,
    submissionType: submission.submissionType,
    status: submission.status,
    endpointUrl: submission.endpointUrl || null,
    modelUrl: submission.modelUrl || null,
    productId: submission.productId || null,
    startupId: submission.startupId || null,
    publicScore: submission.publicScore,
    compositeScore: submission.compositeScore,
    rankPublic: submission.rankPublic || null,
    errorCode: submission.errorCode || null,
    errorMessagePublic: submission.errorMessagePublic || null,
    submittedAt: submission.submittedAt,
    scoredAt: submission.scoredAt || null,
    selectedForPrivateAt: submission.selectedForPrivateAt || null,
    disqualifiedAt: submission.disqualifiedAt || null
  };
  if (staff || privateRevealed) {
    sanitized.privateScore = submission.privateScore;
    sanitized.rankPrivate = submission.rankPrivate || null;
  }
  if (staff) {
    sanitized.submitterEmail = submission.submitterEmail || "";
    sanitized.errorMessagePrivate = submission.errorMessagePrivate || null;
    sanitized.artifactChecksum = submission.artifactChecksum || null;
    sanitized.metricBreakdown = submission.metricBreakdown || null;
  }
  return sanitized;
}

function sanitizeReport(report, staff) {
  const sanitized = {
    id: report.id,
    submissionId: report.submissionId,
    schemaValid: Boolean(report.schemaValid),
    rowCount: report.rowCount,
    missingColumns: report.missingColumns || [],
    extraColumns: report.extraColumns || [],
    duplicateIds: report.duplicateIds || [],
    missingIds: (report.missingIds || []).map(() => "[hidden-id]"),
    invalidValues: report.invalidValues || [],
    warnings: report.warnings || [],
    logsPublic: report.logsPublic || [],
    createdAt: report.createdAt
  };
  if (staff) {
    sanitized.missingIds = report.missingIds || [];
    sanitized.unknownIds = report.unknownIds || [];
    sanitized.logsPrivate = report.logsPrivate || [];
  }
  return sanitized;
}

function sanitizeLeaderboard(leaderboard, staff) {
  const privateVisible = staff || Boolean(leaderboard.privateRevealedAt);
  return {
    ...leaderboard,
    rows: leaderboard.rows.map((row) => {
      const sanitized = {
        rank: leaderboard.privateRevealedAt ? row.finalRank : row.rank,
        rankPublic: row.rank,
        submissionId: row.submissionId,
        teamId: row.teamId,
        teamName: row.teamName,
        organization: row.organization,
        publicScore: row.score,
        compositeScore: row.compositeScore,
        btRating: row.btRating,
        confidence: row.confidence,
        status: row.status,
        selectedForPrivate: row.selectedForPrivate,
        submittedAt: row.submittedAt,
        metricBreakdown: row.metricBreakdown
      };
      if (privateVisible) {
        sanitized.rankPrivate = row.rankPrivate;
        sanitized.privateScore = row.privateScore;
        sanitized.finalRank = row.finalRank;
        sanitized.finalScore = row.finalScore;
      }
      return sanitized;
    })
  };
}

function challengeSavedEvent(payload, viewer, state, now) {
  const existing = payload?.id ? state.challenges.find((challenge) => challenge.id === payload.id) : null;
  const title = requiredString(payload, "title", 160);
  const slug = slugify(payload.slug || title);
  const challenge = {
    ...(existing || {}),
    id: existing?.id || stableId("challenge", `${slug}:${now}`),
    slug,
    title,
    shortDescription: limitedString(payload.shortDescription, 300),
    longDescription: limitedString(payload.longDescription, 4000),
    sponsor: limitedString(payload.sponsor, 200) || existing?.sponsor || "",
    prize: limitedString(payload.prize, 300) || existing?.prize || "",
    opportunity: limitedString(payload.opportunity, 1000) || existing?.opportunity || "",
    sponsorBriefId: limitedString(payload.sponsorBriefId, 100) || existing?.sponsorBriefId || null,
    releaseApprovedAt: validIsoDate(payload.releaseApprovedAt)
      ? new Date(payload.releaseApprovedAt).toISOString()
      : existing?.releaseApprovedAt || null,
    targetTeams: normalizeList(payload.targetTeams).length ? normalizeList(payload.targetTeams) : existing?.targetTeams || [],
    evaluationCriteria: normalizeList(payload.evaluationCriteria).length
      ? normalizeList(payload.evaluationCriteria)
      : existing?.evaluationCriteria || [],
    dataPolicy: limitedString(payload.dataPolicy, 1600) || existing?.dataPolicy || "",
    pilotSlots: nullableNumber(payload.pilotSlots, existing?.pilotSlots),
    status: enumValue(payload.status, ["draft", "open", "paused", "locked", "ended", "private_revealed", "archived"], existing?.status || "draft"),
    visibility: enumValue(payload.visibility, ["public", "private", "invite_only"], existing?.visibility || "public"),
    challengeType: enumValue(payload.challengeType, ["csv_prediction", "product_benchmark", "endpoint_eval", "pairwise_validation", "composite"], existing?.challengeType || "csv_prediction"),
    evaluationMode: enumValue(payload.evaluationMode, ["automatic", "staff_recorded", "hybrid"], existing?.evaluationMode || "automatic"),
    metricKey: limitedString(payload.metricKey, 80) || existing?.metricKey || "accuracy",
    metricDisplayName: limitedString(payload.metricDisplayName, 120) || existing?.metricDisplayName || "Accuracy",
    higherIsBetter: payload.higherIsBetter !== false && payload.higherIsBetter !== "false",
    metricConfig: normalizeJson(payload.metricConfig, existing?.metricConfig || { predictionColumn: "prediction", allowedValues: [] }),
    submissionIdColumn: limitedString(payload.submissionIdColumn, 80) || existing?.submissionIdColumn || "id",
    requiredColumns: normalizeList(payload.requiredColumns).length ? normalizeList(payload.requiredColumns) : existing?.requiredColumns || ["id", "prediction"],
    expectedRowCount: nullableNumber(payload.expectedRowCount, existing?.expectedRowCount),
    submissionLimitPerDay: nullableNumber(payload.submissionLimitPerDay, existing?.submissionLimitPerDay || 5),
    maxSelectedSubmissions: nullableNumber(payload.maxSelectedSubmissions, existing?.maxSelectedSubmissions || 1),
    publicSplitPercentage: nullableNumber(payload.publicSplitPercentage, existing?.publicSplitPercentage || 50),
    startsAt: payload.startsAt || existing?.startsAt || now,
    endsAt: payload.endsAt || existing?.endsAt || null,
    privateRevealedAt: existing?.privateRevealedAt || null,
    rules: limitedString(payload.rules, 4000) || existing?.rules || "",
    evaluationDatasetCsv: limitedString(payload.evaluationDatasetCsv, 250000) || existing?.evaluationDatasetCsv || "",
    sampleSubmissionCsv: limitedString(payload.sampleSubmissionCsv, 20000) || existing?.sampleSubmissionCsv || "",
    createdBy: existing?.createdBy || viewer.email,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  return event("competition_challenge_saved", { challenge }, viewer, now, "challenge", challenge.id);
}

function solutionUploadedEvent(payload, viewer, state, now) {
  const challenge = requiredChallenge(state, payload?.challengeId);
  const solutionRows = normalizeSolutionRows(payload?.solutionRows || payload?.solutionCsv, challenge);
  const solution = {
    id: stableId("solution", `${challenge.id}:${now}`),
    challengeId: challenge.id,
    storagePath: null,
    checksum: hash(JSON.stringify(solutionRows)),
    schemaJson: {
      idColumn: challenge.submissionIdColumn || "id",
      labelColumn: challenge.metricConfig?.labelColumn || "label",
      labelColumns: Array.isArray(challenge.metricConfig?.fields)
        ? challenge.metricConfig.fields.map((field) => field.labelColumn || field.predictionColumn)
        : [challenge.metricConfig?.labelColumn || "label"],
      splitColumn: "split"
    },
    rows: solutionRows,
    createdBy: viewer.email,
    createdAt: now
  };
  return event("competition_solution_uploaded", { solution }, viewer, now, "challenge_solution", solution.id);
}

function teamJoinedEvent(payload, viewer, state, now) {
  assertCanUseMemberOwnership(viewer);
  const challenge = requiredChallenge(state, payload?.challengeId);
  assertCanJoin(challenge, now);
  const existing = state.teams.find((team) => team.challengeId === challenge.id && ownsTeam(team, viewer));
  if (existing) {
    return event("competition_team_joined", {
      team: existing,
      member: {
        id: stableId("member", `${existing.id}:${viewer.id || viewer.email}`),
        teamId: existing.id,
        userId: viewer.id || viewer.email,
        email: viewer.email,
        role: "owner",
        createdAt: existing.createdAt
      }
    }, viewer, now, "arena_team", existing.id);
  }
  const name = limitedString(payload.teamName || payload.name, 120) || `${viewer.email.split("@")[0]} team`;
  const team = {
    id: stableId("team", `${challenge.id}:${viewer.id || viewer.email}:${name}`),
    challengeId: challenge.id,
    name,
    slug: slugify(name),
    ownerUserId: viewer.id || viewer.email,
    ownerEmail: viewer.email,
    organization: limitedString(payload.organization, 160),
    createdAt: now
  };
  const member = {
    id: stableId("member", `${team.id}:${viewer.id || viewer.email}`),
    teamId: team.id,
    userId: viewer.id || viewer.email,
    email: viewer.email,
    role: "owner",
    createdAt: now
  };
  return event("competition_team_joined", { team, member }, viewer, now, "arena_team", team.id);
}

function submissionCreatedEvent(payload, viewer, state, now) {
  const challenge = requiredChallenge(state, payload?.challengeId);
  assertCanJoin(challenge, now);
  assertDailyLimit(challenge, state, viewer, now);
  const team = resolveTeam(payload, viewer, state, challenge, now);
  const submissionType = enumValue(payload.submissionType || "csv", ["csv", "endpoint", "product_profile", "manual_benchmark", "pairwise_candidate"], "csv");
  let scored = null;
  let report = null;
  let status = "queued";
  let endpointUrl = null;
  let artifactChecksum = null;
  let errorCode = null;
  let errorMessagePublic = null;
  let errorMessagePrivate = null;
  let metricBreakdown = null;
  let publicScore = null;
  let privateScore = null;

  try {
    if (submissionType === "csv") {
      const csvText = requiredString(payload, "csvText", 1_000_000);
      artifactChecksum = hash(csvText);
      scored = validateAndScoreCsvSubmission(challenge, csvText, state.solutions[challenge.id], now);
      report = scored.report;
      status = scored.status;
      publicScore = scored.publicScore;
      privateScore = scored.privateScore;
      metricBreakdown = scored.metricBreakdown;
      if (status === "schema_failed") errorMessagePublic = "CSV schema failed validation.";
    } else if (submissionType === "endpoint") {
      endpointUrl = validateEndpointUrl(payload.endpointUrl);
      status = "queued";
      errorMessagePublic = "Endpoint validation is queued for a sandbox worker. Netlify will not execute untrusted endpoint code.";
    } else {
      status = "queued";
      errorMessagePublic = "Submission queued for staff or worker validation.";
    }
  } catch (error) {
    status = "schema_failed";
    errorCode = error.code || "validation_failed";
    errorMessagePublic = error.message;
    errorMessagePrivate = error.stack || error.message;
    report = {
      id: stableId("report", `${challenge.id}:${team.id}:${now}`),
      submissionId: null,
      schemaValid: false,
      rowCount: 0,
      missingColumns: [],
      extraColumns: [],
      duplicateIds: [],
      missingIds: [],
      invalidValues: [{ row: null, column: null, reason: error.message }],
      warnings: [],
      logsPublic: [{ level: "error", message: error.message }],
      logsPrivate: [{ level: "error", message: error.stack || error.message }],
      createdAt: now
    };
  }

  const submission = {
    id: stableId("comp_sub", `${challenge.id}:${team.id}:${artifactChecksum || endpointUrl || now}:${now}`),
    challengeId: challenge.id,
    teamId: team.id,
    submitterUserId: viewer.id || viewer.email,
    submitterEmail: viewer.email,
    submissionType,
    status,
    artifactPath: null,
    artifactChecksum,
    endpointUrl,
    modelUrl: payload.modelUrl ? limitedString(payload.modelUrl, 1000) : null,
    productId: payload.productId ? limitedString(payload.productId, 120) : null,
    startupId: payload.startupId ? limitedString(payload.startupId, 120) : null,
    publicScore,
    privateScore,
    compositeScore: metricBreakdown?.publicNormalized || null,
    rankPublic: null,
    rankPrivate: null,
    errorCode,
    errorMessagePublic,
    errorMessagePrivate,
    submittedAt: now,
    scoredAt: status === "scored" || status === "schema_failed" ? now : null,
    selectedForPrivateAt: null,
    disqualifiedAt: null,
    disqualifiedBy: null,
    metricBreakdown
  };
  if (report) report.submissionId = submission.id;
  return event("competition_submission_scored", { team, member: ownerMember(team, viewer, now), submission, report }, viewer, now, "challenge_submission", submission.id);
}

function submissionSelectedEvent(payload, viewer, state, now) {
  const challenge = requiredChallenge(state, payload?.challengeId);
  const team = requiredTeam(state, payload?.teamId);
  if (!viewer?.canScore && !ownsTeam(team, viewer)) {
    const error = new Error("You can only select submissions for your own team.");
    error.status = 403;
    throw error;
  }
  const selectedSubmissionIds = normalizeList(payload.submissionIds || payload.submissionId).slice(0, Number(challenge.maxSelectedSubmissions || 1));
  if (!selectedSubmissionIds.length) throw new Error("Select at least one submission.");
  return event("competition_submission_selected", { challengeId: challenge.id, teamId: team.id, selectedSubmissionIds }, viewer, now, "challenge_submission", selectedSubmissionIds.join(","));
}

function reviewEvent(payload, viewer, state, now) {
  const submission = requiredSubmission(state, payload?.submissionId);
  const status = enumValue(payload.status, ["pending", "approved", "needs_changes", "rejected", "disqualified"], "pending");
  const nextSubmission = {
    ...submission,
    status: status === "disqualified" ? "disqualified" : submission.status,
    disqualifiedAt: status === "disqualified" ? now : submission.disqualifiedAt || null,
    disqualifiedBy: status === "disqualified" ? viewer.email : submission.disqualifiedBy || null,
    errorMessagePublic: status === "disqualified" ? limitedString(payload.publicNote, 800) || "Submission disqualified." : submission.errorMessagePublic
  };
  const review = {
    id: stableId("review", `${submission.id}:${status}:${now}`),
    challengeId: submission.challengeId,
    submissionId: submission.id,
    productId: submission.productId || null,
    startupId: submission.startupId || null,
    reviewerUserId: viewer.id || viewer.email,
    reviewerEmail: viewer.email,
    status,
    publicNote: limitedString(payload.publicNote, 1200),
    privateNote: limitedString(payload.privateNote, 1200),
    createdAt: now,
    updatedAt: now
  };
  return event("competition_submission_reviewed", { submission: nextSubmission, review }, viewer, now, "validation_review", review.id);
}

function rerunValidationEvent(payload, viewer, state, now) {
  const submission = requiredSubmission(state, payload?.submissionId);
  if (submission.submissionType !== "csv" || !payload.csvText) {
    const next = { ...submission, status: "queued", errorMessagePublic: "Validation rerun queued for worker.", errorMessagePrivate: null };
    return event("competition_submission_scored", { submission: next }, viewer, now, "challenge_submission", submission.id);
  }
  return submissionCreatedEvent({ ...payload, challengeId: submission.challengeId, teamId: submission.teamId, submissionType: "csv" }, viewer, state, now);
}

function manualBenchmarkEvent(payload, viewer, state, now) {
  const challenge = requiredChallenge(state, payload?.challengeId);
  const team = resolveTeam(payload, viewer, state, challenge, now);
  const publicScore = Number(payload.publicScore ?? payload.score);
  const privateScore = payload.privateScore === undefined || payload.privateScore === "" ? publicScore : Number(payload.privateScore);
  if (!Number.isFinite(publicScore)) throw new Error("Manual benchmark score is required.");
  const submission = {
    id: stableId("manual_sub", `${challenge.id}:${team.id}:${publicScore}:${now}`),
    challengeId: challenge.id,
    teamId: team.id,
    submitterUserId: viewer.id || viewer.email,
    submitterEmail: viewer.email,
    submissionType: "manual_benchmark",
    status: "scored",
    artifactPath: null,
    artifactChecksum: null,
    endpointUrl: null,
    modelUrl: null,
    productId: payload.productId || null,
    startupId: payload.startupId || null,
    publicScore,
    privateScore,
    compositeScore: normalizeScore(publicScore, challenge.metricKey, challenge.higherIsBetter !== false, challenge.metricConfig || {}),
    rankPublic: null,
    rankPrivate: null,
    submittedAt: now,
    scoredAt: now,
    selectedForPrivateAt: null,
    metricBreakdown: { manual: true, note: limitedString(payload.note, 1200) }
  };
  return event("competition_manual_benchmark_recorded", { team, member: ownerMember(team, viewer, now), submission }, viewer, now, "challenge_submission", submission.id);
}

function pairwiseVoteEvent(payload, viewer, state, now) {
  const challenge = requiredChallenge(state, payload?.challengeId);
  const winnerId = requiredString(payload, "winnerSubmissionId", 120);
  const loserId = requiredString(payload, "loserSubmissionId", 120);
  if (winnerId === loserId) throw new Error("Pairwise vote needs two different submissions.");
  const vote = {
    id: stableId("comp_vote", `${challenge.id}:${winnerId}:${loserId}:${viewer.email}:${now}`),
    challengeId: challenge.id,
    winnerSubmissionId: winnerId,
    loserSubmissionId: loserId,
    winnerId,
    loserId,
    judgeUserId: viewer.id || viewer.email,
    judgeEmail: viewer.email,
    criteria: limitedString(payload.criteria, 800),
    confidence: nullableNumber(payload.confidence, null),
    note: limitedString(payload.note, 1200),
    outcome: payload.outcome === "tie" ? "tie" : "win",
    createdAt: now
  };
  return event("competition_pairwise_vote_recorded", { vote }, viewer, now, "pairwise_vote", vote.id);
}

function privateRevealEvent(payload, viewer, state, now) {
  const challenge = requiredChallenge(state, payload?.challengeId);
  if (!viewer?.canAdmin && !viewer?.canScore) {
    const error = new Error("Only SparkLabs staff can reveal private leaderboards.");
    error.status = 403;
    throw error;
  }
  return event("competition_private_leaderboard_revealed", { challengeId: challenge.id }, viewer, now, "arena_challenge", challenge.id);
}

function opportunityRequestedEvent(payload, viewer, state, now) {
  const submission = requiredSubmission(state, payload?.submissionId);
  const challenge = requiredChallenge(state, submission.challengeId);
  if (!viewer?.canScore && !ownsSubmission(state, submission, viewer)) {
    const error = new Error("You can only request opportunities for your own submission.");
    error.status = 403;
    throw error;
  }
  const duplicate = state.opportunities.find(
    (item) =>
      item.submissionId === submission.id &&
      item.requesterEmail === viewer.email &&
      !["closed", "declined"].includes(item.status)
  );
  if (duplicate) {
    const error = new Error("An active opportunity request already exists for this submission.");
    error.status = 409;
    throw error;
  }
  const intent = enumValue(
    payload?.intent,
    ["poc_review", "pilot", "investment_intro", "credits", "mentor_feedback"],
    "poc_review"
  );
  const opportunity = {
    id: stableId("opportunity", `${submission.id}:${viewer.email}:${intent}:${now}`),
    challengeId: challenge.id,
    submissionId: submission.id,
    teamId: submission.teamId,
    requesterUserId: viewer.id || viewer.email,
    requesterEmail: viewer.email,
    intent,
    status: "requested",
    note: limitedString(payload?.note, 1200),
    publicNote: "",
    privateNote: "",
    requestedAt: now,
    updatedAt: now
  };
  return event(
    "competition_opportunity_requested",
    { opportunity },
    viewer,
    now,
    "opportunity_request",
    opportunity.id
  );
}

function opportunityUpdatedEvent(payload, viewer, state, now) {
  const current = requiredOpportunity(state, payload?.opportunityId);
  const opportunity = {
    ...current,
    status: enumValue(
      payload?.status,
      ["requested", "reviewing", "matched", "pilot", "closed", "declined"],
      current.status
    ),
    publicNote: limitedString(payload?.publicNote, 1200) || current.publicNote || "",
    privateNote: limitedString(payload?.privateNote, 1200) || current.privateNote || "",
    updatedAt: now,
    updatedBy: viewer.email
  };
  return event(
    "competition_opportunity_updated",
    { opportunity },
    viewer,
    now,
    "opportunity_request",
    opportunity.id
  );
}

function assertCanJoin(challenge, now) {
  if (!["open", "private_revealed"].includes(challenge.status)) {
    const error = new Error("This challenge is not open for submissions.");
    error.status = 400;
    throw error;
  }
  if (challenge.endsAt && Date.parse(challenge.endsAt) < Date.parse(now)) {
    const error = new Error("This challenge has ended.");
    error.status = 400;
    throw error;
  }
}

function assertDailyLimit(challenge, state, viewer, now) {
  const limit = Number(challenge.submissionLimitPerDay || 0);
  if (!limit) return;
  const day = now.slice(0, 10);
  const count = state.submissions.filter((submission) =>
    submission.challengeId === challenge.id &&
    submission.submitterEmail === viewer.email &&
    String(submission.submittedAt || "").startsWith(day)
  ).length;
  if (count >= limit) {
    const error = new Error(`Submission limit reached: ${limit} per day.`);
    error.status = 429;
    throw error;
  }
}

function normalizeSolutionRows(input, challenge) {
  const idColumn = challenge.submissionIdColumn || "id";
  const metricFields = Array.isArray(challenge.metricConfig?.fields) && challenge.metricConfig.fields.length
    ? challenge.metricConfig.fields
    : [{
        predictionColumn: challenge.metricConfig?.predictionColumn || "prediction",
        labelColumn: challenge.metricConfig?.labelColumn || "label"
      }];
  const sourceRows = Array.isArray(input) ? input : parseCsv(String(input || "")).records;
  return sourceRows.map((row) => {
    const normalized = {
      id: String(row.id || row[idColumn] || "").trim(),
      split: String(row.split || "private").trim() === "public" ? "public" : "private"
    };
    for (const field of metricFields) {
      const predictionColumn = field.predictionColumn || "prediction";
      const labelColumn = field.labelColumn || predictionColumn || "label";
      normalized[labelColumn] = String(row[labelColumn] ?? row[predictionColumn] ?? "").trim();
    }
    return normalized;
  }).filter((row) =>
    row.id && metricFields.every((field) => row[field.labelColumn || field.predictionColumn || "label"])
  );
}

function resolveTeam(payload, viewer, state, challenge, now) {
  if (payload?.teamId) {
    const team = requiredTeam(state, payload.teamId);
    if (!viewer?.canScore && !ownsTeam(team, viewer)) {
      const error = new Error("You can only submit for your own team.");
      error.status = 403;
      throw error;
    }
    return team;
  }
  return teamJoinedEvent({ challengeId: challenge.id, teamName: payload?.teamName, organization: payload?.organization }, viewer, state, now).team;
}

function ownerMember(team, viewer, now) {
  return {
    id: stableId("member", `${team.id}:${viewer.id || viewer.email}`),
    teamId: team.id,
    userId: viewer.id || viewer.email,
    email: viewer.email,
    role: "owner",
    createdAt: team.createdAt || now
  };
}

function event(type, payload, viewer, now, entityType, entityId) {
  const audit = {
    id: stableId("audit", `${type}:${entityId}:${viewer?.email || "public"}:${now}`),
    actorUserId: viewer?.id || viewer?.email || null,
    actorEmail: viewer?.email || "",
    action: type,
    entityType,
    entityId,
    metadata: { role: viewer?.role || "public" },
    createdAt: now
  };
  return {
    id: stableId("event", `${type}:${entityId}:${now}`),
    type,
    ...payload,
    audit,
    createdAt: now
  };
}

function requiredChallenge(state, id) {
  const challenge = state.challenges.find((item) => item.id === id || item.slug === id);
  if (!challenge) {
    const error = new Error("Challenge not found.");
    error.status = 404;
    throw error;
  }
  return challenge;
}

function requiredTeam(state, id) {
  const team = state.teams.find((item) => item.id === id);
  if (!team) {
    const error = new Error("Team not found.");
    error.status = 404;
    throw error;
  }
  return team;
}

function requiredSubmission(state, id) {
  const submission = state.submissions.find((item) => item.id === id);
  if (!submission) {
    const error = new Error("Submission not found.");
    error.status = 404;
    throw error;
  }
  return submission;
}

function requiredOpportunity(state, id) {
  const opportunity = state.opportunities.find((item) => item.id === id);
  if (!opportunity) {
    const error = new Error("Opportunity request not found.");
    error.status = 404;
    throw error;
  }
  return opportunity;
}

function isTeamMemberForChallenge(state, challengeId, viewer) {
  return state.teams.some((team) => team.challengeId === challengeId && ownsTeam(team, viewer));
}

function ownsSubmission(state, submission, viewer) {
  if (!submission || !canUseMemberOwnership(viewer) || !viewer?.email) return false;
  if (submission.submitterUserId === viewer.id || submission.submitterEmail === viewer.email) return true;
  const team = state.teams.find((item) => item.id === submission.teamId);
  return ownsTeam(team, viewer);
}

function ownsTeam(team, viewer) {
  if (!team || !canUseMemberOwnership(viewer) || !viewer?.email) return false;
  return team.ownerUserId === viewer.id || team.ownerEmail === viewer.email;
}

function canUseMemberOwnership(viewer) {
  return Boolean(viewer?.canScore || viewer?.role === "member");
}

function assertCanUseMemberOwnership(viewer) {
  if (canUseMemberOwnership(viewer)) return;
  const error = new Error("Only approved members can own competition teams and submissions.");
  error.status = viewer?.email ? 403 : 401;
  throw error;
}

function isPrivateRevealed(state, challengeId) {
  return Boolean(state.challenges.find((challenge) => challenge.id === challengeId)?.privateRevealedAt);
}

function upsertById(items, item) {
  if (!item?.id) return;
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index < 0) items.unshift(clone(item));
  else items[index] = clone(item);
}

function publicViewer() {
  return { id: null, email: "", role: "public", canScore: false, canAdmin: false };
}

function requiredString(payload, key, maxLength) {
  const value = limitedString(payload?.[key], maxLength);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function limitedString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => limitedString(item, 120)).filter(Boolean);
  return String(value || "").split(/[,;\n]/).map((item) => limitedString(item, 120)).filter(Boolean);
}

function normalizeJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function nullableNumber(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback ?? null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback ?? null;
}

function enumValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function stableId(prefix, material) {
  return `${prefix}_${crypto.createHash("sha256").update(String(material)).digest("hex").slice(0, 18)}`;
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round4(value) {
  if (value === null || value === undefined) return null;
  return Math.round(Number(value) * 10000) / 10000;
}
