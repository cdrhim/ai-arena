import { loadProgramHub, loadProgramHubBootstrap, sectorSummary } from "../lib/program-hub.mjs";
import { buildProgramActionSnapshot, createProgramActionEvent } from "../lib/program-actions.mjs";
import { appendProgramActionEvent, loadProgramActionEvents } from "../lib/program-actions-store.mjs";
import { collaborationFitMetrics, collaborationFitNotApplicable } from "../lib/collaboration-fit.mjs";
import {
  externalPartnerProfileForViewer,
  loadExternalPartnerProfiles,
  safeExternalPartnerProfile
} from "../lib/external-partner-profiles.mjs";
import { recordScArenaActivitySafely } from "../lib/sc-arena-activity.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";
import { loadWeeklyFeaturedSnapshotSafely } from "../lib/weekly-featured-store.mjs";

async function programHub(req) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (!["GET", "POST"].includes(req.method)) return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await verifyArenaRequest(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    const bootstrap = req.method === "GET" && new URL(req.url).searchParams.get("bootstrap") === "1";
    const [programHub, weeklyFeatured, eventsBefore] = await Promise.all([
      bootstrap ? loadProgramHubBootstrap(auth.viewer) : loadProgramHub(auth.viewer),
      bootstrap ? Promise.resolve({ available: false }) : loadWeeklyFeaturedSnapshotSafely(),
      loadProgramActionEvents()
    ]);
    const loadedHub = {
      ...programHub,
      featuredCompanies: weeklyFeatured.available ? weeklyFeatured.items : [],
      featuredCompaniesCycle: weeklyFeatured.available
        ? {
            cycleKey: weeklyFeatured.cycleKey,
            weekLabel: weeklyFeatured.weekLabel,
            publishedAt: weeklyFeatured.publishedAt,
            sourceUpdatedAt: weeklyFeatured.sourceUpdatedAt,
            refreshCadence: "monday_0900_kst"
          }
        : null
    };
    const role = loadedHub.viewer?.role || "public";
    const isolatedTest = loadedHub.viewer?.isIsolatedTest === true;
    if (!isolatedTest && !loadedHub.viewer?.canScore && ["public", "member"].includes(role) && !loadedHub.viewerTeam) {
      return json({ error: "This login is not linked to a SparkClaw program team." }, 403);
    }
    let partnerProfile = null;
    if (role === "b2b_partner") {
      const profiles = await loadExternalPartnerProfiles();
      partnerProfile = safeExternalPartnerProfile(
        externalPartnerProfileForViewer(loadedHub.viewer, profiles),
        { audience: "owner" }
      );
    }
    const baseHub = isolatedTest || ["b2b_partner", "human_validator"].includes(role)
      ? externalViewerShell(loadedHub, partnerProfile)
      : loadedHub;
    const current = buildProgramActionSnapshot(baseHub, eventsBefore, baseHub.viewer);
    if (bootstrap) return json({ ...current, bootstrap: true });
    if (req.method === "GET") return json(current);

    const body = await readJson(req);
    const event = createProgramActionEvent(body.action, body.payload || {}, current, current.viewer);
    const events = await appendProgramActionEvent(event);
    const snapshot = buildProgramActionSnapshot(baseHub, events, current.viewer);
    await recordScArenaActivitySafely({
      sourceSystem: "program_actions",
      event,
      viewer: current.viewer,
      context: {
        viewerTeam: snapshot.viewerTeam || null,
        viewerTeamId: snapshot.viewerTeam?.id || null,
        programSnapshot: snapshot
      }
    });
    return json({ ok: true, event, snapshot });
  } catch (error) {
    return json({ error: error.message }, error.status || 400);
  }
}

export default withScArenaDevelopmentLogging("program-hub", programHub);

function externalViewerShell(hub, partnerProfile = null) {
  const teams = Array.isArray(hub.partnerDirectory)
    ? hub.partnerDirectory
    : Array.isArray(hub.memberDirectory)
      ? hub.memberDirectory
      : [];
  const sectors = sectorSummary(teams);
  const profilesReady = teams.filter((team) => team.oneLiner && team.serviceSummary && team.websiteUrl).length;
  const collaborationFit = hub.viewer?.role === "b2b_partner"
    ? collaborationFitMetrics({ candidateTeams: teams, partnerProfile })
    : collaborationFitNotApplicable(teams.length);
  return {
    project: hub.project,
    viewer: hub.viewer,
    partnerProfile,
    directoryScope: "all_participating_companies",
    viewerTeam: null,
    permissions: {
      canViewOperations: false,
      canViewRawDatabase: false,
      canApplyBenefits: false,
      canRegisterEvents: false,
      canSubmitWeeklyReport: false,
      canManageProgramActions: false
    },
    metrics: {
      teams: teams.length,
      curatedCompanies: teams.length,
      profilePopulation: teams.length,
      profilesReady,
      sectors: sectors.length,
      ...collaborationFit
    },
    sectors,
    teams,
    mentors: [],
    events: [],
    benefits: [],
    mentoringSessions: [],
    weeklyReports: [],
    benefitApplications: [],
    eventRegistrations: [],
    weeklyNotice: null,
    featuredCompanies: hub.featuredCompanies || [],
    featuredCompaniesCycle: hub.featuredCompaniesCycle || null,
    dataHealth: null
  };
}

async function readJson(req) {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
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
import { withScArenaDevelopmentLogging } from "../lib/sc-arena-operational-logs.mjs";
