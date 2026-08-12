import { createHash } from "node:crypto";

const BENEFIT_APPLICATION_STATUSES = new Set([
  "interest",
  "link_sent",
  "submitted",
  "approved",
  "rejected",
  "fulfilled",
  "cancelled"
]);
const BENEFIT_VISIBILITIES = new Set(["all_members", "selected_teams", "paused"]);
const BENEFIT_VERIFICATION_STATUSES = new Set(["confirmed", "pending", "paused"]);
const EVENT_REGISTRATION_STATUSES = new Set(["registered", "cancelled", "attended", "no_show"]);
const WEEKLY_REPORT_STATUSES = new Set(["submitted", "needs_update", "reviewed"]);
const COLLABORATION_REVIEW_RESPONSE_STATUSES = new Set(["approved", "declined"]);

export function buildProgramActionSnapshot(hub, events = [], viewer = hub?.viewer || null) {
  const staff = Boolean(viewer?.canScore);
  const viewerTeamId = String(hub?.viewerTeam?.id ?? "");
  const applications = (hub?.benefitApplications || []).map((item) => ({ ...item }));
  const registrations = (hub?.eventRegistrations || []).map((item) => ({ ...item }));
  const reports = (hub?.weeklyReports || []).map((item) => ({ ...item }));
  const collaborationReviews = [];
  const collaborationAuditLogs = [];
  const configs = new Map((hub?.benefits || []).map((benefit) => [String(benefit.id), defaultBenefitConfig(benefit)]));

  for (const event of [...events].sort(sortOldestEvent)) {
    applyProgramActionEvent({ applications, registrations, reports, collaborationReviews, collaborationAuditLogs, configs }, event);
  }

  const visibleApplications = staff
    ? applications
    : applications.filter((item) => sameId(item.teamId, viewerTeamId) || item.applicantEmail === viewer?.email);
  const visibleRegistrations = staff
    ? registrations
    : registrations.filter((item) => sameId(item.teamId, viewerTeamId) || item.registrantEmail === viewer?.email);
  const visibleReports = staff
    ? reports
    : reports.filter((item) => sameId(item.teamId, viewerTeamId) || item.submitterEmail === viewer?.email);
  const visibleCollaborationReviews = (staff
    ? collaborationReviews
    : collaborationReviews.filter(
        (item) => sameId(item.requesterTeamId, viewerTeamId) || sameId(item.targetTeamId, viewerTeamId)
      )
  ).map((item) => safeCollaborationReview(item, viewerTeamId, staff));

  const benefits = (hub?.benefits || [])
    .map((benefit) => {
      const config = configs.get(String(benefit.id)) || defaultBenefitConfig(benefit);
      const available = benefitAvailableToTeam(config, viewerTeamId, staff);
      if (!available && !staff) return null;
      const viewerApplication = latestFor(
        visibleApplications.filter((item) => sameId(item.benefitId, benefit.id))
      );
      const eligibilityAssessment =
        viewerApplication?.eligibility ||
        assessBenefitEligibility(config, hub?.viewerTeam, null, hub?.project?.generatedAt || new Date().toISOString());
      if (!staff && !benefit.isActive && !viewerApplication) return null;
      const publicConfig = staff ? config : withoutSelectedTeams(config);
      return {
        ...benefit,
        applications: staff ? applications.filter((item) => sameId(item.benefitId, benefit.id)).length : undefined,
        value: config.value || benefit.value,
        eligibility: [...config.eligibility],
        applicationInstructions: config.applicationInstructions,
        applicationUrl: config.applicationUrl,
        applicationMode: config.applicationUrl ? "external" : "assisted",
        eligibilityRule: config.eligibilityRule || "staff_review",
        eligibilityAssessment,
        verificationStatus: config.verificationStatus,
        visibility: config.visibility,
        availableToViewer: available,
        canApply:
          Boolean(hub?.permissions?.canApplyBenefits) &&
          Boolean(benefit.isActive) &&
          available &&
          config.verificationStatus === "confirmed" &&
          eligibilityAssessment.canApply !== false &&
          !activeBenefitApplication(viewerApplication),
        viewerApplication: viewerApplication || null,
        operations: publicConfig
      };
    })
    .filter(Boolean);

  const projectedEvents = (hub?.events || [])
    .filter((programEvent) => staff || eventAvailableToTeam(programEvent, hub?.viewerTeam))
    .map((programEvent) => ({
      ...programEvent,
      registrations: staff
        ? registrations.filter((item) => sameId(item.eventId, programEvent.id) && item.status !== "cancelled").length
        : undefined,
      attendance: staff
        ? registrations.filter((item) => sameId(item.eventId, programEvent.id) && item.status === "attended").length
        : undefined,
      viewerRegistration:
        latestFor(visibleRegistrations.filter((item) => sameId(item.eventId, programEvent.id))) || null,
      canRegister: Boolean(hub?.permissions?.canRegisterEvents) && !isPast(programEvent.date)
    }));

  return {
    ...hub,
    permissions: {
      ...(hub?.permissions || {}),
      canApplyBenefits: Boolean(hub?.viewerTeam && viewer?.role === "member"),
      canRegisterEvents: Boolean(hub?.viewerTeam && viewer?.role === "member"),
      canSubmitWeeklyReport: Boolean(hub?.viewerTeam && viewer?.role === "member"),
      canRequestCollaborationReview: Boolean(hub?.viewerTeam && viewer?.role === "member"),
      canManageProgramActions: staff
    },
    benefits,
    events: projectedEvents,
    benefitApplications: visibleApplications.sort(sortNewest),
    eventRegistrations: visibleRegistrations.sort(sortNewest),
    weeklyReports: visibleReports.sort(sortNewest),
    collaborationReviews: visibleCollaborationReviews.sort(sortNewest),
    collaborationReviewSummary: collaborationReviewSummary(visibleCollaborationReviews),
    programAuditLogs: staff ? collaborationAuditLogs.sort(sortNewest).slice(0, 200) : null,
    programQueues: staff
      ? {
          benefitApplications: applications.sort(sortNewest),
          eventRegistrations: registrations.sort(sortNewest),
          weeklyReports: reports.sort(sortNewest),
          collaborationReviews: visibleCollaborationReviews.sort(sortNewest)
        }
      : null
  };
}

