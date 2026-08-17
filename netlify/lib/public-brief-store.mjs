import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const STORE_NAME = "sparklabs-ai-arena-public-briefs";
const BRIEFS_KEY = "briefs";
const MAX_BRIEFS = 500;
const MAX_INPUT_BYTES = 24 * 1024;
const MAX_WRITE_ATTEMPTS = 5;
const RETENTION_REVIEW_DAYS = 90;
const CONSENT_VERSION = "public-brief-intake-v1";
const BUDGET_RANGES = new Set(["", "under_10m", "10m_30m", "30m_100m", "over_100m"]);
const PARTNER_PROFILE_UPDATE_REQUEST = "partner_profile_update";
const memoryBriefs = [];

export async function savePublicBrief(input, now = new Date().toISOString(), options = {}) {
  if (now && typeof now === "object") {
    options = now;
    now = options.now || new Date().toISOString();
  }
  const brief = normalizePublicBrief(input, now);
  const allowMemoryFallback = options.allowMemoryFallback ?? !isProductionNetlify();
  let store;
  try {
    store = options.store || getStore({ name: STORE_NAME, consistency: "strong" });
  } catch (error) {
    if (allowMemoryFallback) return memoryReceipt(brief);
    throw storageError(error);
  }

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    try {
      const current = await loadBriefsWithMetadata(store);
      const briefs = [brief, ...current.briefs.filter((item) => item?.id !== brief.id)].slice(0, MAX_BRIEFS);
      await store.set(BRIEFS_KEY, JSON.stringify(briefs), {
        ...(current.conditional ? (current.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true }) : {}),
        metadata: { updatedAt: brief.updatedAt, briefCount: briefs.length }
      });
      return receipt(brief);
    } catch (error) {
      if (isWriteConflict(error) && attempt < MAX_WRITE_ATTEMPTS - 1) continue;
      if (allowMemoryFallback) return memoryReceipt(brief);
      throw storageError(error);
    }
  }

  if (allowMemoryFallback) return memoryReceipt(brief);
  throw storageError();
}

export async function loadPublicBriefMonitor(options = {}) {
  const allowMemoryFallback = options.allowMemoryFallback ?? !isProductionNetlify();
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
  let store;
  try {
    store = options.store || getStore({ name: STORE_NAME, consistency: "strong" });
    const current = await loadBriefsWithMetadata(store);
    return publicBriefMonitor(current.briefs, limit);
  } catch (error) {
    if (allowMemoryFallback) return publicBriefMonitor(memoryBriefs, limit);
    throw monitoringError(error);
  }
}

export function normalizePublicBrief(input = {}, now = new Date().toISOString()) {
  assertPlainInput(input);
  assertInputSize(input);
  const timestamp = normalizeTimestamp(now);
  if (honeypotFilled(input.websiteTrap) || honeypotFilled(input.companyUrl)) {
    throw statusError("Unable to accept this request.", 400);
  }
  if (input.consent !== true) throw statusError("개인정보 처리와 대상 스타트업 동의 기반 소개 절차에 동의해 주세요.", 400);

  const organization = requiredString(input.organization, "organization", 160);
  const contactName = requiredString(input.contactName, "contactName", 120);
  const email = requiredString(input.email, "email", 180).toLowerCase();
  if (!isValidEmail(email)) throw statusError("유효한 이메일을 입력해 주세요.", 400);
  const problem = requiredString(input.problem, "problem", 2000);
  const successMetric = requiredString(input.successMetric, "successMetric", 800);
  const budgetRange = optionalString(input.budgetRange, "budgetRange", 120);
  if (!BUDGET_RANGES.has(budgetRange)) throw statusError("예산 범위를 확인해 주세요.", 400);
  const isPartnerProfileUpdate = input.requestType === PARTNER_PROFILE_UPDATE_REQUEST;
  const partnerProfileId = isPartnerProfileUpdate ? requiredString(input.partnerProfileId, "partnerProfileId", 160) : "";
  const ownerUserId = isPartnerProfileUpdate ? requiredString(input.ownerUserId, "ownerUserId", 160) : "";
  const id = `public_brief_${crypto.createHash("sha256").update(`${email}:${timestamp}`).digest("hex").slice(0, 18)}`;

  return {
    id,
    organization,
    contactName,
    email,
    contactVerificationStatus: isPartnerProfileUpdate ? "authenticated_partner" : "self_declared_unverified",
    website: safeUrl(input.website),
    problem,
    successMetric,
    constraints: optionalString(input.constraints, "constraints", 1200),
    deadline: validDate(input.deadline),
    budgetRange,
    procurementPath: optionalString(input.procurementPath, "procurementPath", 800),
    status: isPartnerProfileUpdate ? "update_requested" : "received",
    requestType: isPartnerProfileUpdate ? PARTNER_PROFILE_UPDATE_REQUEST : "public_discovery_brief",
    partnerProfileId,
    ownerUserId,
    introductionPolicy: "double_opt_in",
    source: isPartnerProfileUpdate ? "partner_profile_update_request" : "public_discovery_brief",
    consentVersion: CONSENT_VERSION,
    consentAt: timestamp,
    retentionPolicy: "review_after_90_days",
    retentionReviewAt: new Date(Date.parse(timestamp) + RETENTION_REVIEW_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

async function loadBriefsWithMetadata(store) {
  if (typeof store.getWithMetadata === "function") {
    const current = await store.getWithMetadata(BRIEFS_KEY, { type: "json" });
    return {
      briefs: parseBriefs(current?.data),
      etag: current?.etag || null,
      conditional: true
    };
  }
  return { briefs: parseBriefs(await store.get(BRIEFS_KEY, { type: "json" })), etag: null, conditional: false };
}

function parseBriefs(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function memoryReceipt(brief) {
  const briefs = [brief, ...memoryBriefs.filter((item) => item?.id !== brief.id)].slice(0, MAX_BRIEFS);
  memoryBriefs.length = 0;
  memoryBriefs.push(...briefs);
  return receipt(brief);
}

function receipt(brief) {
  return { id: brief.id, status: brief.status, createdAt: brief.createdAt };
}

function publicBriefMonitor(briefs, limit) {
  const allItems = (Array.isArray(briefs) ? briefs : [])
    .filter((brief) => brief?.requestType === "public_discovery_brief" || brief?.source === "public_discovery_brief")
    .map(publicBriefMonitorItem)
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0));
  return {
    available: true,
    totalCount: allItems.length,
    latestAt: allItems[0]?.createdAt || null,
    items: allItems.slice(0, limit)
  };
}

function publicBriefMonitorItem(brief) {
  const id = storedText(brief?.id, 120);
  const organization = storedText(brief?.organization, 160);
  const createdAt = storedTimestamp(brief?.createdAt);
  if (!id || !organization || !createdAt) return null;
  return {
    id,
    organization,
    problemSummary: storedText(brief?.problem, 240),
    status: storedText(brief?.status, 40) || "received",
    createdAt,
    updatedAt: storedTimestamp(brief?.updatedAt) || createdAt,
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(String(brief?.deadline || "")) ? String(brief.deadline) : ""
  };
}

function storedText(value, max) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function storedTimestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function assertPlainInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw statusError("Brief는 JSON 객체여야 합니다.", 400);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw statusError("Brief는 일반 JSON 객체여야 합니다.", 400);
  }
}

