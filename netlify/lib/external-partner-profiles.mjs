import { getStore } from "@netlify/blobs";

import { YOUNGONE_EXTERNAL_PARTNER_PROFILE } from "../data/external-partner-profiles/youngone-profile.mjs";

const STORE_NAME = "sparklabs-ai-arena-external-partners";
const PROFILES_KEY = "profiles";
const MAX_WRITE_ATTEMPTS = 5;
const DEFAULT_SEEDS = Object.freeze([YOUNGONE_EXTERNAL_PARTNER_PROFILE]);
const PROFILE_STATUSES = new Set(["draft", "active", "paused", "archived"]);
const PROFILE_VISIBILITIES = new Set(["owner_staff", "staff_private"]);
const PARTNER_TYPES = new Set(["corporate", "corporate_cvc", "lp", "strategic_investor", "external_partner"]);

export function externalPartnerProfilesStore() {
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

export async function loadExternalPartnerProfiles(options = {}) {
  const seeds = normalizeSeedProfiles(options.seeds === undefined ? DEFAULT_SEEDS : options.seeds);
  try {
    const store = options.store || externalPartnerProfilesStore();
    const stored = await readProfiles(store);
    return mergeSeedProfiles(seeds, stored);
  } catch {
    return seeds;
  }
}

export async function saveExternalPartnerProfile(profile, options = {}) {
  const store = options.store || externalPartnerProfilesStore();
  const seeds = normalizeSeedProfiles(options.seeds === undefined ? DEFAULT_SEEDS : options.seeds);
  const now = validTimestamp(options.now) || new Date().toISOString();

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    try {
      const current = await readProfilesWithMetadata(store);
      const profiles = mergeSeedProfiles(seeds, current.profiles);
      const existing = findExistingProfile(profile, profiles);
      const normalized = normalizeExternalPartnerProfile(profile, existing, now);
      assertUniqueOwnership(normalized, profiles);
      const next = [normalized, ...profiles.filter((item) => item.id !== normalized.id)]
        .sort(profileSort);
      await store.set(PROFILES_KEY, JSON.stringify(next), {
        ...(current.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true }),
        metadata: { updatedAt: now, profileCount: next.length }
      });
      return normalized;
    } catch (error) {
      if (isWriteConflict(error) && attempt < MAX_WRITE_ATTEMPTS - 1) continue;
      throw error;
    }
  }

  throw profileError("외부 파트너 프로필을 저장하지 못했습니다.", 503);
}

export function externalPartnerProfileForViewer(viewer, profiles = []) {
  if (!viewer) return null;
  const profileId = cleanId(viewer.b2bProfileId || viewer.externalPartnerProfileId);
  const userId = text(viewer.id, 160);
  const email = normalizeEmail(viewer.email);
  const candidates = Array.isArray(profiles) ? profiles : [];

  if (profileId) {
    const byProfile = candidates.find((profile) => cleanId(profile?.id) === profileId);
    if (byProfile) return byProfile;
  }
  if (userId) {
    const byUser = candidates.find((profile) => text(profile?.ownerUserId, 160) === userId);
    if (byUser) return byUser;
  }
  if (email) {
    return candidates.find((profile) => ownerEmails(profile).includes(email)) || null;
  }
  return null;
}