export function createProgramActionEvent(action, payload, hub, viewer, now = new Date().toISOString()) {
  assertPlainObject(payload, "payload");
  const staff = Boolean(viewer?.canScore);
  const team = hub?.viewerTeam;

  if (action === "createCollaborationReview") {
    requireMemberTeam(viewer, team);
    const targetTeamId = requiredText(payload, "targetTeamId", 120);
    const eligibleTargets = Array.isArray(hub?.memberDirectory) ? hub.memberDirectory : hub?.teams || [];
    const targetTeam = eligibleTargets.find((item) => sameId(item.id, targetTeamId) && !sameId(item.id, team.id));
    if (!targetTeam) throw statusError("협업 검토를 요청할 참가기업을 찾을 수 없습니다.", 404);
    const duplicate = (hub.collaborationReviews || []).some(
      (item) =>
        sameId(item.requesterTeamId, team.id) &&
        sameId(item.targetTeamId, targetTeam.id) &&
        item.status === "pending"
    );
    if (duplicate) throw statusError("이 기업에 답변을 기다리는 협업 검토 요청이 이미 있습니다.", 409);
    const review = {
      id: eventId("collaboration_review", `${team.id}:${targetTeam.id}`, now),
      requesterTeamId: team.id,
      requesterTeamName: team.name || team.companyName || viewer.organization || "요청 팀",
      targetTeamId: targetTeam.id,
      targetTeamName: targetTeam.name || targetTeam.companyName || "대상 팀",
      purpose: requiredText(payload, "purpose", 800),
      status: "pending",
      createdAt: now,
      updatedAt: now,
      respondedAt: null,
      responseNote: "",
      source: "program_hub"
    };
    return collaborationReviewEvent("collaboration_review_created", review, viewer, team, now, "requested");
  }

  if (action === "respondCollaborationReview") {
    requireMemberTeam(viewer, team);
    const reviewId = requiredText(payload, "reviewId", 120);
    const status = requiredText(payload, "status", 40);
    if (!COLLABORATION_REVIEW_RESPONSE_STATUSES.has(status)) {
      throw statusError("지원하지 않는 협업 검토 응답입니다.", 400);
    }
    const review = (hub.collaborationReviews || []).find((item) => item.id === reviewId);
    if (!review) throw statusError("협업 검토 요청을 찾을 수 없습니다.", 404);
    if (!sameId(review.targetTeamId, team.id)) {
      throw statusError("요청을 받은 팀만 협업 검토에 응답할 수 있습니다.", 403);
    }
    if (review.status !== "pending") throw statusError("이미 응답한 협업 검토 요청입니다.", 409);
    const update = {
      reviewId,
      status,
      responseNote: optionalText(payload.responseNote, 800),
      updatedAt: now,
      respondedAt: now
    };
    return collaborationReviewEvent(
      "collaboration_review_status_updated",
      { ...review, ...update },
      viewer,
      team,
      now,
      status,
      update
    );
  }

  if (action === "applyBenefit") {
    requireMemberTeam(viewer, team);
    const benefit = (hub.benefits || []).find((item) => sameId(item.id, payload.benefitId));
    if (!benefit) throw statusError("Benefit not found.", 404);
    if (!benefit.canApply) throw statusError("This benefit is not currently available for application.", 409);
    const duplicate = (hub.benefitApplications || []).some(
      (item) => sameId(item.benefitId, benefit.id) && activeBenefitApplication(item)
    );
    if (duplicate) throw statusError("An active application already exists for this benefit.", 409);
    const eligibility = validateBenefitApplicationEligibility(benefit, payload, now);
    const application = {
      id: eventId("benefit_application", `${team.id}:${benefit.id}`, now),
      benefitId: benefit.id,
      benefitTitle: benefit.title,
      provider: benefit.provider,
      teamId: team.id,
      teamName: team.name || team.companyName || viewer.organization || "Team",
      applicantUserId: viewer.id || null,
      applicantEmail: viewer.email,
      status: "interest",
      note: optionalText(payload.note, 800),
      eligibility,
      appliedAt: now,
      updatedAt: now,
      source: "program_hub"
    };
    return { id: application.id, type: "benefit_application_created", application, createdAt: now };
  }

  if (action === "cancelBenefitApplication") {
    requireMemberTeam(viewer, team);
    const application = (hub.benefitApplications || []).find((item) => item.id === requiredText(payload, "applicationId", 120));
    if (!application) throw statusError("Benefit application not found.", 404);
    if (!sameId(application.teamId, team.id) && application.applicantEmail !== viewer.email) {
      throw statusError("You can only cancel your team's application.", 403);
    }
    return {
      id: eventId("benefit_application_update", `${application.id}:cancelled`, now),
      type: "benefit_application_status_updated",
      update: { applicationId: application.id, status: "cancelled", updatedAt: now, reviewedAt: now },
      createdAt: now
    };
  }

  if (action === "updateBenefitApplication") {
    requireStaff(staff);
    const applicationId = requiredText(payload, "applicationId", 120);
    const status = requiredText(payload, "status", 40);
    if (!BENEFIT_APPLICATION_STATUSES.has(status)) throw statusError("Unsupported benefit application status.", 400);
    if (!(hub.benefitApplications || []).some((item) => item.id === applicationId)) {
      throw statusError("Benefit application not found.", 404);
    }
    return {
      id: eventId("benefit_application_update", `${applicationId}:${status}`, now),
      type: "benefit_application_status_updated",
      update: {
        applicationId,
        status,
        internalNote: optionalText(payload.internalNote, 1000),
        updatedAt: now,
        reviewedAt: now,
        reviewedBy: viewer.email
      },
      createdAt: now
    };
  }

  if (action === "upsertBenefitConfig") {
    requireStaff(staff);
    const benefitId = requiredText(payload, "benefitId", 120);
    const benefit = (hub.benefits || []).find((item) => sameId(item.id, benefitId));
    if (!benefit) throw statusError("Benefit not found.", 404);
    const visibility = optionalText(payload.visibility, 40) || "all_members";
    const verificationStatus = optionalText(payload.verificationStatus, 40) || "confirmed";
    if (!BENEFIT_VISIBILITIES.has(visibility)) throw statusError("Unsupported benefit visibility.", 400);
    if (!BENEFIT_VERIFICATION_STATUSES.has(verificationStatus)) throw statusError("Unsupported verification status.", 400);
    const config = {
      benefitId: benefit.id,
      value: optionalText(payload.value, 500) || benefit.value,
      eligibility: list(payload.eligibility, 12, 240),
      applicationInstructions: optionalText(payload.applicationInstructions, 1600),
      applicationUrl: safeUrl(payload.applicationUrl),
      visibility,
      selectedTeamIds: list(payload.selectedTeamIds, 200, 120),
      verificationStatus,
      updatedAt: now,
      updatedBy: viewer.email
    };
    return {
      id: eventId("benefit_config", benefit.id, now),
      type: "benefit_config_upserted",
      config,
      createdAt: now
    };
  }

  if (action === "registerEvent") {
    requireMemberTeam(viewer, team);
    const programEvent = (hub.events || []).find((item) => sameId(item.id, payload.eventId));
    if (!programEvent) throw statusError("Event not found.", 404);
    if (isPast(programEvent.date)) throw statusError("Past events cannot accept new RSVPs.", 409);
    const duplicate = (hub.eventRegistrations || []).some(
      (item) => sameId(item.eventId, programEvent.id) && item.status !== "cancelled"
    );
    if (duplicate) throw statusError("Your team is already registered for this event.", 409);
    const registration = {
      id: eventId("event_registration", `${team.id}:${programEvent.id}`, now),
      eventId: programEvent.id,
      eventTitle: programEvent.title,
      teamId: team.id,
      teamName: team.name || team.companyName || viewer.organization || "Team",
      registrantUserId: viewer.id || null,
      registrantEmail: viewer.email,
      status: "registered",
      note: optionalText(payload.note, 500),
      registeredAt: now,
      updatedAt: now,
      source: "program_hub"
    };
    return { id: registration.id, type: "event_registration_created", registration, createdAt: now };
  }

  if (action === "submitWeeklyReport") {
    requireMemberTeam(viewer, team);
    const weekLabel = requiredText(payload, "weekLabel", 80);
    const existing = latestFor(
      (hub.weeklyReports || []).filter(
        (item) => sameId(item.teamId, team.id) && normalizedLabel(item.weekLabel) === normalizedLabel(weekLabel)
      )
    );
    if (existing && existing.status !== "needs_update") {
      throw statusError("A weekly report already exists for this period.", 409);
    }
    const report = {
      ...(existing || {}),
      id: existing?.id || eventId("weekly_report", `${team.id}:${normalizedLabel(weekLabel)}`, now),
      teamId: team.id,
      teamName: team.name || team.companyName || viewer.organization || "Team",
      submitterUserId: viewer.id || null,
      submitterEmail: viewer.email,
      weekLabel,
      progress: requiredText(payload, "progress", 2400),
      nextSteps: requiredText(payload, "nextSteps", 1600),
      blockers: optionalText(payload.blockers, 1200),
      status: "submitted",
      submittedAt: existing?.submittedAt || now,
      updatedAt: now,
      reviewedAt: null,
      reviewedBy: null,
      source: "program_hub"
    };
    return {
      id: eventId("weekly_report_submit", report.id, now),
      type: "weekly_report_submitted",
      report,
      createdAt: now
    };
  }

  if (action === "updateWeeklyReportStatus") {
    requireStaff(staff);
    const reportId = requiredText(payload, "reportId", 120);
    const status = requiredText(payload, "status", 40);
    if (!WEEKLY_REPORT_STATUSES.has(status)) throw statusError("Unsupported weekly report status.", 400);
    if (!(hub.weeklyReports || []).some((item) => item.id === reportId)) {
      throw statusError("Weekly report not found.", 404);
    }
    return {
      id: eventId("weekly_report_update", `${reportId}:${status}`, now),
      type: "weekly_report_status_updated",
      update: {
        reportId,
        status,
        staffNote: optionalText(payload.staffNote, 1000),
        updatedAt: now,
        reviewedAt: now,
        reviewedBy: viewer.email
      },
      createdAt: now
    };
  }

  if (action === "cancelEventRegistration") {
    requireMemberTeam(viewer, team);
    const registration = (hub.eventRegistrations || []).find(
      (item) => item.id === requiredText(payload, "registrationId", 120)
    );
    if (!registration) throw statusError("Event registration not found.", 404);
    if (!sameId(registration.teamId, team.id) && registration.registrantEmail !== viewer.email) {
      throw statusError("You can only cancel your team's RSVP.", 403);
    }
    return {
      id: eventId("event_registration_update", `${registration.id}:cancelled`, now),
      type: "event_registration_status_updated",
      update: { registrationId: registration.id, status: "cancelled", updatedAt: now },
      createdAt: now
    };
  }

  if (action === "updateEventRegistration") {
    requireStaff(staff);
    const registrationId = requiredText(payload, "registrationId", 120);
    const status = requiredText(payload, "status", 40);
    if (!EVENT_REGISTRATION_STATUSES.has(status)) throw statusError("Unsupported RSVP status.", 400);
    if (!(hub.eventRegistrations || []).some((item) => item.id === registrationId)) {
      throw statusError("Event registration not found.", 404);
    }
    return {
      id: eventId("event_registration_update", `${registrationId}:${status}`, now),
      type: "event_registration_status_updated",
      update: { registrationId, status, updatedAt: now, reviewedBy: viewer.email },
      createdAt: now
    };
  }

  throw statusError(`Unsupported program action: ${action || "unknown"}.`, 400);
}

