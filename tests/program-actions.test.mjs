import assert from "node:assert/strict";
import test from "node:test";

import { buildProgramActionSnapshot, createProgramActionEvent } from "../netlify/lib/program-actions.mjs";

const MEMBER = { id: "user-alpha", email: "alpha@example.com", role: "member", canScore: false };
const OTHER_MEMBER = { id: "user-beta", email: "beta@example.com", role: "member", canScore: false };
const STAFF = { id: "staff-1", email: "staff@sparklabs.co.kr", role: "sparklabs", canScore: true };
const ALPHA = { id: 1, name: "Alpha", companyName: "Alpha Inc.", group: "Discoverer" };
const BETA = { id: 2, name: "Beta", companyName: "Beta Inc.", group: "Discoverer" };
const GAMMA = { id: 3, name: "Gamma", companyName: "Gamma Inc.", group: "Discoverer" };
const T1 = "2026-08-04T01:00:00.000Z";
const T2 = "2026-08-04T02:00:00.000Z";

test("benefit applications derive the linked team and reject an active duplicate", () => {
  const initial = buildProgramActionSnapshot(makeHub(), [], MEMBER);
  const created = createProgramActionEvent(
    "applyBenefit",
    { benefitId: "aws", teamId: 999, teamName: "Injected team", note: "Interested" },
    initial,
    MEMBER,
    T1
  );

  assert.equal(created.type, "benefit_application_created");
  assert.equal(created.application.teamId, ALPHA.id);
  assert.equal(created.application.teamName, ALPHA.name);
  assert.equal(created.application.applicantEmail, MEMBER.email);
  assert.equal(created.application.status, "interest");

  const current = buildProgramActionSnapshot(makeHub(), [created], MEMBER);
  assert.equal(current.benefitApplications.length, 1);
  assert.equal(current.benefits[0].viewerApplication.id, created.application.id);
  assert.equal(current.benefits[0].canApply, false);
  assert.throws(
    () => createProgramActionEvent("applyBenefit", { benefitId: "aws" }, current, MEMBER, T2),
    (error) => error.status === 409 && /(active application|currently available)/i.test(error.message)
  );
});

test("chronological replay applies staff status updates and keeps status private to the team", () => {
  const memberInitial = buildProgramActionSnapshot(makeHub(), [], MEMBER);
  const created = createProgramActionEvent("applyBenefit", { benefitId: "aws" }, memberInitial, MEMBER, T1);
  const staffCurrent = buildProgramActionSnapshot(makeHub({ viewer: STAFF, team: null }), [created], STAFF);
  const approved = createProgramActionEvent(
    "updateBenefitApplication",
    { applicationId: created.application.id, status: "approved", internalNote: "Verified" },
    staffCurrent,
    STAFF,
    T2
  );

  const memberView = buildProgramActionSnapshot(makeHub(), [approved, created], MEMBER);
  assert.equal(memberView.benefitApplications[0].status, "approved");
  assert.equal(memberView.benefits[0].viewerApplication.status, "approved");
  assert.equal(memberView.programQueues, null);

  const otherView = buildProgramActionSnapshot(makeHub({ viewer: OTHER_MEMBER, team: BETA }), [approved, created], OTHER_MEMBER);
  assert.deepEqual(otherView.benefitApplications, []);
  assert.equal(otherView.benefits[0].viewerApplication, null);

  const staffView = buildProgramActionSnapshot(makeHub({ viewer: STAFF, team: null }), [approved, created], STAFF);
  assert.equal(staffView.programQueues.benefitApplications.length, 1);
  assert.equal(staffView.programQueues.benefitApplications[0].status, "approved");
  assert.equal(staffView.programQueues.benefitApplications[0].reviewedBy, STAFF.email);
});