export function safeExternalPartnerProfile(profile, options = {}) {
  if (!profile || typeof profile !== "object") return null;
  const audience = options.audience === "staff" ? "staff" : "owner";
  const safe = {
    id: cleanId(profile.id),
    organizationName: text(profile.organizationName || profile.organization || profile.name, 200),
    organizationNameEn: text(profile.organizationNameEn, 200),
    logoUrl: safeLogoUrl(profile.logoUrl || profile.logo),
    parentOrganizationName: text(profile.parentOrganizationName, 200),
    profileLabel: text(profile.profileLabel, 240),
    aliases: stringList(profile.aliases, 12, 120),
    classifications: stringList(profile.classifications, 20, 120),
    partnerType: normalizePartnerType(profile.partnerType || profile.entityType),
    entityType: normalizeEntityType(profile.entityType, profile.partnerType),
    status: normalizeStatus(profile.status),
    visibility: normalizeVisibility(profile.visibility),
    websiteUrl: safeUrl(profile.websiteUrl || profile.website),
    headquarters: text(profile.headquarters, 200),
    businessUnits: stringList(profile.businessUnits, 20, 160),
    focusCategories: stringList(profile.focusCategories, 24, 160),
    targetStages: stringList(profile.targetStages, 12, 100),
    preferredRegions: stringList(profile.preferredRegions, 16, 100),
    thesis: text(profile.thesis || profile.partnershipThesis || profile.b2bThesis, 2400),
    defaultDiscoveryPrompt: text(profile.defaultDiscoveryPrompt, 1200),
    priorityProblems: stringList(profile.priorityProblems, 24, 500),
    desiredCapabilities: stringList(profile.desiredCapabilities, 32, 200),
    mustHaveRequirements: stringList(profile.mustHaveRequirements, 24, 300),
    excludedCategories: stringList(profile.excludedCategories, 16, 160),
    deploymentConstraints: stringList(profile.deploymentConstraints, 20, 300),
    securityRequirements: stringList(profile.securityRequirements, 20, 300),
    integrationRequirements: stringList(profile.integrationRequirements, 20, 300),
    strategicAssets: stringList(profile.strategicAssets, 20, 300),
    pilotBudget: text(profile.pilotBudget, 200),
    investmentCheckRange: text(profile.investmentCheckRange, 200),
    decisionTimeline: text(profile.decisionTimeline, 300),
    needs: normalizeNeeds(profile.needs || profile.partnershipNeeds || profile.currentNeeds),
    priorities: normalizePriorities(profile.priorities),
    discoveryPrompts: normalizeDiscoveryPrompts(profile.discoveryPrompts),
    evidence: normalizeEvidence(profile.evidence || profile.evidenceSources),
    unknowns: normalizeUnknowns(profile.unknowns),
    evidenceNote: text(profile.evidenceNote, 2000),
    sourcePolicy: text(profile.sourcePolicy, 100),
    researchAsOf: dateText(profile.researchAsOf),
    consentStatus: text(profile.consentStatus, 60) || "internal_research",
    lastVerifiedAt: validTimestamp(profile.lastVerifiedAt),
    nextReviewAt: validTimestamp(profile.nextReviewAt),
    nextReviewDate: dateText(profile.nextReviewDate || profile.nextReviewAt),
    createdAt: validTimestamp(profile.createdAt),
    updatedAt: validTimestamp(profile.updatedAt)
  };

  if (audience === "staff") {
    safe.ownerUserId = text(profile.ownerUserId, 160) || null;
    safe.ownerEmail = normalizeEmail(profile.ownerEmail) || null;
    safe.ownerEmails = ownerEmails(profile);
    safe.contacts = normalizeContacts(profile.contacts);
    safe.legalEntities = normalizeLegalEntities(profile.legalEntities);
    safe.relationshipOwner = text(profile.relationshipOwner, 160);
    safe.internalNotes = text(profile.internalNotes, 5000);
    safe.source = text(profile.source, 100);
  }

  return safe;
}