export function applyProgramActionEvent(state, event) {
  if (!event || typeof event !== "object") return state;
  if (event.type === "benefit_application_created" && event.application) {
    state.applications.push({ ...event.application });
  }
  if (event.type === "benefit_application_status_updated" && event.update) {
    const item = state.applications.find((application) => application.id === event.update.applicationId);
    if (item) Object.assign(item, event.update);
  }
  if (event.type === "benefit_config_upserted" && event.config) {
    const current = state.configs.get(String(event.config.benefitId)) || {};
    state.configs.set(String(event.config.benefitId), { ...current, ...event.config });
  }
  if (event.type === "event_registration_created" && event.registration) {
    state.registrations.push({ ...event.registration });
  }
  if (event.type === "event_registration_status_updated" && event.update) {
    const item = state.registrations.find((registration) => registration.id === event.update.registrationId);
    if (item) Object.assign(item, event.update);
  }
  if (event.type === "weekly_report_submitted" && event.report) {
    const existingIndex = state.reports.findIndex((report) => report.id === event.report.id);
    if (existingIndex >= 0) state.reports[existingIndex] = { ...event.report };
    else state.reports.push({ ...event.report });
  }
  if (event.type === "weekly_report_status_updated" && event.update) {
    const item = state.reports.find((report) => report.id === event.update.reportId);
    if (item) Object.assign(item, event.update);
  }
  if (event.type === "collaboration_review_created" && event.review) {
    state.collaborationReviews.push({ ...event.review });
  }
  if (event.type === "collaboration_review_status_updated" && event.update) {
    const item = state.collaborationReviews.find((review) => review.id === event.update.reviewId);
    if (item) Object.assign(item, event.update);
  }
  if (event.audit && event.audit.entityType === "collaboration_review") {
    state.collaborationAuditLogs.push({ ...event.audit });
  }
  return state;
}