test("selected-team benefit visibility is enforced without disclosing the allowlist", () => {
  const staffHub = makeHub({ viewer: STAFF, team: null });
  const configEvent = createProgramActionEvent(
    "upsertBenefitConfig",
    {
      benefitId: "aws",
      visibility: "selected_teams",
      selectedTeamIds: [ALPHA.id],
      verificationStatus: "confirmed",
      applicationInstructions: "Use the staff-provided application route."
    },
    staffHub,
    STAFF,
    T1
  );

  const alphaView = buildProgramActionSnapshot(makeHub(), [configEvent], MEMBER);
  assert.equal(alphaView.benefits.length, 1);
  assert.equal(alphaView.benefits[0].availableToViewer, true);
  assert.equal(Object.hasOwn(alphaView.benefits[0].operations, "selectedTeamIds"), false);

  const betaView = buildProgramActionSnapshot(makeHub({ viewer: OTHER_MEMBER, team: BETA }), [configEvent], OTHER_MEMBER);
  assert.deepEqual(betaView.benefits, []);

  const staffView = buildProgramActionSnapshot(staffHub, [configEvent], STAFF);
  assert.deepEqual(staffView.benefits[0].operations.selectedTeamIds, [String(ALPHA.id)]);
});

test("default benefit guidance keeps Supabase pending and displays all Google Cloud criteria", () => {
  const benefits = [
    benefit("google", "Google Cloud Credits", "Google Cloud"),
    benefit("supabase", "Supabase startup benefit", "Supabase")
  ];
  const snapshot = buildProgramActionSnapshot(makeHub({ benefits }), [], MEMBER);
  const google = snapshot.benefits.find((item) => item.id === "google");
  const supabase = snapshot.benefits.find((item) => item.id === "supabase");

  assert.deepEqual(google.eligibility, [
    "법인 설립 2년 이내",
    "기존 Google Cloud 크레딧 수령액 USD 2,500 미만",
    "팀 웹사이트 보유"
  ]);
  assert.match(google.value, /USD 2,500/);
  assert.equal(google.verificationStatus, "confirmed");
  assert.equal(supabase.verificationStatus, "pending");
  assert.equal(supabase.canApply, false);
  assert.match(supabase.applicationInstructions, /확정되면 신청을 열/);
});

test("discussion-stage benefits stay pending until staff records confirmed terms", () => {
  const benefits = [
    { ...benefit("ab180", "AB180", "AB180"), value: "논의 중" },
    { ...benefit("flitto", "Flitto", "Flitto"), value: "논의중" },
    { ...benefit("bytedance", "ByteDance 혜택", "ByteDance"), description: "혜택 범위 협의 중" }
  ];
  const pending = buildProgramActionSnapshot(makeHub({ benefits }), [], MEMBER);

  assert.deepEqual(
    pending.benefits.map((item) => item.verificationStatus),
    ["pending", "pending", "pending"]
  );
  assert.equal(pending.benefits.every((item) => item.canApply === false), true);

  const staffHub = makeHub({ viewer: STAFF, team: null, benefits });
  const confirmedEvent = createProgramActionEvent(
    "upsertBenefitConfig",
    {
      benefitId: "ab180",
      value: "AI 마케팅 분석 크레딧",
      verificationStatus: "confirmed"
    },
    staffHub,
    STAFF,
    T1
  );
  const confirmed = buildProgramActionSnapshot(makeHub({ benefits }), [confirmedEvent], MEMBER);
  const ab180 = confirmed.benefits.find((item) => item.id === "ab180");

  assert.equal(ab180.verificationStatus, "confirmed");
  assert.equal(ab180.value, "AI 마케팅 분석 크레딧");
  assert.equal(ab180.canApply, true);
});