export function normalizeExternalPartnerProfile(input = {}, existing = null, now = new Date().toISOString()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw profileError("외부 파트너 프로필은 JSON 객체여야 합니다.");
  }
  const source = { ...(existing || {}), ...input };
  const organizationName = text(source.organizationName || source.organization || source.name, 200);
  if (!organizationName) throw profileError("조직명이 필요합니다.");
  const id = cleanId(source.id) || slugId(organizationName);
  if (!id) throw profileError("유효한 프로필 ID가 필요합니다.");
  const createdAt = validTimestamp(existing?.createdAt || source.createdAt) || validTimestamp(now) || new Date().toISOString();
  const updatedAt = validTimestamp(now) || new Date().toISOString();
  const emails = uniqueStrings([
    normalizeEmail(source.ownerEmail || source.email || source.accountEmail),
    ...stringList(source.ownerEmails || source.accountEmails, 12, 240).map(normalizeEmail)
  ]).filter(Boolean);

  return {
    id,
    ownerUserId: text(source.ownerUserId || source.userId, 160),
    ownerEmail: emails[0] || "",
    ownerEmails: emails,
    organizationName,
    organizationNameEn: text(source.organizationNameEn, 200),
    logoUrl: safeLogoUrl(source.logoUrl || source.logo),
    parentOrganizationName: text(source.parentOrganizationName, 200),
    profileLabel: text(source.profileLabel, 240),
    aliases: stringList(source.aliases, 12, 120),
    classifications: stringList(source.classifications, 20, 120),
    legalEntities: normalizeLegalEntities(source.legalEntities),
    partnerType: normalizePartnerType(source.partnerType || source.entityType),
    entityType: normalizeEntityType(source.entityType, source.partnerType),
    status: normalizeStatus(source.status),
    visibility: normalizeVisibility(source.visibility),
    websiteUrl: safeUrl(source.websiteUrl || source.website),
    headquarters: text(source.headquarters, 200),
    businessUnits: stringList(source.businessUnits, 20, 160),
    focusCategories: stringList(source.focusCategories || source.b2bFocusCategories, 24, 160),
    targetStages: stringList(source.targetStages || source.b2bTargetStages, 12, 100),
    preferredRegions: stringList(source.preferredRegions || source.b2bPreferredRegions, 16, 100),
    thesis: text(source.thesis || source.partnershipThesis || source.b2bThesis, 2400),
    defaultDiscoveryPrompt: text(source.defaultDiscoveryPrompt, 1200),
    priorityProblems: stringList(source.priorityProblems || source.problems, 24, 500),
    desiredCapabilities: stringList(source.desiredCapabilities || source.capabilities, 32, 200),
    mustHaveRequirements: stringList(source.mustHaveRequirements || source.mustHaves, 24, 300),
    excludedCategories: stringList(source.excludedCategories || source.exclusions, 16, 160),
    deploymentConstraints: stringList(source.deploymentConstraints, 20, 300),
    securityRequirements: stringList(source.securityRequirements, 20, 300),
    integrationRequirements: stringList(source.integrationRequirements, 20, 300),
    strategicAssets: stringList(source.strategicAssets, 20, 300),
    pilotBudget: text(source.pilotBudget, 200),
    investmentCheckRange: text(source.investmentCheckRange, 200),
    decisionTimeline: text(source.decisionTimeline, 300),
    needs: normalizeNeeds(source.needs || source.partnershipNeeds || source.currentNeeds),
    priorities: normalizePriorities(source.priorities),
    discoveryPrompts: normalizeDiscoveryPrompts(source.discoveryPrompts),
    evidence: normalizeEvidence(source.evidence || source.evidenceSources),
    unknowns: normalizeUnknowns(source.unknowns),
    evidenceNote: text(source.evidenceNote, 2000),
    sourcePolicy: text(source.sourcePolicy, 100),
    contacts: normalizeContacts(source.contacts),
    relationshipOwner: text(source.relationshipOwner, 160),
    internalNotes: text(source.internalNotes, 5000),
    source: text(source.source, 100) || "external_partner_directory",
    researchAsOf: dateText(source.researchAsOf),
    consentStatus: text(source.consentStatus, 60) || "internal_research",
    lastVerifiedAt: validTimestamp(source.lastVerifiedAt),
    nextReviewAt: validTimestamp(source.nextReviewAt || source.nextReviewDate),
    nextReviewDate: dateText(source.nextReviewDate || source.nextReviewAt),
    createdAt,
    updatedAt
  };
}

function normalizeSeedProfiles(value) {
  const profiles = Array.isArray(value) ? value : value ? [value] : [];
  return profiles
    .filter(Boolean)
    .map((profile) => normalizeExternalPartnerProfile(profile, null, profile.updatedAt || profile.researchAsOf || new Date().toISOString()))
    .sort(profileSort);
}

function mergeSeedProfiles(seeds, stored) {
  const byId = new Map((seeds || []).map((profile) => [profile.id, profile]));
  for (const raw of Array.isArray(stored) ? stored : []) {
    try {
      const seed = byId.get(cleanId(raw?.id)) || null;
      const normalized = normalizeExternalPartnerProfile(raw, seed, raw?.updatedAt || new Date().toISOString());
      byId.set(normalized.id, normalized);
    } catch {
      // A malformed persisted row must not make every valid profile unavailable.
    }
  }
  return [...byId.values()].sort(profileSort);
}