function collaborationReviewEvent(type, review, viewer, actorTeam, now, action, update = null) {
  const event = {
    id: eventId("collaboration_review_event", `${review.id}:${action}`, now),
    type,
    ...(type === "collaboration_review_created" ? { review } : { update }),
    audit: {
      id: eventId("collaboration_review_audit", `${review.id}:${action}`, now),
      entityType: "collaboration_review",
      entityId: review.id,
      action,
      actorUserId: viewer?.id || null,
      actorEmail: viewer?.email || "",
      actorTeamId: actorTeam?.id ?? null,
      actorTeamName: actorTeam?.name || actorTeam?.companyName || viewer?.organization || "Team",
      requesterTeamId: review.requesterTeamId,
      requesterTeamName: review.requesterTeamName,
      targetTeamId: review.targetTeamId,
      targetTeamName: review.targetTeamName,
      createdAt: now,
      updatedAt: now
    },
    createdAt: now
  };
  return event;
}

function safeCollaborationReview(review, viewerTeamId, staff) {
  const direction = staff
    ? "staff"
    : sameId(review.targetTeamId, viewerTeamId)
      ? "incoming"
      : "outgoing";
  return {
    id: review.id,
    requesterTeamId: review.requesterTeamId,
    requesterTeamName: review.requesterTeamName,
    targetTeamId: review.targetTeamId,
    targetTeamName: review.targetTeamName,
    purpose: review.purpose,
    status: review.status,
    responseNote: review.responseNote || "",
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    respondedAt: review.respondedAt || null,
    direction,
    canRespond: !staff && direction === "incoming" && review.status === "pending"
  };
}