test("Google Cloud requires all static criteria, attestation, and prior credits below USD 2,500", () => {
  const googleBenefits = [benefit("google", "Google Cloud Credits", "Google Cloud")];
  const eligibleTeam = {
    ...ALPHA,
    isIncorporated: true,
    incorporationDate: "2024-08-04",
    websiteUrl: "https://alpha.example.com"
  };
  const eligible = buildProgramActionSnapshot(makeHub({ team: eligibleTeam, benefits: googleBenefits }), [], MEMBER);
  const google = eligible.benefits[0];

  assert.equal(google.eligibilityRule, "google_cloud_2500_v1");
  assert.equal(google.eligibilityAssessment.status, "attestation_required");
  assert.equal(google.canApply, true);
  assert.throws(
    () => createProgramActionEvent("applyBenefit", { benefitId: "google", priorGoogleCreditsUsd: 2499.99 }, eligible, MEMBER, T1),
    (error) => error.status === 400 && /Confirm/.test(error.message)
  );
  assert.throws(
    () => createProgramActionEvent("applyBenefit", { benefitId: "google", priorGoogleCreditsUsd: 2500, eligibilityAttested: true }, eligible, MEMBER, T1),
    (error) => error.status === 409 && /below USD 2,500/.test(error.message)
  );

  const created = createProgramActionEvent(
    "applyBenefit",
    { benefitId: "google", priorGoogleCreditsUsd: 2499.99, eligibilityAttested: true },
    eligible,
    MEMBER,
    T1
  );
  assert.equal(created.application.eligibility.status, "eligible");
  assert.equal(created.application.eligibility.inputs.priorGoogleCreditsUsd, 2499.99);

  const tooOld = buildProgramActionSnapshot(
    makeHub({ team: { ...eligibleTeam, incorporationDate: "2024-08-03" }, benefits: googleBenefits }),
    [],
    MEMBER
  );
  assert.equal(tooOld.benefits[0].canApply, false);
  assert.match(tooOld.benefits[0].eligibilityAssessment.reasons.join(" "), /2년/);
});

test("event RSVP supports registration and cancellation while filtering team-specific events", () => {
  const events = [
    programEvent("all", "All-team workshop"),
    programEvent("alpha", "Alpha office hours", { targetGroup: "Alpha" }),
    programEvent("beta", "Beta private review", { teamId: BETA.id })
  ];
  const memberHub = makeHub({ events });
  const initial = buildProgramActionSnapshot(memberHub, [], MEMBER);

  assert.deepEqual(initial.events.map((item) => item.id), ["all", "alpha"]);
  assert.throws(
    () => createProgramActionEvent("registerEvent", { eventId: "beta" }, initial, MEMBER, T1),
    (error) => error.status === 404
  );

  const registered = createProgramActionEvent(
    "registerEvent",
    { eventId: "all", teamId: BETA.id, note: "Two attendees" },
    initial,
    MEMBER,
    T1
  );
  assert.equal(registered.registration.teamId, ALPHA.id);
  assert.equal(registered.registration.registrantEmail, MEMBER.email);

  const registeredView = buildProgramActionSnapshot(memberHub, [registered], MEMBER);
  assert.equal(registeredView.events.find((item) => item.id === "all").viewerRegistration.status, "registered");
  const cancelled = createProgramActionEvent(
    "cancelEventRegistration",
    { registrationId: registered.registration.id },
    registeredView,
    MEMBER,
    T2
  );
  const cancelledView = buildProgramActionSnapshot(memberHub, [cancelled, registered], MEMBER);
  assert.equal(cancelledView.eventRegistrations[0].status, "cancelled");
  assert.equal(cancelledView.events.find((item) => item.id === "all").viewerRegistration.status, "cancelled");

  const betaView = buildProgramActionSnapshot(
    makeHub({ viewer: OTHER_MEMBER, team: BETA, events }),
    [cancelled, registered],
    OTHER_MEMBER
  );
  assert.deepEqual(betaView.events.map((item) => item.id), ["all", "beta"]);
  assert.deepEqual(betaView.eventRegistrations, []);
  assert.equal(betaView.events.find((item) => item.id === "all").viewerRegistration, null);
});