function findExistingProfile(input, profiles) {
  const id = cleanId(input?.id);
  if (id) {
    const byId = profiles.find((profile) => profile.id === id);
    if (byId) return byId;
  }
  const emails = ownerEmails(input);
  return profiles.find((profile) => ownerEmails(profile).some((email) => emails.includes(email))) || null;
}

function assertUniqueOwnership(profile, profiles) {
  const emails = ownerEmails(profile);
  if (!emails.length) return;
  const conflict = profiles.find(
    (candidate) => candidate.id !== profile.id && ownerEmails(candidate).some((email) => emails.includes(email))
  );
  if (conflict) throw profileError("이 로그인 이메일은 다른 외부 파트너 프로필에 연결되어 있습니다.", 409);
}

async function readProfiles(store) {
  const value = await store.get(PROFILES_KEY, { type: "json" });
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return parseProfiles(value);
  return [];
}

async function readProfilesWithMetadata(store) {
  if (typeof store.getWithMetadata === "function") {
    const current = await store.getWithMetadata(PROFILES_KEY, { type: "json" });
    const data = current?.data;
    return {
      profiles: Array.isArray(data) ? data : typeof data === "string" ? parseProfiles(data) : [],
      etag: current?.etag || null
    };
  }
  return { profiles: await readProfiles(store), etag: null };
}

function parseProfiles(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeNeeds(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .slice(0, 24)
    .map((item, index) => ({
      id: cleanId(item.id) || `need-${index + 1}`,
      title: text(item.title || item.name, 200),
      problem: text(item.problem || item.description, 1200),
      businessUnit: text(item.businessUnit, 160),
      priority: normalizePriority(item.priority),
      status: text(item.status, 60) || "research",
      desiredCapabilities: stringList(item.desiredCapabilities || item.capabilities, 20, 200),
      successMetrics: stringList(item.successMetrics || item.kpis, 16, 300),
      constraints: stringList(item.constraints, 16, 300),
      targetTimeline: text(item.targetTimeline || item.timeline, 200),
      evidenceUrls: urlList(item.evidenceUrls || item.sources, 12)
    }))
    .filter((item) => item.title || item.problem);
}

function normalizePriorities(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .slice(0, 24)
    .map((item, index) => ({
      rank: boundedNumber(item.rank, 1, 100, index + 1),
      id: cleanId(item.id) || `priority-${index + 1}`,
      title: text(item.title || item.name, 200),
      score: boundedNumber(item.score, 0, 100, null),
      confidence: text(item.confidence, 60),
      hypothesis: text(item.hypothesis || item.description, 1600),
      startupCapabilities: stringList(item.startupCapabilities || item.desiredCapabilities, 24, 240),
      validationQuestions: stringList(item.validationQuestions, 20, 500),
      evidenceIds: stringList(item.evidenceIds, 24, 120)
    }))
    .filter((item) => item.title || item.hypothesis)
    .sort((left, right) => left.rank - right.rank);
}

function normalizeDiscoveryPrompts(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .slice(0, 12)
    .map((item) => ({
      label: text(item.label || item.title, 100),
      prompt: text(item.prompt, 1200)
    }))
    .filter((item) => item.label && item.prompt);
}

function normalizeLegalEntities(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .slice(0, 16)
    .map((item) => ({
      name: text(item.name, 200),
      nameEn: text(item.nameEn, 200),
      role: text(item.role, 500)
    }))
    .filter((item) => item.name || item.nameEn);
}

function normalizeUnknowns(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .slice(0, 24)
    .map((item) => ({
      field: text(item.field, 120),
      status: text(item.status, 60) || "unknown",
      question: text(item.question, 800),
      reason: text(item.reason, 800)
    }))
    .filter((item) => item.field || item.question);
}

function normalizeEvidence(value) {
  return (Array.isArray(value) ? value : [])
    .slice(0, 40)
    .map((item) => {
      if (typeof item === "string") return { title: text(item, 240), url: "", claim: "", publishedAt: "", accessedAt: "" };
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      return {
        id: cleanId(item.id),
        sourceType: text(item.sourceType, 100),
        title: text(item.title || item.label || item.source, 240),
        publisher: text(item.publisher, 200),
        url: safeUrl(item.url || item.href),
        claim: text(item.claim || item.note || item.description, 800),
        claims: stringList(item.claims, 20, 500),
        publishedAt: dateText(item.publishedAt || item.date),
        accessedAt: dateText(item.accessedAt)
      };
    })
    .filter((item) => item && (item.title || item.url));
}

function normalizeContacts(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .slice(0, 12)
    .map((item) => ({
      name: text(item.name, 160),
      title: text(item.title || item.role, 160),
      email: normalizeEmail(item.email),
      phone: text(item.phone, 80),
      note: text(item.note, 500)
    }))
    .filter((item) => item.name || item.email);
}

function normalizePartnerType(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases = {
    company: "corporate",
    corporate_partner: "corporate",
    cvc: "corporate_cvc",
    investor: "lp",
    fund: "lp",
    venture_capital: "lp",
    strategic: "strategic_investor"
  };
  const result = aliases[normalized] || normalized;
  return PARTNER_TYPES.has(result) ? result : "external_partner";
}

function normalizeEntityType(value, partnerType) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["corporate", "company", "corporate_cvc", "cvc"].includes(normalized)) return "corporate";
  if (["investor", "lp", "fund", "strategic_investor"].includes(normalized)) return "investor";
  const type = normalizePartnerType(partnerType);
  return ["lp", "strategic_investor"].includes(type) ? "investor" : ["corporate", "corporate_cvc"].includes(type) ? "corporate" : "partner";
}