function collaborationReviewSummary(reviews) {
  const items = Array.isArray(reviews) ? reviews : [];
  return {
    total: items.length,
    incoming: items.filter((item) => item.direction === "incoming").length,
    incomingPending: items.filter((item) => item.direction === "incoming" && item.status === "pending").length,
    outgoing: items.filter((item) => item.direction === "outgoing").length,
    outgoingPending: items.filter((item) => item.direction === "outgoing" && item.status === "pending").length,
    approved: items.filter((item) => item.status === "approved").length,
    declined: items.filter((item) => item.status === "declined").length
  };
}

function defaultBenefitConfig(benefit) {
  const haystack = `${benefit?.provider || ""} ${benefit?.title || ""} ${benefit?.value || ""} ${benefit?.description || ""}`
    .normalize("NFKC")
    .toLowerCase();
  const discussionPending = /(?:논의|협의)\s*중/u.test(haystack);
  const base = {
    benefitId: benefit?.id,
    value: benefit?.value || "",
    eligibility: [],
    eligibilityRule: "staff_review",
    applicationInstructions: "신청 의사를 남기면 운영진이 제공사별 신청 경로와 다음 단계를 안내합니다.",
    applicationUrl: "",
    visibility: "all_members",
    selectedTeamIds: [],
    verificationStatus: discussionPending ? "pending" : "confirmed",
    source: "program_database"
  };
  if (haystack.includes("aws") || haystack.includes("amazon web services")) {
    return {
      ...base,
      value: benefit?.value || "팀당 USD 1,000 크레딧 · 파트너 기술 세션",
      eligibility: ["프로그램 참여 팀", "최종 자격과 이용 기간은 제공사 확인 후 확정"],
      applicationInstructions: "신청 의사를 남기면 운영진이 AWS 제공 경로와 세션 일정을 안내합니다."
    };
  }
  if (haystack.includes("google cloud") || haystack.includes("gcp")) {
    return {
      ...base,
      value: benefit?.value || "조건 충족 팀 대상 USD 2,500 크레딧",
      eligibility: ["법인 설립 2년 이내", "기존 Google Cloud 크레딧 수령액 USD 2,500 미만", "팀 웹사이트 보유"],
      eligibilityRule: "google_cloud_2500_v1",
      applicationInstructions: "세 가지 자격 조건을 모두 확인한 뒤 신청 의사를 남겨주세요. 운영진이 제공사 신청 경로를 안내합니다."
    };
  }
  if (haystack.includes("supabase")) {
    return {
      ...base,
      eligibility: ["제공 가능 여부와 세부 조건 확인 중"],
      applicationInstructions: "파트너 제공 여부가 확정되면 신청을 열 예정입니다.",
      verificationStatus: "pending"
    };
  }
  return base;
}