function assertInputSize(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw statusError("Brief를 처리할 수 없습니다.", 400);
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_INPUT_BYTES) {
    throw statusError("Brief가 허용된 크기를 초과했습니다.", 413);
  }
}

function requiredString(value, field, max) {
  const result = optionalString(value, field, max);
  if (!result) throw statusError(`${field} is required.`, 400);
  return result;
}

function optionalString(value, field, max) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw statusError(`${field} must be a string.`, 400);
  if (hasUnsafeControlCharacters(value)) throw statusError(`${field} contains unsupported control characters.`, 400);
  const result = value.trim();
  if (result.length > max) throw statusError(`${field} exceeds the ${max}-character limit.`, 400);
  return result;
}

function safeUrl(value) {
  const raw = optionalString(value, "website", 500);
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw statusError("웹사이트 주소는 올바른 http 또는 https URL이어야 합니다.", 400);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw statusError("웹사이트 주소는 http 또는 https URL이어야 합니다.", 400);
  }
  if (url.username || url.password) throw statusError("웹사이트 주소에는 로그인 정보를 포함할 수 없습니다.", 400);
  url.hash = "";
  return url.toString();
}

function validDate(value) {
  const raw = optionalString(value, "deadline", 10);
  if (!raw) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw statusError("의사결정 시점은 YYYY-MM-DD 형식이어야 합니다.", 400);
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw statusError("유효한 의사결정 날짜를 입력해 주세요.", 400);
  }
  return raw;
}

function normalizeTimestamp(value) {
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) throw statusError("Brief 생성 시간을 확인할 수 없습니다.", 500);
  return new Date(parsed).toISOString();
}

function isValidEmail(value) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return false;
  const [local, domain] = value.split("@");
  return Boolean(local && local.length <= 64 && domain && domain.length <= 253 && !local.startsWith(".") && !local.endsWith(".") && !local.includes(".."));
}

function honeypotFilled(value) {
  if (value === undefined || value === null || value === "") return false;
  return String(value).trim().length > 0;
}

function hasUnsafeControlCharacters(value) {
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

function isWriteConflict(error) {
  return [409, 412].includes(Number(error?.status || error?.statusCode));
}

function isProductionNetlify() {
  const deployed = ["1", "true", "yes"].includes(String(process.env.NETLIFY || "").trim().toLowerCase());
  const local = ["1", "true", "yes"].includes(String(process.env.NETLIFY_DEV || "").trim().toLowerCase());
  return deployed && !local;
}

function storageError(cause) {
  const error = new Error("Brief를 안전하게 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  error.status = 503;
  if (cause) error.cause = cause;
  return error;
}

function monitoringError(cause) {
  const error = new Error("탐색 Brief 모니터링 정보를 불러오지 못했습니다.");
  error.status = 503;
  if (cause) error.cause = cause;
  return error;
}

function statusError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