test("weekly reports derive the linked team, stay private, and support staff review", () => {
  const initial = buildProgramActionSnapshot(makeHub(), [], MEMBER);
  const submitted = createProgramActionEvent(
    "submitWeeklyReport",
    {
      teamId: BETA.id,
      teamName: "Injected team",
      weekLabel: "2026 W31",
      progress: "Completed five customer interviews.",
      nextSteps: "Validate pricing with two design partners.",
      blockers: "Need an introduction to a security reviewer."
    },
    initial,
    MEMBER,
    T1
  );

  assert.equal(submitted.type, "weekly_report_submitted");
  assert.equal(submitted.report.teamId, ALPHA.id);
  assert.equal(submitted.report.teamName, ALPHA.name);
  assert.equal(submitted.report.submitterEmail, MEMBER.email);
  assert.equal(submitted.report.status, "submitted");

  const memberView = buildProgramActionSnapshot(makeHub(), [submitted], MEMBER);
  assert.equal(memberView.weeklyReports.length, 1);
  assert.equal(memberView.weeklyReports[0].progress, "Completed five customer interviews.");

  const otherView = buildProgramActionSnapshot(
    makeHub({ viewer: OTHER_MEMBER, team: BETA }),
    [submitted],
    OTHER_MEMBER
  );
  assert.deepEqual(otherView.weeklyReports, []);

  const staffCurrent = buildProgramActionSnapshot(makeHub({ viewer: STAFF, team: null }), [submitted], STAFF);
  assert.equal(staffCurrent.programQueues.weeklyReports.length, 1);
  const reviewed = createProgramActionEvent(
    "updateWeeklyReportStatus",
    { reportId: submitted.report.id, status: "reviewed", staffNote: "Clear next steps." },
    staffCurrent,
    STAFF,
    T2
  );

  const reviewedMemberView = buildProgramActionSnapshot(makeHub(), [reviewed, submitted], MEMBER);
  assert.equal(reviewedMemberView.weeklyReports[0].status, "reviewed");
  assert.equal(reviewedMemberView.weeklyReports[0].reviewedBy, STAFF.email);

  const reviewedStaffView = buildProgramActionSnapshot(
    makeHub({ viewer: STAFF, team: null }),
    [reviewed, submitted],
    STAFF
  );
  assert.equal(reviewedStaffView.programQueues.weeklyReports[0].status, "reviewed");
  assert.equal(reviewedStaffView.programQueues.weeklyReports[0].staffNote, "Clear next steps.");
});

test("collaboration review reaches the target Workspace and only the target team can respond", () => {
  const requesterView = buildProgramActionSnapshot(makeHub(), [], MEMBER);
  const requested = createProgramActionEvent(
    "createCollaborationReview",
    {
      targetTeamId: BETA.id,
      requesterTeamId: GAMMA.id,
      requesterTeamName: "Injected requester",
      purpose: "제품 API를 결합한 공동 고객 검증 가능성을 함께 검토하고 싶습니다."
    },
    requesterView,
    MEMBER,
    T1
  );

  assert.equal(requested.type, "collaboration_review_created");
  assert.equal(requested.review.requesterTeamId, ALPHA.id);
  assert.equal(requested.review.requesterTeamName, ALPHA.name);
  assert.equal(requested.review.targetTeamId, BETA.id);
  assert.equal(requested.review.status, "pending");

  const outgoing = buildProgramActionSnapshot(makeHub(), [requested], MEMBER);
  assert.equal(outgoing.collaborationReviews[0].direction, "outgoing");
  assert.equal(outgoing.collaborationReviews[0].canRespond, false);
  assert.equal(outgoing.collaborationReviewSummary.outgoingPending, 1);
  assert.equal(outgoing.programAuditLogs, null);
  assert.equal(JSON.stringify(outgoing.collaborationReviews).includes(MEMBER.email), false);
  assert.throws(
    () => createProgramActionEvent(
      "createCollaborationReview",
      { targetTeamId: BETA.id, purpose: "중복 요청" },
      outgoing,
      MEMBER,
      T2
    ),
    (error) => error.status === 409 && /이미/.test(error.message)
  );
  assert.throws(
    () => createProgramActionEvent(
      "respondCollaborationReview",
      { reviewId: requested.review.id, status: "approved" },
      outgoing,
      MEMBER,
      T2
    ),
    (error) => error.status === 403
  );

  const recipientView = buildProgramActionSnapshot(
    makeHub({ viewer: OTHER_MEMBER, team: BETA }),
    [requested],
    OTHER_MEMBER
  );
  assert.equal(recipientView.collaborationReviews[0].direction, "incoming");
  assert.equal(recipientView.collaborationReviews[0].canRespond, true);
  assert.equal(recipientView.collaborationReviewSummary.incomingPending, 1);

  const approved = createProgramActionEvent(
    "respondCollaborationReview",
    { reviewId: requested.review.id, status: "approved", responseNote: "Workspace에서 검토했고 대화를 이어가겠습니다." },
    recipientView,
    OTHER_MEMBER,
    T2
  );
  const requesterAfterApproval = buildProgramActionSnapshot(makeHub(), [approved, requested], MEMBER);
  assert.equal(requesterAfterApproval.collaborationReviews[0].status, "approved");
  assert.equal(requesterAfterApproval.collaborationReviews[0].responseNote, "Workspace에서 검토했고 대화를 이어가겠습니다.");
  assert.equal(requesterAfterApproval.collaborationReviewSummary.approved, 1);

  const unrelated = buildProgramActionSnapshot(
    makeHub({ viewer: { ...OTHER_MEMBER, id: "user-gamma", email: "gamma@example.com" }, team: GAMMA, teams: [ALPHA, BETA, GAMMA] }),
    [approved, requested],
    { ...OTHER_MEMBER, id: "user-gamma", email: "gamma@example.com" }
  );
  assert.deepEqual(unrelated.collaborationReviews, []);
});

