import { appendArenaEvent, loadArenaEvents } from "../lib/arena-store.mjs";
import { buildArenaSnapshot, createArenaEvent } from "../lib/arena-core.mjs";
import { createSubmissionEvent, filterSubmissionsForViewer, humanValidationQueueForViewer, reviewQueueForViewer } from "../lib/arena-submissions.mjs";
import { loadArenaSubmissions, saveArenaSubmission } from "../lib/supabase-submissions-store.mjs";
import { appendCompetitionEvent, loadCompetitionEvents } from "../lib/competition/competition-store.mjs";
import { buildCompetitionSnapshot, createCompetitionEvent, isCompetitionAction } from "../lib/competition/competition-core.mjs";
import { recordScArenaActivitySafely } from "../lib/sc-arena-activity.mjs";
import { authorizeArenaAction, verifyArenaRequest } from "../lib/supabase-auth.mjs";

export default async function arena(req) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (!["GET", "POST"].includes(req.method)) return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await verifyArenaRequest(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    if (!arenaAvailableToViewer(auth.viewer)) {
      return json({ error: "Arena prototype is not enabled for this account." }, 403);
    }

    if (req.method === "GET") {
      const events = await loadArenaEvents();
      const submissions = await loadArenaSubmissions();
      const competitionEvents = await loadCompetitionEvents();
      return json(snapshotForViewer(events, auth.viewer, submissions, competitionEvents));
    }

    const body = await readJson(req);
    const eventsBefore = await loadArenaEvents();
    const competitionEventsBefore = await loadCompetitionEvents();
    const submissionsBefore = await loadArenaSubmissions();

    if (isCompetitionAction(body.action)) {
      const currentArenaSnapshot = buildArenaSnapshot(eventsBefore, new Date().toISOString(), submissionsBefore);
      const event = createCompetitionEvent(
        body.action,
        body.payload || {},
        auth.viewer,
        competitionEventsBefore,
        new Date().toISOString(),
        { bountyRequests: currentArenaSnapshot.bountyRequests || [] }
      );
      const competitionEvents = await appendCompetitionEvent(event);
      const snapshot = snapshotForViewer(eventsBefore, auth.viewer, submissionsBefore, competitionEvents);
      await recordScArenaActivitySafely({
        sourceSystem: "competition",
        event,
        viewer: auth.viewer,
        context: { competitionSnapshot: snapshot.competition }
      });
      return json({
        ok: true,
        event,
        snapshot
      });
    }

    authorizeArenaAction(body.action, auth.viewer);
    const currentSnapshot = buildArenaSnapshot(eventsBefore, new Date().toISOString(), submissionsBefore);
    const event =
      createSubmissionEvent(body.action, body.payload || {}, auth.viewer, currentSnapshot) ||
      createArenaEvent(body.action, body.payload || {}, new Date().toISOString(), auth.viewer, { events: eventsBefore, snapshot: currentSnapshot });
    if (event.type?.startsWith("submission_")) {
      await saveArenaSubmission(event.submission);
      await recordScArenaActivitySafely({
        sourceSystem: "arena",
        event,
        viewer: auth.viewer,
        context: { snapshot: currentSnapshot }
      });
      const submissions = await loadArenaSubmissions();
      const competitionEvents = await loadCompetitionEvents();
      const snapshot = snapshotForViewer(eventsBefore, auth.viewer, submissions, competitionEvents);
      return json({
        ok: true,
        event,
        snapshot
      });
    }

    const events = await appendArenaEvent(event);
    await recordScArenaActivitySafely({
      sourceSystem: "arena",
      event,
      viewer: auth.viewer,
      context: { snapshot: currentSnapshot }
    });
    const submissions = await loadArenaSubmissions();
    const competitionEvents = await loadCompetitionEvents();
    const snapshot = snapshotForViewer(events, auth.viewer, submissions, competitionEvents);
    return json({
      ok: true,
      event,
      snapshot
    });
  } catch (error) {
    return json({ error: error.message }, error.status || 400);
  }
}

function arenaAvailableToViewer(viewer, env = process.env) {
  if (viewer?.canScore) return true;
  const enabled = (value) => ["1", "true", "yes", "on", "enabled"].includes(String(value || "").trim().toLowerCase());
  const enabledByDefault = (value) => value == null || String(value).trim() === "" || enabled(value);
  if (["b2b_partner", "member"].includes(viewer?.role)) return enabledByDefault(env.SPARKCLAW_ENABLE_B2B_PORTAL);
  return enabled(env.SPARKCLAW_ENABLE_ARENA) && enabled(env.SPARKCLAW_ENABLE_PUBLIC_TECH_DISCLOSURE);
}