function benefitAvailableToTeam(config, viewerTeamId, staff) {
  if (staff) return true;
  if (config.visibility === "paused") return false;
  if (config.visibility === "selected_teams") {
    return Boolean(viewerTeamId && config.selectedTeamIds.some((id) => sameId(id, viewerTeamId)));
  }
  return true;
}

function assessBenefitEligibility(config, team, priorGoogleCreditsUsd = null, now = new Date().toISOString()) {
  if (config?.eligibilityRule !== "google_cloud_2500_v1") {
    return { status: "staff_review", canApply: true, reasons: [] };
  }
  const reasons = [];
  if (!team?.isIncorporated) reasons.push("법인 설립 여부가 확인되지 않았습니다.");
  const incorporationDate = parseDateOnly(team?.incorporationDate);
  if (!incorporationDate) {
    reasons.push("법인 설립일이 필요합니다.");
  } else {
    const reference = parseDateOnly(now) || new Date();
    const cutoff = new Date(reference);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
    if (incorporationDate > reference) reasons.push("법인 설립일을 운영진이 확인해야 합니다.");
    if (incorporationDate < cutoff) reasons.push("법인 설립 후 2년이 지났습니다.");
  }
  if (!team?.websiteUrl) reasons.push("유효한 팀 웹사이트가 필요합니다.");
  if (priorGoogleCreditsUsd !== null) {
    if (!Number.isFinite(priorGoogleCreditsUsd) || priorGoogleCreditsUsd < 0) reasons.push("기존 크레딧 수령액을 확인해 주세요.");
    else if (priorGoogleCreditsUsd >= 2500) reasons.push("기존 Google Cloud 크레딧 수령액이 USD 2,500 이상입니다.");
  }
  const staticReady = Boolean(team?.isIncorporated && incorporationDate && team?.websiteUrl) && !reasons.length;
  return {
    status: reasons.length ? "ineligible_or_needs_information" : priorGoogleCreditsUsd === null ? "attestation_required" : "eligible",
    canApply: staticReady,
    reasons,
    inputs: {
      isIncorporated: Boolean(team?.isIncorporated),
      incorporationDate: team?.incorporationDate || null,
      websitePresent: Boolean(team?.websiteUrl),
      priorGoogleCreditsUsd
    },
    evaluatedAt: now
  };
}

