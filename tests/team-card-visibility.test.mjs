import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TEAM_CARD_VISIBILITY,
  latestTeamCardVisibilityByTeam,
  normalizeTeamCardVisibility,
  projectTeamCardVisibility
} from "../netlify/lib/team-card-visibility.mjs";

const MEMBER = { id: "member-1", email: "owner@example.com", role: "member", canScore: false };
const PARTNER = { id: "partner-1", email: "partner@example.com", role: "b2b_partner", canScore: false };
const STAFF = { id: "staff-1", email: "staff@sparklabs.co.kr", role: "sparklabs", canScore: true };

test("team card visibility defaults preserve currently public card fields", () => {
  assert.deepEqual(normalizeTeamCardVisibility(), DEFAULT_TEAM_CARD_VISIBILITY);
  assert.deepEqual(normalizeTeamCardVisibility({ introduction: "private", website: "invalid" }), {
    ...DEFAULT_TEAM_CARD_VISIBILITY,
    introduction: "private"
  });
});

test("latest team setting wins and a partner cannot receive private card content", () => {
  const events = [
    visibilityEvent("2026-08-14T01:00:00.000Z", { introduction: "public" }),
    visibilityEvent("2026-08-14T02:00:00.000Z", {
      introduction: "private",
      achievements: "private",
      capabilities: "private",
      aiIdea: "private",
      website: "private"
    })
  ];
  const settings = latestTeamCardVisibilityByTeam(events);
  const hub = hubFor(PARTNER, null);
  const projected = projectTeamCardVisibility(hub, settings, PARTNER);
  const team = projected.teams[0];

  assert.equal(team.oneLiner, "");
  assert.equal(team.serviceSummary, "");
  assert.equal(team.websiteUrl, "");
  assert.equal(team.aiIdeaSummary, "");
  assert.deepEqual(team.matchingKeywords, []);
  assert.deepEqual(team.publicSignals, {});
  assert.deepEqual(team.investorProfile.metrics, []);
  assert.deepEqual(team.investorProfile.specialtyTasks, []);
  assert.equal(team.cardVisibility, null);
  assert.deepEqual(team.cardHiddenFields.sort(), ["achievements", "aiIdea", "capabilities", "introduction", "website"].sort());
});

test("the linked team and SparkLabs staff retain private content and staff can edit every card", () => {
  const settings = latestTeamCardVisibilityByTeam([
    visibilityEvent("2026-08-14T02:00:00.000Z", {
      introduction: "private",
      achievements: "private",
      capabilities: "private",
      aiIdea: "private",
      website: "private"
    })
  ]);
  const ownerView = projectTeamCardVisibility(hubFor(MEMBER, team()), settings, MEMBER);
  const staffView = projectTeamCardVisibility(hubFor(STAFF, null), settings, STAFF);

  assert.equal(ownerView.teams[0].oneLiner, "AI workflow company");
  assert.equal(ownerView.teams[0].cardVisibility.canEdit, true);
  assert.equal(ownerView.permissions.canEditTeamCardVisibility, true);
  assert.equal(staffView.teams[0].oneLiner, "AI workflow company");
  assert.equal(staffView.teams[0].cardVisibility.canEdit, true);
  assert.equal(staffView.permissions.canEditTeamCardVisibility, true);
});

function visibilityEvent(createdAt, fields) {
  return {
    id: createdAt,
    type: "team_card_visibility_updated",
    visibility: { teamId: "team-1", fields, updatedAt: createdAt },
    createdAt
  };
}

function team() {
  return {
    id: "team-1",
    name: "Owner Team",
    oneLiner: "AI workflow company",
    serviceSummary: "Automates a verified workflow.",
    aiIdeaSummary: "Agentic workflow",
    websiteUrl: "https://example.com",
    matchingKeywords: ["workflow automation"],
    expertise: "AI operations",
    publicSignals: { payingCustomers: 3 },
    investorProfile: {
      partneringSummary: "Partnering summary",
      teamSummary: "Team summary",
      metrics: ["3 customers"],
      proofPoints: [{ label: "Customer", value: "3" }],
      specialtyTasks: [{ label: "Workflow", description: "Automates work" }],
      strengthTags: ["workflow"]
    }
  };
}

function hubFor(viewer, viewerTeam) {
  return {
    viewer,
    viewerTeam,
    permissions: {},
    teams: [team()],
    memberDirectory: viewer.role === "member" ? [] : undefined,
    partnerDirectory: viewer.role === "b2b_partner" ? [team()] : undefined
  };
}