function normalizeStatus(value) {
  const status = String(value || "active").trim().toLowerCase();
  return PROFILE_STATUSES.has(status) ? status : "draft";
}

function normalizeVisibility(value) {
  const normalized = String(value || "owner_staff").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const visibility = ["private", "restricted_partner_profile"].includes(normalized) ? "owner_staff" : normalized;
  return PROFILE_VISIBILITIES.has(visibility) ? visibility : "owner_staff";
}

function normalizePriority(value) {
  const priority = String(value || "medium").trim().toLowerCase();
  return ["critical", "high", "medium", "low"].includes(priority) ? priority : "medium";
}

function ownerEmails(profile) {
  return uniqueStrings([
    normalizeEmail(profile?.ownerEmail || profile?.email || profile?.accountEmail),
    ...stringList(profile?.ownerEmails || profile?.accountEmails, 12, 240).map(normalizeEmail)
  ]).filter(Boolean);
}

function stringList(value, maxItems, maxLength) {
  const items = Array.isArray(value)
    ? value
    : String(value || "").split(/[;,\n]+/);
  return uniqueStrings(items.map((item) => text(item, maxLength)).filter(Boolean)).slice(0, maxItems);
}

function urlList(value, maxItems) {
  return (Array.isArray(value) ? value : [value]).map((item) => safeUrl(typeof item === "object" ? item?.url : item)).filter(Boolean).slice(0, maxItems);
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function boundedNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function safeUrl(value) {
  const raw = text(value, 800);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function safeLogoUrl(value) {
  const raw = text(value, 800);
  if (/^\/arena\/assets\/partner-logos\/[a-z0-9][a-z0-9._-]*\.png$/i.test(raw)) return raw;
  return safeUrl(raw);
}

function normalizeEmail(value) {
  const email = text(value, 240).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function validTimestamp(value) {
  const raw = text(value, 80);
  if (!raw || !Number.isFinite(Date.parse(raw))) return "";
  return new Date(raw).toISOString();
}

function dateText(value) {
  const raw = text(value, 40);
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function cleanId(value) {
  const id = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{1,79}$/.test(id) ? id : "";
}

function slugId(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function text(value, max) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function profileSort(left, right) {
  const statusOrder = { active: 0, draft: 1, paused: 2, archived: 3 };
  return (statusOrder[left.status] ?? 9) - (statusOrder[right.status] ?? 9) ||
    String(left.organizationName || "").localeCompare(String(right.organizationName || ""), "ko");
}

function isWriteConflict(error) {
  return [409, 412].includes(Number(error?.status || error?.statusCode));
}

function profileError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}
