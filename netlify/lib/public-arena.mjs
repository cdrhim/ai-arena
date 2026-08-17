import { plainEventDescription } from "../../public/arena/event-copy.js";
import { isCommunityEventFromOrientation } from "../../public/arena/event-timeline.js";

const PUBLIC_LINK_TYPES = new Set(["website", "demo", "docs", "video", "app", "product"]);
const PUBLIC_EVENT_PATTERN = /(^|\b)(public|open|all|anyone)(\b|$)|외부|전체|누구나/i;

export function buildPublicArenaSnapshot({
  directory = [],
  submissions = [],
  program = null,
  publicTeamIds = [],
  publicEventIds = [],
  now = new Date().toISOString()
} = {}) {
  const allowedTeamIds = new Set(list(publicTeamIds));
  const allowedEventIds = new Set(list(publicEventIds));
  const published = (Array.isArray(submissions) ? submissions : [])
    .filter((submission) => submission?.status === "published" && submission?.visibility === "public")
    .map(publicCompanyFromSubmission);
  const consentedDirectory = (Array.isArray(directory) ? directory : [])
    .filter((team) => allowedTeamIds.has(String(team?.id || "")))
    .map(publicCompanyFromDirectory);
  const teams = uniqueCompanies([...published, ...consentedDirectory]).sort((left, right) =>
    left.name.localeCompare(right.name, "ko")
  );

  const events = (Array.isArray(program?.events) ? program.events : [])
    .filter((event) => isPublicEvent(event, allowedEventIds))
    .filter(isCommunityEventFromOrientation)
    .map(publicEvent)
    .sort((left, right) => String(left.date || "").localeCompare(String(right.date || "")));
  const benefits = (Array.isArray(program?.benefits) ? program.benefits : [])
    .filter(
      (benefit) =>
        benefit?.isActive &&
        benefit?.verificationStatus === "confirmed" &&
        !["paused", "selected_teams"].includes(benefit?.visibility)
    )
    .map(publicBenefit)
    .sort((left, right) => left.provider.localeCompare(right.provider, "ko"));

  const sectors = sectorSummary(Array.isArray(directory) ? directory : teams);
  return {
    project: {
      name: "SparkLabs AI Arena",
      tagline: "Where AI companies meet.",
      generatedAt: now
    },
    metrics: {
      curatedCompanies: Array.isArray(directory) ? directory.length : teams.length,
      publicProfiles: teams.length,
      sectors: sectors.length,
      publicEvents: events.length,
      verifiedBenefits: benefits.length
    },
    sectors,
    teams,
    events,
    benefits,
    featuredCriteria: ["최근 제품·고객·운영 성과", "회사 또는 공개 출처 확인", "SparkLabs 운영진 검수", "유료 노출 아님", "파트너별 개인화 아님"],
    memberAccess: {
      community: "승인된 Arena 멤버와 SparkLabs 운영진 전용",
      introductions: "요청을 받은 대상 스타트업이 동의한 경우에만 SparkLabs가 연결",
      applications: "로그인 후 자격 확인 및 신청"
    },
    privacy: "공개 동의를 받은 회사 정보와 집계 정보만 제공합니다. 비공개 프로그램 데이터는 검색 및 응답에 포함하지 않습니다."
  };
}

export function publicCompanyFromSubmission(submission = {}) {
  const links = (Array.isArray(submission.links) ? submission.links : [])
    .filter((link) => PUBLIC_LINK_TYPES.has(String(link?.type || "").toLowerCase()))
    .map((link) => ({
      type: text(link.type, 40),
      label: text(link.label || link.type, 80),
      url: safeUrl(link.url)
    }))
    .filter((link) => link.url)
    .slice(0, 6);
  const evidence = [];
  if (submission.review?.staffVerified) evidence.push("SparkLabs 검토");
  if (submission.humanValidation?.verificationStatus === "verified") evidence.push("Human validated");
  if (links.length) evidence.push("공개 제품 링크");
  if (submission.technicalProfile?.deployment) evidence.push("배포 방식 공개");
  const websiteUrl = links.find((link) => link.type === "website")?.url || links[0]?.url || "";
  return {
    id: text(submission.id, 160),
    name: text(submission.name, 160) || "AI company",
    category: text(submission.category || submission.type, 120),
    sector: text(submission.category || submission.type, 120),
    stage: text(submission.stage, 80),
    region: text(submission.region, 80),
    affiliation: text(submission.affiliation, 120),
    tagline: text(submission.tagline, 240),
    oneLiner: text(submission.tagline, 240),
    description: text(submission.shortDescription, 800),
    serviceSummary: text(submission.shortDescription, 800),
    websiteUrl,
    group: text(submission.affiliation, 120),
    tags: list([...(submission.launchTags || []), ...(submission.technicalTags || [])]).slice(0, 8),
    evidence,
    evidenceLevel: evidence.length >= 3 ? "strong" : evidence.length ? "partial" : "needs_verification",
    missingInfo: publicMissingInfo(submission),
    links,
    updatedAt: submission.updatedAt || submission.publishedAt || null,
    publicProfile: true,
    source: "member_published"
  };
}