test("SparkLabs staff receives an immutable collaboration review queue and actor audit log", () => {
  const requesterView = buildProgramActionSnapshot(makeHub(), [], MEMBER);
  const requested = createProgramActionEvent(
    "createCollaborationReview",
    { targetTeamId: BETA.id, purpose: "공동 PoC 가능성을 검토하고 싶습니다." },
    requesterView,
    MEMBER,
    T1
  );
  const recipientView = buildProgramActionSnapshot(
    makeHub({ viewer: OTHER_MEMBER, team: BETA }),
    [requested],
    OTHER_MEMBER
  );
  const declined = createProgramActionEvent(
    "respondCollaborationReview",
    { reviewId: requested.review.id, status: "declined" },
    recipientView,
    OTHER_MEMBER,
    T2
  );
  const staffView = buildProgramActionSnapshot(
    makeHub({ viewer: STAFF, team: null }),
    [declined, requested],
    STAFF
  );

  assert.equal(staffView.programQueues.collaborationReviews.length, 1);
  assert.equal(staffView.programQueues.collaborationReviews[0].status, "declined");
  assert.deepEqual(staffView.programAuditLogs.map((item) => item.action), ["declined", "requested"]);
  assert.deepEqual(staffView.programAuditLogs.map((item) => item.actorEmail), [OTHER_MEMBER.email, MEMBER.email]);
  assert.equal(staffView.programAuditLogs[0].requesterTeamName, ALPHA.name);
  assert.equal(staffView.programAuditLogs[0].targetTeamName, BETA.name);
});

function makeHub({ viewer = MEMBER, team = ALPHA, teams = [ALPHA, BETA], benefits = [benefit("aws", "AWS Activate Credits", "AWS")], events = [] } = {}) {
  return {
    project: { name: "SparkClaw Program", generatedAt: T1 },
    viewer,
    viewerTeam: team,
    permissions: {
      canApplyBenefits: Boolean(team && viewer.role === "member"),
      canRegisterEvents: Boolean(team && viewer.role === "member"),
      canManageProgramActions: Boolean(viewer.canScore)
    },
    teams,
    memberDirectory: viewer.role === "member" ? teams.filter((item) => item.id !== team?.id) : undefined,
    benefits,
    events,
    benefitApplications: [],
    eventRegistrations: [],
    weeklyReports: []
  };
}

function benefit(id, title, provider) {
  return {
    id,
    title,
    provider,
    category: "Cloud",
    description: "Program cloud benefit",
    value: "",
    isActive: true
  };
}

function programEvent(id, title, extra = {}) {
  return {
    id,
    title,
    date: "2099-12-01",
    targetGroup: "all_members",
    ...extra
  };
}