function validateBenefitApplicationEligibility(benefit, payload, now) {
  if (benefit?.eligibilityRule !== "google_cloud_2500_v1") {
    return { status: "staff_review", canApply: true, reasons: [], evaluatedAt: now };
  }
  if (payload.eligibilityAttested !== true) {
    throw statusError("Confirm that the Google Cloud eligibility information is accurate.", 400);
  }
  if (payload.priorGoogleCreditsUsd === "" || payload.priorGoogleCreditsUsd === null || payload.priorGoogleCreditsUsd === undefined) {
    throw statusError("priorGoogleCreditsUsd is required for Google Cloud.", 400);
  }
  const priorGoogleCreditsUsd = Number(payload.priorGoogleCreditsUsd);
  if (!Number.isFinite(priorGoogleCreditsUsd) || priorGoogleCreditsUsd < 0) {
    throw statusError("priorGoogleCreditsUsd must be a non-negative number.", 400);
  }
  if (priorGoogleCreditsUsd >= 2500) {
    throw statusError("Google Cloud requires prior credits below USD 2,500.", 409);
  }
  return {
    status: "eligible",
    canApply: true,
    reasons: [],
    inputs: { ...(benefit.eligibilityAssessment?.inputs || {}), priorGoogleCreditsUsd },
    attested: true,
    evaluatedAt: now
  };
}

function parseDateOnly(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function eventAvailableToTeam(programEvent, team) {
  if (programEvent?.teamId && !sameId(programEvent.teamId, team?.id)) return false;
  const target = String(programEvent?.targetGroup || "").trim().toLowerCase();
  if (!target || ["all", "전체", "전체 팀", "all_members"].includes(target)) return true;
  const candidates = [team?.id, team?.name, team?.companyName, team?.group]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  return candidates.some((value) => target.includes(value));
}

function withoutSelectedTeams(config) {
  const { selectedTeamIds: _selectedTeamIds, updatedBy: _updatedBy, ...safe } = config;
  return safe;
}

function latestFor(items) {
  return [...items].sort(sortNewest)[0] || null;
}

function sortNewest(left, right) {
  return String(right.updatedAt || right.appliedAt || right.registeredAt || "").localeCompare(
    String(left.updatedAt || left.appliedAt || left.registeredAt || "")
  );
}

function sortOldestEvent(left, right) {
  return String(left?.createdAt || "").localeCompare(String(right?.createdAt || ""));
}

function activeBenefitApplication(item) {
  return Boolean(item && !["rejected", "cancelled", "fulfilled"].includes(item.status));
}

function normalizedLabel(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function requireMemberTeam(viewer, team) {
  if (viewer?.role !== "member" || !team) throw statusError("A linked program team account is required.", 403);
}

function requireStaff(staff) {
  if (!staff) throw statusError("Only SparkLabs staff can manage program operations.", 403);
}

function isPast(value) {
  if (!value) return false;
  return String(value).slice(0, 10) < new Date().toISOString().slice(0, 10);
}

function requiredText(payload, key, maxLength) {
  const value = optionalText(payload?.[key], maxLength);
  if (!value) throw statusError(`${key} is required.`, 400);
  return value;
}

function optionalText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function list(value, maxItems, maxLength) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[\n,]+/);
  return [...new Set(values.map((item) => optionalText(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function safeUrl(value) {
  const text = optionalText(value, 1000);
  if (!text) return "";
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Unsafe URL");
    return url.toString();
  } catch {
    throw statusError("applicationUrl must be a valid HTTP(S) URL.", 400);
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw statusError(`${label} must be an object.`, 400);
}

function sameId(left, right) {
  return String(left ?? "") === String(right ?? "");
}

function eventId(prefix, material, now) {
  return `${prefix}_${createHash("sha256").update(`${material}:${now}`).digest("hex").slice(0, 18)}`;
}

function statusError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