export function publicCompanyFromDirectory(team = {}) {
  const websiteUrl = safeUrl(team.websiteUrl);
  return {
    id: `program-team-${text(team.id, 120)}`,
    name: text(team.name || team.companyName, 160) || "AI company",
    category: text(team.sector || team.domain, 120),
    sector: text(team.sector || team.domain, 120),
    stage: text(team.group, 80),
    region: "Korea",
    affiliation: "SparkLabs AI Arena",
    tagline: text(team.oneLiner || team.aiIdeaSummary, 240),
    oneLiner: text(team.oneLiner || team.aiIdeaSummary, 240),
    description: text(team.serviceSummary || team.aiIdeaSummary || team.oneLiner, 800),
    serviceSummary: text(team.serviceSummary || team.aiIdeaSummary || team.oneLiner, 800),
    websiteUrl,
    group: text(team.group, 80),
    tags: list([team.group, team.sector, team.domain]).slice(0, 8),
    evidence: ["SparkLabs 프로그램 소속", ...(websiteUrl ? ["공개 웹사이트"] : [])],
    evidenceLevel: websiteUrl ? "partial" : "needs_verification",
    missingInfo: websiteUrl ? ["최근 제품·고객 근거 확인 필요"] : ["공개 제품 링크 확인 필요"],
    links: websiteUrl ? [{ type: "website", label: "Website", url: websiteUrl }] : [],
    updatedAt: null,
    publicProfile: true,
    source: "explicit_directory_consent"
  };
}

export function isPublicEvent(event = {}, allowedEventIds = new Set()) {
  if (allowedEventIds.has(String(event.id || ""))) return true;
  return PUBLIC_EVENT_PATTERN.test(`${event.targetGroup || ""} ${event.category || ""}`.trim());
}

function publicEvent(event) {
  return {
    id: text(event.id, 120),
    title: text(event.title, 240),
    date: text(event.date, 40),
    time: text(event.time, 40),
    location: text(event.location, 240),
    category: text(event.category || event.kind, 100),
    description: text(plainEventDescription(event.description), 1200),
    isOnline: Boolean(event.isOnline),
    speaker: text(event.speaker, 160),
    registration: "멤버 로그인 후 RSVP"
  };
}

function publicBenefit(benefit) {
  return {
    id: text(benefit.id, 120),
    title: text(benefit.title, 240),
    provider: text(benefit.provider, 160),
    category: text(benefit.category, 100),
    description: text(benefit.description, 1200),
    value: text(benefit.value, 400),
    tier: text(benefit.tier, 100),
    logoUrl: safeUrl(benefit.logoUrl),
    isActive: true,
    eligibility: list(benefit.eligibility).slice(0, 8),
    verificationStatus: "confirmed",
    activation: "멤버 로그인 후 자격 확인"
  };
}

function publicMissingInfo(submission) {
  const missing = [];
  if (!submission.traction?.customers && !submission.traction?.users && !submission.traction?.revenue) {
    missing.push("고객 또는 사용 근거 확인 필요");
  }
  if (!submission.technicalProfile?.deployment && !submission.technicalProfile?.apiDetails) {
    missing.push("배포·연동 방식 확인 필요");
  }
  if (!submission.updatedAt) missing.push("최근 업데이트일 확인 필요");
  return missing.slice(0, 4);
}

function sectorSummary(companies) {
  const counts = new Map();
  for (const company of companies || []) {
    for (const sector of String(company?.sector || company?.category || "")
      .split(/[,/]+/)
      .map((item) => item.trim())
      .filter(Boolean)) {
      counts.set(sector, (counts.get(sector) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "ko"));
}

function uniqueCompanies(companies) {
  const seen = new Set();
  return companies.filter((company) => {
    const key = `${company.id}:${company.name}`.toLowerCase();
    if (!company.id || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function list(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => text(item, 160)).filter(Boolean);
  return String(value)
    .split(/[;,\n]/)
    .map((item) => text(item, 160))
    .filter(Boolean);
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function text(value, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}