function snapshotForViewer(events, viewer, submissions = [], competitionEvents = []) {
  const snapshot = buildArenaSnapshot(events, new Date().toISOString(), submissions);
  const staff = Boolean(viewer?.canScore);
  const visibleStartups = filterStartupTechStacksForViewer(snapshot.startups || [], snapshot.submissions || [], viewer);
  const visibleSubmissions = filterSubmissionsForViewer(snapshot.submissions || [], viewer);
  const visibleConnections = filterConnectionRequestsForViewer(snapshot.connectionRequests || [], snapshot, viewer);
  const visibleBounties = filterBountyRequestsForViewer(snapshot.bountyRequests || [], viewer);
  return {
    ...snapshot,
    source: staff ? snapshot.source : null,
    architecture: staff ? snapshot.architecture : [],
    startups: visibleStartups,
    challenges: staff ? snapshot.challenges : [],
    benchmarkSubmissions: staff ? snapshot.benchmarkSubmissions : [],
    pairwiseVotes: staff ? snapshot.pairwiseVotes : [],
    leaderboards: staff ? snapshot.leaderboards : [],
    scores: staff ? snapshot.scores : {},
    matches: staff ? snapshot.matches : [],
    connectionProfiles: staff ? snapshot.connectionProfiles : [],
    connectionRequests: visibleConnections,
    bountyRequests: visibleBounties,
    submissions: visibleSubmissions,
    metrics: staff
      ? snapshot.metrics
      : {
          startups: visibleStartups.length,
          products: visibleStartups.reduce((total, startup) => total + (startup.products || []).length, 0),
          connectionRequests: visibleConnections.length,
          bountyRequests: visibleBounties.length,
          partnerSubmissions: visibleSubmissions.length,
          publishedPartnerSubmissions: visibleSubmissions.filter((submission) => submission.status === "published").length
        },
    reviewQueue: reviewQueueForViewer(snapshot.submissions || [], viewer),
    humanValidationQueue: humanValidationQueueForViewer(snapshot.submissions || [], viewer),
    competition: buildCompetitionSnapshot(competitionEvents, viewer, new Date().toISOString(), {
      bountyRequests: snapshot.bountyRequests || []
    }),
    viewer
  };
}

export function filterStartupTechStacksForViewer(startups = [], submissions = [], viewer) {
  const submissionsById = new Map(submissions.map((submission) => [submission.id, submission]));
  const approvedStartupIds = new Set(
    submissions
      .filter((submission) => submission.status === "published" && submission.visibility === "public")
      .map((submission) => submission.id)
  );
  return startups.filter((startup) => viewer?.canScore || approvedStartupIds.has(startup.id)).map((startup) => {
    const submission = submissionsById.get(startup.id);
    const visibility = submission?.technicalProfile?.stackVisibility || "arena_members";
    const owner = submission && canUseMemberOwnership(viewer) && (submission.ownerId === viewer?.id || submission.ownerEmail === viewer?.email);
    const canView = viewer?.canScore || owner || visibility === "public" || hasPartnerStackGrant(submission, viewer);
    const safeStartup = viewer?.canScore || owner ? startup : redactStartupContacts(startup);
    if (canView || !submission) return safeStartup;
    return {
      ...safeStartup,
      techStack: {
        source: "team_submitted",
        sourceLabel: "Approved partner disclosure",
        verification: submission.review?.staffVerified ? "sparklabs_reviewed" : "team_supplied",
        groups: [],
        itemCount: 0,
        hasDisclosure: false,
        restricted: true,
        updatedAt: submission.updatedAt || null
      }
    };
  });
}

function canUseMemberOwnership(viewer) {
  return Boolean(viewer?.canScore || viewer?.role === "member");
}

function redactStartupContacts(startup) {
  const {
    ownerId: _ownerId,
    ownerEmail: _ownerEmail,
    sourceSheet: _sourceSheet,
    sourceRow: _sourceRow,
    ...safe
  } = startup;
  return {
    ...safe,
    products: (safe.products || []).map((product) => ({
      ...product,
      links: (product.links || []).filter((link) => !/github|repository|source|api/i.test(link.type || "")),
      upvotes: undefined,
      reviews: undefined
    })),
    upvotes: undefined,
    investorInterest: undefined
  };
}

function hasPartnerStackGrant(submission, viewer) {
  if (viewer?.role !== "b2b_partner") return false;
  const grants = Array.isArray(submission?.partnerGrants)
    ? submission.partnerGrants
    : Array.isArray(submission?.technicalProfile?.partnerGrants)
      ? submission.technicalProfile.partnerGrants
      : [];
  return grants.some((grant) => {
    const partnerMatch =
      (grant.partnerId && grant.partnerId === viewer.b2bProfileId) ||
      (grant.partnerEmail && grant.partnerEmail === viewer.email);
    const active = !grant.expiresAt || Date.parse(grant.expiresAt) > Date.now();
    return partnerMatch && active && Array.isArray(grant.scopes) && grant.scopes.includes("technical_profile");
  });
}

function filterBountyRequestsForViewer(requests = [], viewer) {
  if (viewer?.canScore) return requests;
  if (viewer?.role !== "b2b_partner") return [];
  return requests
    .filter((request) => request.requesterEmail === viewer.email || request.requesterUserId === viewer.id)
    .map(({ internalNote: _internalNote, ...request }) => request);
}

function filterConnectionRequestsForViewer(requests = [], snapshot, viewer) {
  if (viewer?.canScore) return requests;
  if (viewer?.role === "b2b_partner") {
    return requests
      .filter((request) => request.requesterEmail === viewer.email || request.email === viewer.email)
      .map(({ internalNote: _internalNote, founderConsentByUserId: _founderConsentByUserId, updatedBy: _updatedBy, ...request }) => request);
  }
  if (viewer?.role !== "member") return [];
  const ownedStartupIds = new Set(
    (snapshot.submissions || [])
      .filter((submission) => submission.ownerId === viewer.id || submission.ownerEmail === viewer.email)
      .map((submission) => submission.id)
  );
  return requests
    .filter((request) => ownedStartupIds.has(request.startupId))
    .map((request) => {
      const { internalNote: _internalNote, founderConsentByUserId: _founderConsentByUserId, updatedBy: _updatedBy, ...safe } = request;
      if (["mutually_accepted", "intro_scheduled", "discovery", "pilot", "production", "expansion"].includes(request.status)) return safe;
      return { ...safe, email: "", requesterEmail: "", requesterUserId: null };
    });
}

async function readJson(req) {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function json(payload, status = 200) {
  return corsResponse(JSON.stringify(payload), status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
}

function corsResponse(body, status, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      ...headers
    }
  });
}
