export const TEAM_CARD_VISIBILITY_FIELDS = Object.freeze([
  "introduction",
  "achievements",
  "capabilities",
  "aiIdea",
  "website"
]);

export const DEFAULT_TEAM_CARD_VISIBILITY = Object.freeze({
  introduction: "public",
  achievements: "public",
  capabilities: "public",
  aiIdea: "public",
  website: "public"
});

const VISIBILITY_VALUES = new Set(["public", "private"]);

export function normalizeTeamCardVisibility(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    TEAM_CARD_VISIBILITY_FIELDS.map((field) => [
      field,
      VISIBILITY_VALUES.has(source[field]) ? source[field] : DEFAULT_TEAM_CARD_VISIBILITY[field]
    ])
  );
}

export function latestTeamCardVisibilityByTeam(events = []) {
  const settings = new Map();
  for (const event of [...(Array.isArray(events) ? events : [])].sort(sortOldest)) {
    if (event?.type !== "team_card_visibility_updated" || !event.visibility?.teamId) continue;
    const teamId = String(event.visibility.teamId);
    settings.set(teamId, {
      teamId,
      fields: normalizeTeamCardVisibility(event.visibility.fields),
      updatedAt: event.visibility.updatedAt || event.createdAt || null
    });
  }
  return settings;
}

export function projectTeamCardVisibility(hub = {}, visibilityByTeam = new Map(), viewer = hub?.viewer || null) {
  const ownerTeamId = String(hub?.viewerTeam?.id ?? "");
  const staff = Boolean(viewer?.canScore);
  const projectList = (items) => Array.isArray(items)
    ? items.map((team) => projectTeam(team, visibilityByTeam, ownerTeamId, staff))
    : items;

  const teams = projectList(hub.teams);
  const memberDirectory = projectList(hub.memberDirectory);
  const partnerDirectory = projectList(hub.partnerDirectory);
  const projectedViewerTeam = teams?.find((team) => sameId(team.id, ownerTeamId)) || hub.viewerTeam || null;

  return {
    ...hub,
    teams,
    ...(Array.isArray(hub.memberDirectory) ? { memberDirectory } : {}),
    ...(Array.isArray(hub.partnerDirectory) ? { partnerDirectory } : {}),
    viewerTeam: projectedViewerTeam,
    permissions: {
      ...(hub.permissions || {}),
      canEditTeamCardVisibility: Boolean(staff || (ownerTeamId && viewer?.role === "member"))
    }
  };
}

function projectTeam(team = {}, visibilityByTeam, ownerTeamId, staff) {
  const teamId = String(team?.id ?? "");
  const setting = visibilityByTeam.get(teamId) || null;
  const fields = normalizeTeamCardVisibility(setting?.fields);
  const owner = Boolean(ownerTeamId && sameId(teamId, ownerTeamId));
  const canSeePrivate = staff || owner;
  const visible = (field) => canSeePrivate || fields[field] === "public";
  const investor = team.investorProfile && typeof team.investorProfile === "object"
    ? { ...team.investorProfile }
    : team.investorProfile;

  if (investor && !visible("introduction")) {
    investor.partneringSummary = "";
    investor.teamSummary = "";
  }
  if (investor && !visible("achievements")) {
    investor.metrics = [];
    investor.proofPoints = [];
    investor.programProof = "";
  }
  if (investor && !visible("capabilities")) {
    investor.specialtyTasks = [];
    investor.strengthTags = [];
  }

  const projected = {
    ...team,
    investorProfile: investor,
    cardVisibility: canSeePrivate
      ? {
          fields,
          canEdit: Boolean(staff || owner),
          updatedAt: setting?.updatedAt || null
        }
      : null
  };

  if (!visible("introduction")) {
    projected.oneLiner = "";
    projected.serviceSummary = "";
  }
  if (!visible("achievements")) {
    projected.publicSignals = {};
    projected.activity = null;
  }
  if (!visible("capabilities")) {
    projected.matchingKeywords = [];
    projected.expertise = "";
  }
  if (!visible("aiIdea")) projected.aiIdeaSummary = "";
  if (!visible("website")) projected.websiteUrl = "";

  projected.cardHiddenFields = TEAM_CARD_VISIBILITY_FIELDS.filter((field) => !visible(field));
  return projected;
}

function sameId(left, right) {
  return String(left ?? "") === String(right ?? "");
}

function sortOldest(left, right) {
  return String(left?.createdAt || "").localeCompare(String(right?.createdAt || ""));
}
