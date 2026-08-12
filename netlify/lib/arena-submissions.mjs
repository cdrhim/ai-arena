import crypto from "node:crypto";

const STAFF_ACTIONS = new Set([
  "requestSubmissionChanges",
  "approveSubmission",
  "publishSubmission",
  "archiveSubmission",
  "markStaffVerified"
]);

const PARTNER_ACTIONS = new Set(["saveSubmissionDraft", "submitSubmissionForReview"]);
const HUMAN_VALIDATION_STAFF_ACTIONS = new Set([
  "nominateHumanValidation",
  "assignHumanValidator",
  "issueHumanValidationBadge",
  "requestMoreEvidence",
  "revokeHumanValidationBadge"
]);
const HUMAN_VALIDATION_MEMBER_ACTIONS = new Set(["acceptHumanValidationInvitation"]);
const HUMAN_VALIDATION_REVIEWER_ACTIONS = new Set(["declareHumanValidationConflict", "submitHumanValidationReview"]);
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 1_500_000;
const MAX_IMAGE_DIMENSION = 4096;
const SHORTENED_HOSTS = new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "buff.ly"]);
const TRACKING_PARAMS = new Set(["fbclid", "gclid", "mc_cid", "mc_eid"]);
const HUMAN_VALIDATION_FINAL_STATUSES = new Set(["human_validated", "not_validated", "cancelled"]);

export const MACHINE_VALIDATION_STATUSES = new Set(["not_started", "queued", "running", "passed", "failed", "needs_review"]);
export const HUMAN_VALIDATION_STATUSES = new Set([
  "not_eligible",
  "eligible",
  "invited",
  "requested",
  "assigned",
  "in_review",
  "completed",
  "needs_more_evidence",
  "human_validated",
  "not_validated",
  "cancelled"
]);
export const SPARKLABS_VERIFICATION_STATUSES = new Set([
  "none",
  "machine_validated",
  "human_validated",
  "sparklabs_verified",
  "rejected",
  "archived"
]);
export const HUMAN_VALIDATION_RUBRIC = [
  { key: "product_clarity", label: "Product clarity", weight: 10 },
  { key: "problem_relevance", label: "Problem relevance", weight: 15 },
  { key: "demo_functionality", label: "Demo/functionality", weight: 20 },
  { key: "b2b_customer_fit", label: "B2B/customer fit", weight: 15 },
  { key: "technical_credibility", label: "Technical credibility", weight: 15 },
  { key: "evidence_traction", label: "Evidence/traction", weight: 10 },
  { key: "enterprise_readiness", label: "Enterprise readiness", weight: 10 },
  { key: "differentiation", label: "Differentiation", weight: 5 }
];
export const HUMAN_VALIDATION_TYPES = [
  "Product readiness review",
  "B2B partner fit review",
  "Technical validation",
  "Investor readiness review",
  "Enterprise pilot readiness",
  "Safety/privacy review"
];

export const SUBMISSION_STATUSES = new Set([
  "draft",
  "submitted",
  "needs_changes",
  "approved",
  "published",
  "archived"
]);

export const SUBMISSION_TYPES = [
  "Product",
  "Tech Passport",
  "AI Agent",
  "Model",
  "Dataset",
  "App",
  "Infra Tool",
  "Workflow",
  "Research",
  "Service"
];

export function createSubmissionEvent(action, payload, viewer, snapshot, now = new Date().toISOString()) {
  if (STAFF_ACTIONS.has(action) && !viewer?.canScore) {
    const error = new Error("Only SparkLabs staff can review, publish, archive, or verify submissions.");
    error.status = 403;
    throw error;
  }
  if (PARTNER_ACTIONS.has(action) && !viewer?.canSubmitProducts) {
    const error = new Error("Only approved members can submit and manage products.");
    error.status = viewer?.email ? 403 : 401;
    throw error;
  }
  if (HUMAN_VALIDATION_STAFF_ACTIONS.has(action) && !viewer?.canScore) {
    const error = new Error("Only SparkLabs staff can manage human validation.");
    error.status = viewer?.email ? 403 : 401;
    throw error;
  }

  const submissions = snapshot?.submissions || [];

  if (action === "nominateHumanValidation") {
    const submission = nominateHumanValidation(submissions, payload, viewer, now);
    return reviewEvent("human_nominate", "submission_human_validation_nominated", submission, viewer, now);
  }

  if (action === "acceptHumanValidationInvitation") {
    const submission = acceptHumanValidationInvitation(submissions, payload, viewer, now);
    return reviewEvent("human_accept", "submission_human_validation_accepted", submission, viewer, now);
  }

  if (action === "assignHumanValidator") {
    const submission = assignHumanValidator(submissions, payload, viewer, now);
    return reviewEvent("human_assign", "submission_human_validator_assigned", submission, viewer, now);
  }

  if (action === "declareHumanValidationConflict") {
    const submission = declareHumanValidationConflict(submissions, payload, viewer, now);
    return reviewEvent("human_conflict", "submission_human_validation_conflict_declared", submission, viewer, now);
  }

  if (action === "submitHumanValidationReview") {
    const submission = submitHumanValidationReview(submissions, payload, viewer, now);
    return reviewEvent("human_review", "submission_human_validation_review_submitted", submission, viewer, now);
  }

  if (action === "issueHumanValidationBadge") {
    const submission = issueHumanValidationBadge(submissions, payload, viewer, now);
    return reviewEvent("human_badge", "submission_human_validation_badge_issued", submission, viewer, now);
  }

  if (action === "requestMoreEvidence") {
    const submission = requestMoreEvidence(submissions, payload, viewer, now);
    return reviewEvent("human_evidence", "submission_human_validation_more_evidence_requested", submission, viewer, now);
  }

  if (action === "revokeHumanValidationBadge") {
    const submission = revokeHumanValidationBadge(submissions, payload, viewer, now);
    return reviewEvent("human_revoke", "submission_human_validation_badge_revoked", submission, viewer, now);
  }

  if (action === "saveSubmissionDraft") {
    const existing = findSubmission(submissions, payload?.submission?.id);
    assertCanEditSubmission(existing, viewer);
    const submission = normalizeSubmission(payload?.submission || {}, viewer, existing, now, {
      keepStatus: true,
      fallbackStatus: "draft"
    });
    assertUniqueSlug(submission, submissions);
    return {
      id: eventId("draft", `${submission.id}:${submission.version}`, now),
      type: "submission_saved",
      submission,
      actor: actorFromViewer(viewer),
      createdAt: now
    };
  }

  if (action === "submitSubmissionForReview") {
    const existing = findSubmission(submissions, payload?.id || payload?.submission?.id);
    assertCanEditSubmission(existing, viewer);
    const submission = normalizeSubmission(payload?.submission || existing || {}, viewer, existing, now, {
      keepStatus: false,
      fallbackStatus: "submitted"
    });
    submission.status = "submitted";
    submission.visibility = "private";
    submission.submittedAt = existing?.submittedAt || now;
    submission.review = {
      ...(submission.review || {}),
      lastNote: null,
      lastReviewedAt: null,
      staffVerified: Boolean(existing?.review?.staffVerified)
    };
    submission.readiness = calculateReadiness(submission);
    if (!submission.readiness.canSubmit) {
      const error = new Error(`Submission is not ready: ${submission.readiness.missingItems.join(", ")}`);
      error.status = 400;
      throw error;
    }
    assertUniqueSlug(submission, submissions);
    return {
      id: eventId("submit", submission.id, now),
      type: "submission_submitted",
      submission,
      actor: actorFromViewer(viewer),
      createdAt: now
    };
  }

  if (action === "requestSubmissionChanges") {
    const submission = staffStatusUpdate(submissions, payload, viewer, now, "needs_changes", {
      note: requiredString(payload, "note", 1200)
    });
    return reviewEvent("changes", "submission_changes_requested", submission, viewer, now);
  }

  if (action === "approveSubmission") {
    const submission = staffStatusUpdate(submissions, payload, viewer, now, "approved", {
      approvedAt: now,
      note: optionalString(payload, "note", 1200)
    });
    return reviewEvent("approve", "submission_approved", submission, viewer, now);
  }

  if (action === "publishSubmission") {
    const submission = staffStatusUpdate(submissions, payload, viewer, now, "published", {
      approvedAt: findSubmission(submissions, payload?.id)?.approvedAt || now,
      publishedAt: now,
      visibility: "public",
      note: optionalString(payload, "note", 1200)
    });
    return reviewEvent("publish", "submission_published", submission, viewer, now);
  }

  if (action === "archiveSubmission") {
    const submission = staffStatusUpdate(submissions, payload, viewer, now, "archived", {
      visibility: "private",
      note: optionalString(payload, "note", 1200)
    });
    return reviewEvent("archive", "submission_archived", submission, viewer, now);
  }

  if (action === "markStaffVerified") {
    const existing = requiredSubmission(submissions, payload?.id);
    const submission = {
      ...existing,
      review: {
        ...(existing.review || {}),
        staffVerified: true,
        lastReviewedAt: now,
        reviewerEmail: viewer.email,
        internalNote: optionalString(payload, "internalNote", 1200)
      },
      updatedAt: now,
      version: Number(existing.version || 1) + 1
    };
    return reviewEvent("verify", "submission_staff_verified", submission, viewer, now);
  }

  return null;
}

export function applySubmissionEvent(state, event) {
  if (!event?.type?.startsWith("submission_") || !event.submission) return state;
  if (!Array.isArray(state.submissions)) state.submissions = [];
  const existingIndex = state.submissions.findIndex((submission) => submission.id === event.submission.id);
  if (existingIndex < 0) {
    state.submissions.unshift(clone(event.submission));
    return state;
  }

  const existing = state.submissions[existingIndex];
  if (Date.parse(event.submission.updatedAt || event.createdAt || 0) < Date.parse(existing.updatedAt || 0)) {
    return state;
  }
  state.submissions[existingIndex] = clone(event.submission);
  return state;
}

export function publishedSubmissionsToStartups(submissions = []) {
  return submissions
    .filter((submission) => submission.status === "published" && submission.visibility === "public")
    .map(submissionToStartup);
}

export function filterSubmissionsForViewer(submissions = [], viewer) {
  const staff = Boolean(viewer?.canScore);
  return submissions
    .filter((submission) => {
      if (staff) return true;
      if (isAssignedHumanReviewer(submission, viewer)) return true;
      if (submission.visibility === "public" && submission.status === "published") return true;
      return isSubmissionOwner(submission, viewer);
    })
    .map((submission) => sanitizeSubmissionForViewer(submission, viewer));
}

export function reviewQueueForViewer(submissions = [], viewer) {
  if (!viewer?.canScore) return [];
  return submissions
    .filter((submission) => ["submitted", "needs_changes", "approved"].includes(submission.status))
    .sort((left, right) => Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0))
    .map((submission) => sanitizeSubmissionForViewer(submission, viewer));
}

export function humanValidationQueueForViewer(submissions = [], viewer) {
  if (!viewer?.email) return [];
  const visible = submissions
    .filter((submission) => {
      if (viewer?.canScore) return (submission.humanValidation?.requests || []).length;
      return isAssignedHumanReviewer(submission, viewer) || isSubmissionOwner(submission, viewer);
    })
    .map((submission) => sanitizeSubmissionForViewer(submission, viewer))
    .filter((submission) => submission.humanValidation && submission.humanValidation.humanStatus !== "not_eligible");
  return visible.sort((left, right) => Date.parse(right.humanValidation?.updatedAt || right.updatedAt || 0) - Date.parse(left.humanValidation?.updatedAt || left.updatedAt || 0));
}

export function calculateReadiness(submission) {
  const links = Array.isArray(submission?.links) ? submission.links : [];
  const galleryCount = Array.isArray(submission?.galleryAssetIds) ? submission.galleryAssetIds.length : 0;
  const technical = submission?.technicalProfile || {};
  const team = Array.isArray(submission?.teamMembers) ? submission.teamMembers : [];
  const passportChecks = [
    ["Basics complete", Boolean(submission?.name && submission?.tagline && submission?.shortDescription && submission?.category && submission?.stage)],
    ["Website or repository added", links.some((link) => ["website", "demo", "docs", "github", "huggingface"].includes(link.type))],
    ["Architecture summary added", Boolean(submission?.longDescriptionMarkdown)],
    ["Founder/team info added", team.some((member) => member.name && (member.role || member.email))],
    ["Technical metadata added", Boolean(joinValues([technical.productType, technical.modalities, technical.stack]).trim())],
    ["Deployment and API details added", Boolean(technical.deployment && technical.apiDetails)],
    ["Limitations/privacy info added", Boolean(technical.limitations && technical.privacy)],
    ["Evaluation evidence added", Boolean(technical.evaluationClaims)]
  ];
  const productChecks = [
    ["Basics complete", Boolean(submission?.name && submission?.tagline && submission?.shortDescription && submission?.category && submission?.stage)],
    ["URL or demo link added", links.some((link) => ["website", "demo", "deck", "docs", "github", "huggingface"].includes(link.type))],
    ["Thumbnail uploaded", Boolean(submission?.thumbnailAssetId)],
    ["2+ gallery images", galleryCount >= 2],
    ["Founder/team info added", team.some((member) => member.name && (member.role || member.email))],
    ["Technical metadata added", Boolean(joinValues([technical.productType, technical.modalities, technical.stack]).trim())],
    ["Limitations/privacy info added", Boolean(technical.limitations && technical.privacy)],
    ["Launch note added", Boolean(submission?.makerNote)]
  ];
  const checks = submission?.type === "Tech Passport" ? passportChecks : productChecks;
  const completedItems = checks.filter(([, done]) => done).map(([label]) => label);
  const missingItems = checks.filter(([, done]) => !done).map(([label]) => label);
  const score = Math.round((completedItems.length / checks.length) * 100);
  return {
    score,
    completedItems,
    missingItems,
    canSubmit: missingItems.length === 0
  };
}

export function validateUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: false, error: "URL is required." };
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "Enter a valid URL." };
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, error: "Only http and https URLs are allowed." };
  }
  const warnings = [];
  if (SHORTENED_HOSTS.has(parsed.hostname.replace(/^www\./, ""))) warnings.push("Shortened URL");
  for (const key of [...parsed.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMS.has(key.toLowerCase())) parsed.searchParams.delete(key);
  }
  return {
    ok: true,
    url: parsed.toString(),
    host: parsed.hostname.replace(/^www\./, ""),
    warnings
  };
}

export function validateAsset(asset) {
  const mimeType = String(asset?.mimeType || "").toLowerCase();
  const fileName = String(asset?.fileName || "upload").trim();
  const size = Number(asset?.size || 0);
  const dataUrl = String(asset?.dataUrl || "");
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    return { ok: false, error: "Only PNG, JPG, JPEG, WEBP, and GIF images are accepted." };
  }
  if (/\.(svg|html?|js|mjs|exe|bat|cmd|ps1)$/i.test(fileName)) {
    return { ok: false, error: "Executable or inline web formats are not accepted as uploads." };
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image uploads must be 1.5 MB or smaller." };
  }
  if (!dataUrl) {
    if (asset?.storageKey || /^https:\/\//i.test(String(asset?.previewUrl || ""))) return { ok: true };
    return { ok: false, error: "Image upload data is required for server validation." };
  }

  const inspection = inspectImageDataUrl(dataUrl, mimeType);
  if (!inspection.ok) return inspection;
  if (inspection.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image uploads must be 1.5 MB or smaller." };
  }
  if (inspection.width > MAX_IMAGE_DIMENSION || inspection.height > MAX_IMAGE_DIMENSION) {
    return { ok: false, error: "Image dimensions must be 4096px or smaller." };
  }
  return { ok: true, mimeType: inspection.mimeType, size: inspection.size, width: inspection.width, height: inspection.height };
}

export function sanitizeAsset(asset) {
  const validation = validateAsset(asset);
  if (!validation.ok) return validation;
  const dataUrl = String(asset?.dataUrl || "");
  if (!dataUrl) return { ok: true, asset: { ...asset } };

  const inspection = inspectImageDataUrl(dataUrl, asset.mimeType);
  if (!inspection.ok) return inspection;
  const strippedBytes = stripImageMetadata(inspection.bytes, inspection.mimeType);
  const nextDataUrl = `data:${inspection.mimeType};base64,${strippedBytes.toString("base64")}`;
  return {
    ok: true,
    asset: {
      ...asset,
      mimeType: inspection.mimeType,
      size: strippedBytes.length,
      dataUrl: nextDataUrl,
      previewUrl: asset.previewUrl === asset.dataUrl || !asset.previewUrl ? nextDataUrl : asset.previewUrl
    }
  };
}

function inspectImageDataUrl(dataUrl, declaredMimeType) {
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed.ok) return parsed;
  const declared = canonicalMimeType(declaredMimeType);
  if (canonicalMimeType(parsed.mimeType) !== declared) {
    return { ok: false, error: "Upload preview data does not match the declared image type." };
  }
  const detectedMimeType = detectImageMimeType(parsed.bytes);
  if (!detectedMimeType || detectedMimeType !== declared) {
    return { ok: false, error: "Uploaded file content does not match the declared image type." };
  }
  const dimensions = imageDimensions(parsed.bytes, detectedMimeType);
  if (!dimensions) {
    return { ok: false, error: "Unable to read uploaded image dimensions." };
  }
  if (dimensions.width <= 0 || dimensions.height <= 0) {
    return { ok: false, error: "Uploaded image dimensions are invalid." };
  }
  return {
    ok: true,
    mimeType: detectedMimeType,
    bytes: parsed.bytes,
    size: parsed.bytes.length,
    width: dimensions.width,
    height: dimensions.height
  };
}

function parseImageDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || ""));
  if (!match) return { ok: false, error: "Upload preview data must be a base64 image data URL." };
  let bytes;
  try {
    bytes = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  } catch {
    return { ok: false, error: "Upload preview data is not valid base64." };
  }
  if (!bytes.length) return { ok: false, error: "Uploaded image is empty." };
  return { ok: true, mimeType: match[1].toLowerCase(), bytes };
}

function canonicalMimeType(mimeType) {
  const normalized = String(mimeType || "").toLowerCase();
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

function detectImageMimeType(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) return "image/gif";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "";
}

function imageDimensions(bytes, mimeType) {
  if (mimeType === "image/png") {
    if (bytes.length < 24) return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mimeType === "image/gif") {
    if (bytes.length < 10) return null;
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  if (mimeType === "image/jpeg") return jpegDimensions(bytes);
  if (mimeType === "image/webp") return webpDimensions(bytes);
  return null;
}

function jpegDimensions(bytes) {
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (isJpegSofMarker(marker) && length >= 7) {
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5)
      };
    }
    offset += length;
  }
  return null;
}

function isJpegSofMarker(marker) {
  return [
    0xc0,
    0xc1,
    0xc2,
    0xc3,
    0xc5,
    0xc6,
    0xc7,
    0xc9,
    0xca,
    0xcb,
    0xcd,
    0xce,
    0xcf
  ].includes(marker);
}

function webpDimensions(bytes) {
  const chunkType = bytes.toString("ascii", 12, 16);
  if (chunkType === "VP8X" && bytes.length >= 30) {
    return {
      width: bytes.readUIntLE(24, 3) + 1,
      height: bytes.readUIntLE(27, 3) + 1
    };
  }
  if (chunkType === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
    };
  }
  if (chunkType === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff
    };
  }
  return null;
}

function stripImageMetadata(bytes, mimeType) {
  if (mimeType === "image/jpeg") return stripJpegMetadata(bytes);
  if (mimeType === "image/png") return stripPngMetadata(bytes);
  if (mimeType === "image/webp") return stripWebpMetadata(bytes);
  return bytes;
}

function stripJpegMetadata(bytes) {
  const chunks = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      chunks.push(bytes.subarray(offset));
      break;
    }
    const markerStart = offset;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9) {
      chunks.push(bytes.subarray(markerStart, offset));
      break;
    }
    if (marker === 0xda) {
      chunks.push(bytes.subarray(markerStart));
      break;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      chunks.push(bytes.subarray(markerStart, offset));
      continue;
    }
    if (offset + 2 > bytes.length) {
      chunks.push(bytes.subarray(markerStart));
      break;
    }
    const length = bytes.readUInt16BE(offset);
    const segmentEnd = offset + length;
    if (length < 2 || segmentEnd > bytes.length) {
      chunks.push(bytes.subarray(markerStart));
      break;
    }
    if (![0xe1, 0xed, 0xfe].includes(marker)) chunks.push(bytes.subarray(markerStart, segmentEnd));
    offset = segmentEnd;
  }
  return Buffer.concat(chunks);
}

function stripPngMetadata(bytes) {
  if (bytes.length < 12) return bytes;
  const chunks = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > bytes.length) return bytes;
    if (!["tEXt", "iTXt", "zTXt", "eXIf"].includes(type)) chunks.push(bytes.subarray(offset, end));
    offset = end;
    if (type === "IEND") break;
  }
  return Buffer.concat(chunks);
}

function stripWebpMetadata(bytes) {
  if (bytes.length < 12) return bytes;
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + length + (length % 2);
    if (end > bytes.length) return bytes;
    if (!["EXIF", "XMP "].includes(type)) chunks.push(bytes.subarray(offset, end));
    offset = end;
  }
  const header = Buffer.from(bytes.subarray(0, 12));
  const body = Buffer.concat(chunks);
  header.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([header, body]);
}

export function generateArenaCardMarkdown(submission) {
  const technical = submission?.technicalProfile || {};
  const links = Array.isArray(submission?.links) ? submission.links : [];
  const team = Array.isArray(submission?.teamMembers) ? submission.teamMembers : [];
  const metadata = [
    "---",
    `name: ${yamlValue(submission?.name)}`,
    `type: ${yamlValue(submission?.type)}`,
    `status: ${yamlValue(submission?.status)}`,
    `verification: ${submission?.review?.staffVerified ? "staff_verified" : "partner_supplied"}`,
    `category: ${yamlValue(submission?.category)}`,
    `stage: ${yamlValue(submission?.stage)}`,
    `modalities: ${yamlArray(technical.modalities)}`,
    `tags: ${yamlArray([...(submission?.launchTags || []), ...(submission?.technicalTags || [])])}`,
    "---"
  ].join("\n");

  return [
    metadata,
    "",
    `# ${submission?.name || "Untitled submission"}`,
    "",
    submission?.tagline || "",
    "",
    "## Overview",
    submission?.shortDescription || "",
    "",
    submission?.longDescriptionMarkdown || "",
    "",
    "## Demo and Links",
    ...(links.length ? links.map((link) => `- ${link.label || titleCase(link.type)}: ${link.url}`) : ["- No links supplied yet."]),
    "",
    "## Technical",
    `- Product type: ${technical.productType || submission?.type || "n/a"}`,
    `- Modalities: ${joinValues(technical.modalities) || "n/a"}`,
    `- Stack: ${joinValues(technical.stack) || "n/a"}`,
    `- Data sources: ${joinValues(technical.dataSources) || "n/a"}`,
    `- Deployment: ${technical.deployment || "n/a"}`,
    `- License / restrictions: ${technical.license || "n/a"}`,
    `- Intended users: ${technical.intendedUsers || "n/a"}`,
    `- Limitations: ${technical.limitations || "Partner supplied; not staff verified."}`,
    `- Privacy: ${technical.privacy || "Partner supplied; not staff verified."}`,
    `- Evaluation claims: ${technical.evaluationClaims || "Partner supplied; not staff verified."}`,
    "",
    "## Team",
    ...(team.length ? team.map((member) => `- ${member.name}${member.role ? `, ${member.role}` : ""}`) : ["- Team not supplied yet."]),
    "",
    "## Maker Note",
    submission?.makerNote || "No launch note supplied yet."
  ].join("\n").replace(/\n{3,}/g, "\n\n");
}

export function normalizeSubmission(input, viewer, existing = null, now = new Date().toISOString(), options = {}) {
  const source = { ...(existing || {}), ...(input || {}) };
  const id = existing?.id || cleanId(source.id) || eventId("arena_sub", `${viewer?.id || viewer?.email}:${source.name || now}`, now);
  const ownerId = existing?.ownerId || viewer?.id || "unknown";
  const ownerEmail = existing?.ownerEmail || viewer?.email || "";
  const assets = normalizeAssets(source.assets || []);
  const links = normalizeLinks(source.links || []);
  const thumbnailAssetId = source.thumbnailAssetId && assets.some((asset) => asset.id === source.thumbnailAssetId)
    ? source.thumbnailAssetId
    : assets.find((asset) => asset.type === "thumbnail")?.id || "";
  const galleryAssetIds = assets
    .filter((asset) => asset.type === "gallery")
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))
    .map((asset) => asset.id);
  const type = SUBMISSION_TYPES.includes(source.type) ? source.type : "Product";
  const status = options.keepStatus && existing?.status ? existing.status : options.fallbackStatus || source.status || "draft";
  if (!SUBMISSION_STATUSES.has(status)) throw new Error("Invalid submission status.");

  const submission = {
    id,
    ownerId,
    ownerEmail,
    type,
    status,
    visibility: source.visibility || (status === "published" ? "public" : "private"),
    name: limitedString(source.name, 120),
    slug: slugify(source.slug || source.name || id),
    tagline: limitedString(source.tagline, 60),
    shortDescription: limitedString(source.shortDescription, 500),
    longDescriptionMarkdown: limitedString(source.longDescriptionMarkdown, 5000),
    makerNote: limitedString(source.makerNote, 1600),
    category: limitedString(source.category, 80),
    stage: limitedString(source.stage, 80) || "Pre-Seed",
    region: limitedString(source.region, 80),
    affiliation: limitedString(source.affiliation, 120) || "Partner Company",
    launchTags: normalizeStringList(source.launchTags).slice(0, 3),
    technicalTags: normalizeStringList(source.technicalTags).slice(0, 12),
    thumbnailAssetId,
    galleryAssetIds,
    links,
    teamMembers: normalizeTeam(source.teamMembers || []),
    technicalProfile: normalizeTechnical(source.technicalProfile || {}),
    traction: normalizeTraction(source.traction || {}),
    helpRequests: normalizeStringList(source.helpRequests).slice(0, 10),
    assets,
    review: normalizeReview(source.review || {}, existing, viewer),
    humanValidation: normalizeHumanValidation(existing?.humanValidation || {}, id, source.review || existing?.review),
    arenaScore: existing?.arenaScore ?? null,
    partnerSuppliedMetrics: normalizeTraction(source.partnerSuppliedMetrics || source.traction || {}),
    createdAt: existing?.createdAt || source.createdAt || now,
    updatedAt: now,
    submittedAt: existing?.submittedAt || source.submittedAt || null,
    approvedAt: existing?.approvedAt || source.approvedAt || null,
    publishedAt: existing?.publishedAt || source.publishedAt || null,
    version: Number(existing?.version || 0) + 1
  };
  submission.readiness = calculateReadiness(submission);
  submission.arenaCardMarkdown = generateArenaCardMarkdown(submission);
  return submission;
}

function nominateHumanValidation(submissions, payload, viewer, now) {
  const existing = requiredSubmission(submissions, payload?.id || payload?.submissionId || payload?.productId);
  const humanValidation = cloneHumanValidation(existing.humanValidation, existing, now);
  const activeRequest = activeHumanRequest(humanValidation, payload?.requestId);
  const request =
    activeRequest ||
    {
      id: eventId("hv_req", `${existing.id}:${now}`, now),
      productId: existing.id,
      submissionId: existing.id,
      requestedByUserId: null,
      requestedByEmail: null,
      nominatedByStaffId: viewer?.id || null,
      nominatedByStaffEmail: viewer?.email || "",
      status: "invited",
      validationType: normalizeValidationType(payload?.validationType),
      reasonForNomination: limitedString(payload?.reason || payload?.reasonForNomination || "SparkLabs selected this product for invite-only human validation.", 1200),
      memberConsentAt: null,
      createdAt: now,
      updatedAt: now
    };
  request.status = "invited";
  request.validationType = normalizeValidationType(payload?.validationType || request.validationType);
  request.reasonForNomination = limitedString(payload?.reason || payload?.reasonForNomination || request.reasonForNomination, 1200);
  request.nominatedByStaffId = viewer?.id || request.nominatedByStaffId || null;
  request.nominatedByStaffEmail = viewer?.email || request.nominatedByStaffEmail || "";
  request.updatedAt = now;

  humanValidation.requests = upsertById(humanValidation.requests, request);
  humanValidation.humanStatus = "invited";
  humanValidation.updatedAt = now;
  humanValidation.auditLogs = addAuditLog(humanValidation.auditLogs, viewer, "nominate_human_validation", "human_validation_request", request.id, {
    submissionId: existing.id,
    validationType: request.validationType
  }, now);
  return submissionWithHumanValidation(existing, humanValidation, now);
}

function acceptHumanValidationInvitation(submissions, payload, viewer, now) {
  const existing = requiredSubmission(submissions, payload?.id || payload?.submissionId || payload?.productId);
  assertCanOwnHumanValidation(existing, viewer);
  const humanValidation = cloneHumanValidation(existing.humanValidation, existing, now);
  const request = requiredHumanRequest(humanValidation, payload?.requestId);
  if (!["invited", "needs_more_evidence"].includes(request.status)) {
    const error = new Error("Human validation invitation is not ready to start.");
    error.status = 400;
    throw error;
  }
  request.status = "requested";
  request.requestedByUserId = viewer?.id || null;
  request.requestedByEmail = viewer?.email || "";
  request.memberConsentAt = now;
  request.updatedAt = now;
  request.evidenceConfirmed = {
    workingProductUrl: Boolean(payload?.workingProductUrl || linkOfType(existing, "website") || linkOfType(existing, "demo")),
    demoLoginOrVideo: Boolean(payload?.demoLoginOrVideo || linkOfType(existing, "demo") || linkOfType(existing, "video")),
    productDescription: Boolean(existing.shortDescription),
    targetCustomer: Boolean(existing.technicalProfile?.intendedUsers || existing.traction?.customers),
    keyClaims: Boolean(existing.technicalProfile?.evaluationClaims),
    privacyDataHandling: Boolean(existing.technicalProfile?.privacy)
  };
  humanValidation.requests = upsertById(humanValidation.requests, request);
  humanValidation.humanStatus = "requested";
  humanValidation.updatedAt = now;
  humanValidation.auditLogs = addAuditLog(humanValidation.auditLogs, viewer, "accept_human_validation_invitation", "human_validation_request", request.id, {
    submissionId: existing.id
  }, now);
  return submissionWithHumanValidation(existing, humanValidation, now);
}

function assignHumanValidator(submissions, payload, viewer, now) {
  const existing = requiredSubmission(submissions, payload?.id || payload?.submissionId || payload?.productId);
  const humanValidation = cloneHumanValidation(existing.humanValidation, existing, now);
  const request = requiredHumanRequest(humanValidation, payload?.requestId);
  if (HUMAN_VALIDATION_FINAL_STATUSES.has(request.status)) {
    const error = new Error("Finalized human validation requests cannot receive new reviewer assignments.");
    error.status = 400;
    throw error;
  }
  const reviewerEmail = requiredEmail(payload, "reviewerEmail");
  const assignment = {
    id: existingAssignmentForReviewer(humanValidation, request.id, reviewerEmail)?.id || eventId("hv_asg", `${request.id}:${reviewerEmail}`, now),
    humanValidationRequestId: request.id,
    reviewerUserId: cleanId(payload?.reviewerUserId) || null,
    reviewerEmail,
    reviewerName: limitedString(payload?.reviewerName, 120),
    validatorType: normalizeValidatorType(payload?.validatorType),
    assignedByStaffId: viewer?.id || null,
    assignedByStaffEmail: viewer?.email || "",
    status: "assigned",
    dueAt: optionalIsoDate(payload?.dueAt),
    conflictDeclared: false,
    conflictNote: null,
    createdAt: existingAssignmentForReviewer(humanValidation, request.id, reviewerEmail)?.createdAt || now,
    updatedAt: now
  };
  request.status = "assigned";
  request.updatedAt = now;
  humanValidation.requests = upsertById(humanValidation.requests, request);
  humanValidation.assignments = upsertById(humanValidation.assignments, assignment);
  humanValidation.humanStatus = "assigned";
  humanValidation.updatedAt = now;
  humanValidation.auditLogs = addAuditLog(humanValidation.auditLogs, viewer, "assign_human_validator", "human_validation_assignment", assignment.id, {
    requestId: request.id,
    reviewerEmail
  }, now);
  return submissionWithHumanValidation(existing, humanValidation, now);
}

function declareHumanValidationConflict(submissions, payload, viewer, now) {
  const { submission: existing, humanValidation, assignment, request } = requireAssignmentForReviewer(submissions, payload?.assignmentId, viewer);
  assignment.status = "conflict_declared";
  assignment.conflictDeclared = true;
  assignment.conflictNote = limitedString(payload?.note || payload?.conflictNote || "Conflict declared.", 1200);
  assignment.updatedAt = now;
  request.staffReviewRequired = true;
  request.updatedAt = now;
  humanValidation.assignments = upsertById(humanValidation.assignments, assignment);
  humanValidation.requests = upsertById(humanValidation.requests, request);
  humanValidation.auditLogs = addAuditLog(humanValidation.auditLogs, viewer, "declare_human_validation_conflict", "human_validation_assignment", assignment.id, {
    requestId: request.id
  }, now);
  return submissionWithHumanValidation(existing, humanValidation, now);
}

function submitHumanValidationReview(submissions, payload, viewer, now) {
  const { submission: existing, humanValidation, assignment, request } = requireAssignmentForReviewer(submissions, payload?.assignmentId, viewer);
  const conflictStatus = String(payload?.conflictStatus || payload?.conflict || "no_conflict").trim().toLowerCase();
  if (!["no_conflict", "none", "false"].includes(conflictStatus)) {
    return declareHumanValidationConflict(submissions, { assignmentId: assignment.id, note: payload?.conflictNote || "Conflict declared before review." }, viewer, now);
  }
  if (!["assigned", "in_review"].includes(assignment.status)) {
    const error = new Error("This human validation assignment is not open for review.");
    error.status = 400;
    throw error;
  }
  const scores = normalizeRubricScores(payload?.rubricScores || payload?.scores || {});
  const overallScore = calculateHumanReviewScore(scores);
  const review = {
    id: existingReviewForAssignment(humanValidation, assignment.id)?.id || eventId("hv_rev", `${assignment.id}:${viewer?.email || ""}`, now),
    humanValidationRequestId: request.id,
    assignmentId: assignment.id,
    reviewerUserId: viewer?.id || assignment.reviewerUserId || null,
    reviewerEmail: viewer?.email || assignment.reviewerEmail || "",
    reviewerType: assignment.validatorType || viewer?.humanValidatorType || "mentor",
    status: "submitted",
    overallScore,
    confidence: normalizeConfidence(payload?.confidence),
    publicSummary: limitedString(payload?.publicSummary || "", 1200),
    privateNote: limitedString(payload?.privateNote || "", 1600),
    riskFlags: normalizeStringList(payload?.riskFlags || payload?.risk_flags).slice(0, 12),
    missingEvidence: normalizeStringList(payload?.missingEvidence || payload?.missing_evidence).slice(0, 12),
    scores,
    createdAt: existingReviewForAssignment(humanValidation, assignment.id)?.createdAt || now,
    submittedAt: now
  };
  assignment.status = "submitted";
  assignment.conflictDeclared = false;
  assignment.conflictNote = null;
  assignment.updatedAt = now;
  request.status = "in_review";
  request.updatedAt = now;
  humanValidation.assignments = upsertById(humanValidation.assignments, assignment);
  humanValidation.reviews = upsertById(humanValidation.reviews, review);
  humanValidation.requests = upsertById(humanValidation.requests, request);
  aggregateHumanValidation(humanValidation, request.id, now);
  humanValidation.auditLogs = addAuditLog(humanValidation.auditLogs, viewer, "submit_human_validation_review", "human_validation_review", review.id, {
    requestId: request.id,
    overallScore: review.overallScore
  }, now);
  return submissionWithHumanValidation(existing, humanValidation, now);
}

function issueHumanValidationBadge(submissions, payload, viewer, now) {
  const existing = requiredSubmission(submissions, payload?.id || payload?.submissionId || payload?.productId);
  const humanValidation = cloneHumanValidation(existing.humanValidation, existing, now);
  const request = requiredHumanRequest(humanValidation, payload?.requestId);
  aggregateHumanValidation(humanValidation, request.id, now);
  if (!humanValidation.reviewCount) {
    const error = new Error("At least one submitted human review is required before issuing a badge.");
    error.status = 400;
    throw error;
  }
  request.status = "human_validated";
  request.updatedAt = now;
  const badge = {
    id: existingBadgeForProduct(humanValidation, existing.id, "human_validated")?.id || eventId("hv_badge", `${existing.id}:${request.id}`, now),
    productId: existing.id,
    badgeType: "human_validated",
    status: "active",
    score: round1(humanValidation.humanScore),
    confidence: round2(humanValidation.confidence),
    confidenceBand: confidenceBand(humanValidation.confidence),
    issuedByUserId: viewer?.id || null,
    issuedByEmail: viewer?.email || "",
    issuedAt: now,
    revokedAt: null,
    publicNote: limitedString(payload?.publicNote || publicBadgeSummary(humanValidation), 1200),
    privateNote: limitedString(payload?.privateNote || "", 1600)
  };
  humanValidation.requests = upsertById(humanValidation.requests, request);
  humanValidation.badges = upsertById(humanValidation.badges, badge);
  humanValidation.humanStatus = "human_validated";
  humanValidation.verificationStatus = "human_validated";
  humanValidation.publicSummary = badge.publicNote;
  humanValidation.updatedAt = now;
  humanValidation.auditLogs = addAuditLog(humanValidation.auditLogs, viewer, "issue_human_validated_badge", "validation_badge", badge.id, {
    requestId: request.id,
    score: badge.score,
    confidence: badge.confidence
  }, now);
  return submissionWithHumanValidation(existing, humanValidation, now);
}

function requestMoreEvidence(submissions, payload, viewer, now) {
  const existing = requiredSubmission(submissions, payload?.id || payload?.submissionId || payload?.productId);
  const humanValidation = cloneHumanValidation(existing.humanValidation, existing, now);
  const request = requiredHumanRequest(humanValidation, payload?.requestId);
  request.status = "needs_more_evidence";
  request.moreEvidenceNote = requiredString(payload, "note", 1200);
  request.updatedAt = now;
  humanValidation.requests = upsertById(humanValidation.requests, request);
  humanValidation.humanStatus = "needs_more_evidence";
  humanValidation.publicSummary = request.moreEvidenceNote;
  humanValidation.updatedAt = now;
  humanValidation.auditLogs = addAuditLog(humanValidation.auditLogs, viewer, "request_more_human_validation_evidence", "human_validation_request", request.id, {
    submissionId: existing.id
  }, now);
  return submissionWithHumanValidation(existing, humanValidation, now);
}

function revokeHumanValidationBadge(submissions, payload, viewer, now) {
  const existing = requiredSubmission(submissions, payload?.id || payload?.submissionId || payload?.productId);
  const humanValidation = cloneHumanValidation(existing.humanValidation, existing, now);
  const activeBadge = existingBadgeForProduct(humanValidation, existing.id, "human_validated");
  if (!activeBadge) {
    const error = new Error("No active human validated badge found.");
    error.status = 404;
    throw error;
  }
  activeBadge.status = "revoked";
  activeBadge.revokedAt = now;
  activeBadge.privateNote = limitedString(payload?.reason || payload?.privateNote || activeBadge.privateNote, 1600);
  humanValidation.badges = upsertById(humanValidation.badges, activeBadge);
  humanValidation.humanStatus = "completed";
  humanValidation.verificationStatus = humanValidation.machineStatus === "passed" ? "machine_validated" : "none";
  humanValidation.updatedAt = now;
  humanValidation.auditLogs = addAuditLog(humanValidation.auditLogs, viewer, "revoke_human_validated_badge", "validation_badge", activeBadge.id, {
    submissionId: existing.id
  }, now);
  return submissionWithHumanValidation(existing, humanValidation, now);
}

function staffStatusUpdate(submissions, payload, viewer, now, status, patch = {}) {
  const existing = requiredSubmission(submissions, payload?.id);
  const submission = {
    ...existing,
    ...patch,
    status,
    visibility: patch.visibility || existing.visibility || "private",
    review: {
      ...(existing.review || {}),
      lastNote: patch.note || existing.review?.lastNote || null,
      lastReviewedAt: now,
      reviewerEmail: viewer.email,
      internalNote: optionalString(payload, "internalNote", 1200) || existing.review?.internalNote || null,
      staffVerified: Boolean(existing.review?.staffVerified)
    },
    updatedAt: now,
    version: Number(existing.version || 1) + 1
  };
  submission.readiness = calculateReadiness(submission);
  submission.arenaCardMarkdown = generateArenaCardMarkdown(submission);
  return submission;
}

function reviewEvent(prefix, type, submission, viewer, now) {
  return {
    id: eventId(prefix, submission.id, now),
    type,
    submission,
    actor: actorFromViewer(viewer),
    createdAt: now
  };
}

function normalizeAssets(assets) {
  return (Array.isArray(assets) ? assets : [])
    .slice(0, 12)
    .map((asset, index) => {
      const normalized = {
        id: cleanId(asset.id) || eventId("asset", `${asset.fileName || "asset"}:${index}`, new Date().toISOString()),
        submissionId: cleanId(asset.submissionId) || "",
        ownerId: cleanId(asset.ownerId) || "",
        type: ["thumbnail", "gallery", "video", "deck", "doc", "readme", "other"].includes(asset.type) ? asset.type : "gallery",
        fileName: limitedString(asset.fileName, 160) || "upload",
        mimeType: limitedString(asset.mimeType, 80),
        size: Math.max(0, Number(asset.size || 0)),
        storageKey: limitedString(asset.storageKey, 240),
        previewUrl: limitedString(asset.previewUrl, 1_600),
        dataUrl: limitedString(asset.dataUrl, 2_100_000),
        caption: limitedString(asset.caption, 240),
        altText: limitedString(asset.altText, 240),
        sortOrder: Number.isFinite(Number(asset.sortOrder)) ? Number(asset.sortOrder) : index,
        createdAt: asset.createdAt || new Date().toISOString()
      };
      const validation = sanitizeAsset(normalized);
      if (!validation.ok) throw new Error(validation.error);
      return validation.asset;
    });
}

function normalizeLinks(links) {
  return (Array.isArray(links) ? links : [])
    .slice(0, 16)
    .map((link, index) => {
      if (!link?.url) return null;
      const result = validateUrl(link.url);
      if (!result.ok) throw new Error(result.error);
      return {
        id: cleanId(link.id) || eventId("link", `${result.url}:${index}`, new Date().toISOString()),
        type: normalizeLinkType(link.type || detectLinkType(result.host)),
        url: result.url,
        label: limitedString(link.label, 80) || titleCase(link.type || detectLinkType(result.host)),
        host: result.host,
        warnings: result.warnings,
        createdAt: link.createdAt || new Date().toISOString()
      };
    })
    .filter(Boolean);
}

function normalizeTeam(teamMembers) {
  return (Array.isArray(teamMembers) ? teamMembers : [])
    .slice(0, 8)
    .map((member) => ({
      id: cleanId(member.id) || eventId("member", `${member.name || ""}:${member.email || ""}`, new Date().toISOString()),
      name: limitedString(member.name, 120),
      role: limitedString(member.role, 120),
      email: limitedString(member.email, 160),
      link: validateOptionalUrl(member.link),
      location: limitedString(member.location, 120)
    }))
    .filter((member) => member.name || member.email);
}

function normalizeTechnical(profile) {
  return {
    productType: limitedString(profile.productType, 80),
    modalities: normalizeStringList(profile.modalities).slice(0, 10),
    stack: normalizeStringList(profile.stack).slice(0, 20),
    frameworks: normalizeStringList(profile.frameworks).slice(0, 20),
    providers: normalizeStringList(profile.providers).slice(0, 20),
    dataSources: normalizeStringList(profile.dataSources).slice(0, 20),
    stackVisibility: ["public", "arena_members", "approved_partner"].includes(profile.stackVisibility)
      ? profile.stackVisibility
      : "arena_members",
    deployment: limitedString(profile.deployment, 500),
    apiDetails: limitedString(profile.apiDetails, 800),
    license: limitedString(profile.license, 500),
    intendedUsers: limitedString(profile.intendedUsers, 800),
    limitations: limitedString(profile.limitations, 1200),
    privacy: limitedString(profile.privacy, 1200),
    safety: limitedString(profile.safety, 1200),
    evaluationClaims: limitedString(profile.evaluationClaims, 1200)
  };
}

function normalizeTraction(traction) {
  return {
    pricing: limitedString(traction.pricing, 240),
    businessModel: limitedString(traction.businessModel, 240),
    customers: limitedString(traction.customers, 240),
    users: limitedString(traction.users, 240),
    revenue: limitedString(traction.revenue, 240),
    waitlist: limitedString(traction.waitlist, 240),
    fundingStage: limitedString(traction.fundingStage, 120)
  };
}

function normalizeReview(review, existing, viewer) {
  return {
    lastNote: limitedString(review.lastNote || existing?.review?.lastNote, 1200),
    lastReviewedAt: review.lastReviewedAt || existing?.review?.lastReviewedAt || null,
    reviewerEmail: limitedString(review.reviewerEmail || existing?.review?.reviewerEmail, 160),
    internalNote: viewer?.canScore ? limitedString(review.internalNote || existing?.review?.internalNote, 1200) : existing?.review?.internalNote || null,
    staffVerified: Boolean(review.staffVerified || existing?.review?.staffVerified)
  };
}

function normalizeHumanValidation(humanValidation, submissionId, review = {}) {
  const machineStatus = MACHINE_VALIDATION_STATUSES.has(humanValidation?.machineStatus)
    ? humanValidation.machineStatus
    : review?.staffVerified
      ? "passed"
      : "not_started";
  const humanStatus = HUMAN_VALIDATION_STATUSES.has(humanValidation?.humanStatus)
    ? humanValidation.humanStatus
    : "not_eligible";
  const verificationStatus = SPARKLABS_VERIFICATION_STATUSES.has(humanValidation?.verificationStatus)
    ? humanValidation.verificationStatus
    : machineStatus === "passed"
      ? "machine_validated"
      : "none";
  return {
    machineStatus,
    humanStatus,
    verificationStatus,
    humanScore: nullableNumber(humanValidation?.humanScore),
    confidence: nullableNumber(humanValidation?.confidence),
    confidenceBand: confidenceBand(humanValidation?.confidence),
    reviewCount: Math.max(0, Number(humanValidation?.reviewCount || 0)),
    staffResolutionRequired: Boolean(humanValidation?.staffResolutionRequired),
    publicSummary: limitedString(humanValidation?.publicSummary, 1200),
    requests: normalizeHumanRequests(humanValidation?.requests, submissionId),
    assignments: normalizeHumanAssignments(humanValidation?.assignments),
    reviews: normalizeHumanReviews(humanValidation?.reviews),
    badges: normalizeValidationBadges(humanValidation?.badges, submissionId),
    auditLogs: normalizeAuditLogs(humanValidation?.auditLogs),
    updatedAt: humanValidation?.updatedAt || null
  };
}

function cloneHumanValidation(humanValidation, submission, now) {
  return normalizeHumanValidation(humanValidation || submission?.humanValidation || {}, submission?.id || "", submission?.review || {});
}

function normalizeHumanRequests(requests, submissionId) {
  return (Array.isArray(requests) ? requests : [])
    .slice(0, 20)
    .map((request) => ({
      id: cleanId(request.id),
      productId: cleanId(request.productId || submissionId),
      submissionId: cleanId(request.submissionId || submissionId),
      requestedByUserId: cleanId(request.requestedByUserId),
      requestedByEmail: limitedString(request.requestedByEmail, 160),
      nominatedByStaffId: cleanId(request.nominatedByStaffId),
      nominatedByStaffEmail: limitedString(request.nominatedByStaffEmail, 160),
      status: HUMAN_VALIDATION_STATUSES.has(request.status) ? request.status : "invited",
      validationType: normalizeValidationType(request.validationType),
      reasonForNomination: limitedString(request.reasonForNomination, 1200),
      memberConsentAt: request.memberConsentAt || null,
      evidenceConfirmed: normalizeEvidenceChecklist(request.evidenceConfirmed),
      moreEvidenceNote: limitedString(request.moreEvidenceNote, 1200),
      staffReviewRequired: Boolean(request.staffReviewRequired),
      createdAt: request.createdAt || new Date().toISOString(),
      updatedAt: request.updatedAt || request.createdAt || new Date().toISOString()
    }))
    .filter((request) => request.id);
}

function normalizeHumanAssignments(assignments) {
  return (Array.isArray(assignments) ? assignments : [])
    .slice(0, 60)
    .map((assignment) => ({
      id: cleanId(assignment.id),
      humanValidationRequestId: cleanId(assignment.humanValidationRequestId),
      reviewerUserId: cleanId(assignment.reviewerUserId),
      reviewerEmail: limitedString(assignment.reviewerEmail, 160).toLowerCase(),
      reviewerName: limitedString(assignment.reviewerName, 120),
      validatorType: normalizeValidatorType(assignment.validatorType),
      assignedByStaffId: cleanId(assignment.assignedByStaffId),
      assignedByStaffEmail: limitedString(assignment.assignedByStaffEmail, 160),
      status: ["assigned", "in_review", "submitted", "conflict_declared", "cancelled"].includes(assignment.status) ? assignment.status : "assigned",
      dueAt: assignment.dueAt || null,
      conflictDeclared: Boolean(assignment.conflictDeclared),
      conflictNote: limitedString(assignment.conflictNote, 1200),
      createdAt: assignment.createdAt || new Date().toISOString(),
      updatedAt: assignment.updatedAt || assignment.createdAt || new Date().toISOString()
    }))
    .filter((assignment) => assignment.id && assignment.humanValidationRequestId);
}

function normalizeHumanReviews(reviews) {
  return (Array.isArray(reviews) ? reviews : [])
    .slice(0, 80)
    .map((review) => ({
      id: cleanId(review.id),
      humanValidationRequestId: cleanId(review.humanValidationRequestId),
      assignmentId: cleanId(review.assignmentId),
      reviewerUserId: cleanId(review.reviewerUserId),
      reviewerEmail: limitedString(review.reviewerEmail, 160).toLowerCase(),
      reviewerType: normalizeValidatorType(review.reviewerType),
      status: review.status === "submitted" ? "submitted" : "draft",
      overallScore: round1(review.overallScore),
      confidence: normalizeConfidence(review.confidence),
      publicSummary: limitedString(review.publicSummary, 1200),
      privateNote: limitedString(review.privateNote, 1600),
      riskFlags: normalizeStringList(review.riskFlags).slice(0, 12),
      missingEvidence: normalizeStringList(review.missingEvidence).slice(0, 12),
      scores: normalizeRubricScores(review.scores || {}),
      createdAt: review.createdAt || new Date().toISOString(),
      submittedAt: review.submittedAt || null
    }))
    .filter((review) => review.id && review.assignmentId);
}

function normalizeValidationBadges(badges, submissionId) {
  return (Array.isArray(badges) ? badges : [])
    .slice(0, 20)
    .map((badge) => ({
      id: cleanId(badge.id),
      productId: cleanId(badge.productId || submissionId),
      badgeType: ["machine_validated", "human_validated", "sparklabs_verified"].includes(badge.badgeType) ? badge.badgeType : "human_validated",
      status: ["active", "revoked"].includes(badge.status) ? badge.status : "active",
      score: nullableNumber(badge.score),
      confidence: nullableNumber(badge.confidence),
      confidenceBand: confidenceBand(badge.confidence),
      issuedByUserId: cleanId(badge.issuedByUserId),
      issuedByEmail: limitedString(badge.issuedByEmail, 160),
      issuedAt: badge.issuedAt || null,
      revokedAt: badge.revokedAt || null,
      publicNote: limitedString(badge.publicNote, 1200),
      privateNote: limitedString(badge.privateNote, 1600)
    }))
    .filter((badge) => badge.id);
}

function normalizeAuditLogs(logs) {
  return (Array.isArray(logs) ? logs : [])
    .slice(0, 120)
    .map((log) => ({
      id: cleanId(log.id),
      actorUserId: cleanId(log.actorUserId),
      actorEmail: limitedString(log.actorEmail, 160),
      action: limitedString(log.action, 120),
      entityType: limitedString(log.entityType, 80),
      entityId: cleanId(log.entityId),
      metadata: log.metadata && typeof log.metadata === "object" ? { ...log.metadata } : {},
      createdAt: log.createdAt || new Date().toISOString()
    }))
    .filter((log) => log.id);
}

function normalizeEvidenceChecklist(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    workingProductUrl: Boolean(source.workingProductUrl),
    demoLoginOrVideo: Boolean(source.demoLoginOrVideo),
    productDescription: Boolean(source.productDescription),
    targetCustomer: Boolean(source.targetCustomer),
    keyClaims: Boolean(source.keyClaims),
    privacyDataHandling: Boolean(source.privacyDataHandling)
  };
}

function normalizeRubricScores(scores) {
  const byKey = Array.isArray(scores)
    ? Object.fromEntries(scores.map((item) => [item?.criterionKey || item?.key, item]))
    : scores && typeof scores === "object"
      ? scores
      : {};
  return HUMAN_VALIDATION_RUBRIC.map((criterion) => {
    const source = byKey[criterion.key] || {};
    const rawScore = typeof source === "object" ? source.score : source;
    return {
      criterionKey: criterion.key,
      label: criterion.label,
      score: clamp(Number(rawScore || 0), 0, 10),
      weight: criterion.weight,
      comment: limitedString(typeof source === "object" ? source.comment : "", 600)
    };
  });
}

function calculateHumanReviewScore(scores) {
  const totalWeight = HUMAN_VALIDATION_RUBRIC.reduce((total, item) => total + item.weight, 0);
  const score = normalizeRubricScores(scores).reduce((total, item) => total + item.score * item.weight, 0);
  return round1((score / totalWeight) * 10);
}

function aggregateHumanValidation(humanValidation, requestId, now) {
  const assignments = humanValidation.assignments.filter((assignment) => assignment.humanValidationRequestId === requestId && assignment.status !== "cancelled");
  const reviews = humanValidation.reviews.filter((review) => review.humanValidationRequestId === requestId && review.status === "submitted");
  const reviewScores = reviews.map((review) => Number(review.overallScore || 0));
  const submittedCount = reviews.length;
  const openAssignments = assignments.filter((assignment) => ["assigned", "in_review"].includes(assignment.status)).length;
  const conflictCount = assignments.filter((assignment) => assignment.status === "conflict_declared").length;
  const score = submittedCount ? mean(reviewScores) : null;
  const spread = submittedCount > 1 ? Math.max(...reviewScores) - Math.min(...reviewScores) : 0;
  const reviewerConfidence = submittedCount ? mean(reviews.map((review) => normalizeConfidence(review.confidence))) : 0;
  const reviewCountFactor = submittedCount >= 3 ? 1 : submittedCount === 2 ? 0.82 : submittedCount === 1 ? 0.62 : 0;
  const agreementFactor = submittedCount <= 1 ? 0.88 : clamp(1 - standardDeviation(reviewScores) / 38, 0.45, 1);
  const confidence = submittedCount ? round2(clamp(reviewCountFactor * reviewerConfidence * agreementFactor, 0, 1)) : null;
  const request = humanValidation.requests.find((item) => item.id === requestId);
  if (request) {
    request.reviewCount = submittedCount;
    request.humanScore = score === null ? null : round1(score);
    request.confidence = confidence;
    request.staffReviewRequired = Boolean(request.staffReviewRequired || conflictCount || spread >= 25);
    request.status = submittedCount && !openAssignments ? "completed" : submittedCount ? "in_review" : request.status;
    request.updatedAt = now;
    humanValidation.requests = upsertById(humanValidation.requests, request);
  }
  humanValidation.humanScore = score === null ? null : round1(score);
  humanValidation.confidence = confidence;
  humanValidation.confidenceBand = confidenceBand(confidence);
  humanValidation.reviewCount = submittedCount;
  humanValidation.staffResolutionRequired = Boolean(conflictCount || spread >= 25);
  humanValidation.humanStatus = request?.status || humanValidation.humanStatus;
  humanValidation.publicSummary = publicSummaryFromReviews(reviews, humanValidation.publicSummary);
  humanValidation.updatedAt = now;
  return humanValidation;
}

function submissionWithHumanValidation(submission, humanValidation, now) {
  const next = {
    ...submission,
    humanValidation: normalizeHumanValidation(humanValidation, submission.id, submission.review || {}),
    updatedAt: now,
    version: Number(submission.version || 1) + 1
  };
  next.arenaCardMarkdown = generateArenaCardMarkdown(next);
  return next;
}

function requiredHumanRequest(humanValidation, requestId) {
  const request = activeHumanRequest(humanValidation, requestId);
  if (!request) {
    const error = new Error("Human validation request not found.");
    error.status = 404;
    throw error;
  }
  return request;
}

function activeHumanRequest(humanValidation, requestId) {
  const requests = humanValidation?.requests || [];
  if (requestId) return requests.find((request) => request.id === requestId) || null;
  return requests.find((request) => !HUMAN_VALIDATION_FINAL_STATUSES.has(request.status)) || requests[0] || null;
}

function requireAssignmentForReviewer(submissions, assignmentId, viewer) {
  const id = cleanId(assignmentId);
  for (const submission of submissions) {
    const humanValidation = cloneHumanValidation(submission.humanValidation, submission);
    const assignment = humanValidation.assignments.find((item) => item.id === id);
    if (!assignment) continue;
    if (!canSubmitHumanReview(viewer, assignment)) {
      const error = new Error("Only assigned active human validators can submit this review.");
      error.status = viewer?.email ? 403 : 401;
      throw error;
    }
    const request = requiredHumanRequest(humanValidation, assignment.humanValidationRequestId);
    return { submission, humanValidation, assignment, request };
  }
  const error = new Error("Human validation assignment not found.");
  error.status = 404;
  throw error;
}

function canSubmitHumanReview(viewer, assignment) {
  if (!viewer?.email) return false;
  if (!viewer.canScore && !viewer.canSubmitHumanReviews) return false;
  return assignment.reviewerEmail === viewer.email || (assignment.reviewerUserId && assignment.reviewerUserId === viewer.id) || viewer.canScore;
}

function assertCanOwnHumanValidation(submission, viewer) {
  if (viewer?.canScore) return;
  if (isSubmissionOwner(submission, viewer)) return;
  const error = new Error("Only the product owner can start this human validation invitation.");
  error.status = viewer?.email ? 403 : 401;
  throw error;
}

function existingAssignmentForReviewer(humanValidation, requestId, reviewerEmail) {
  return humanValidation.assignments.find(
    (assignment) => assignment.humanValidationRequestId === requestId && assignment.reviewerEmail === reviewerEmail
  );
}

function existingReviewForAssignment(humanValidation, assignmentId) {
  return humanValidation.reviews.find((review) => review.assignmentId === assignmentId) || null;
}

function existingBadgeForProduct(humanValidation, productId, badgeType) {
  return humanValidation.badges.find((badge) => badge.productId === productId && badge.badgeType === badgeType && badge.status === "active") || null;
}

function normalizeValidationType(value) {
  const normalized = limitedString(value, 80);
  return HUMAN_VALIDATION_TYPES.includes(normalized) ? normalized : "Product readiness review";
}

function normalizeValidatorType(value) {
  const normalized = String(value || "mentor").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ["staff", "mentor", "advisor", "b2b_partner", "technical_expert", "investor"].includes(normalized) ? normalized : "mentor";
}

function normalizeConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.7;
  return round2(clamp(number > 1 ? number / 100 : number, 0, 1));
}

function confidenceBand(value) {
  const confidence = Number(value || 0);
  if (confidence >= 0.75) return "High";
  if (confidence >= 0.5) return "Medium";
  if (confidence > 0) return "Low";
  return "Pending";
}

function publicBadgeSummary(humanValidation) {
  const strength = Number(humanValidation.humanScore || 0) >= 85 ? "Strong SparkLabs Human Validated review." : "SparkLabs Human Validated by selected reviewers.";
  return `${strength} Confidence: ${confidenceBand(humanValidation.confidence)}.`;
}

function publicSummaryFromReviews(reviews, fallback = "") {
  const summary = reviews.map((review) => review.publicSummary).find((value) => String(value || "").trim());
  return limitedString(summary || fallback, 1200);
}

function addAuditLog(logs, viewer, action, entityType, entityId, metadata, now) {
  return [
    {
      id: eventId("audit", `${action}:${entityId}:${viewer?.email || ""}`, now),
      actorUserId: viewer?.id || null,
      actorEmail: viewer?.email || "",
      action,
      entityType,
      entityId,
      metadata: metadata && typeof metadata === "object" ? metadata : {},
      createdAt: now
    },
    ...(Array.isArray(logs) ? logs : [])
  ].slice(0, 120);
}

function upsertById(items, item) {
  const next = Array.isArray(items) ? [...items] : [];
  const index = next.findIndex((existing) => existing.id === item.id);
  if (index >= 0) next[index] = item;
  else next.unshift(item);
  return next;
}

function linkOfType(submission, type) {
  return (submission.links || []).find((link) => link.type === type) || null;
}

function submissionToStartup(submission) {
  const thumbnail = submission.assets.find((asset) => asset.id === submission.thumbnailAssetId);
  const gallery = submission.galleryAssetIds
    .map((id) => submission.assets.find((asset) => asset.id === id))
    .filter(Boolean);
  const founder = submission.teamMembers.map((member) => member.name).filter(Boolean).slice(0, 2).join(", ") || submission.ownerEmail;
  const productId = `${submission.id}-product`;
  const humanValidation = normalizeHumanValidation(submission.humanValidation || {}, submission.id, submission.review || {});
  const activeHumanBadge = humanValidation.badges.find((badge) => badge.badgeType === "human_validated" && badge.status === "active");
  return {
    id: submission.id,
    name: submission.name,
    founder,
    ownerId: submission.ownerId,
    ownerEmail: submission.ownerEmail,
    region: submission.region || "Global",
    category: submission.category || submission.type,
    stage: submission.stage || "Pre-Seed",
    affiliation: submission.affiliation || "Partner Company",
    tagline: submission.tagline,
    description: submission.shortDescription,
    tags: [...submission.launchTags, ...submission.technicalTags],
    functions: [...submission.launchTags, ...submission.technicalTags],
    traction: submission.traction?.customers || submission.traction?.users || "Partner supplied",
    upvotes: 0,
    demoRequests: 0,
    investorInterest: 0,
    corporateInterest: 0,
    benchmarkScore: 0,
    verificationStatus: submission.review?.staffVerified ? "Staff verified" : "Partner supplied",
    machineValidationStatus: humanValidation.machineStatus,
    humanValidationStatus: humanValidation.humanStatus,
    sparkLabsVerificationStatus: humanValidation.verificationStatus,
    humanValidationScore: humanValidation.humanScore,
    humanValidationConfidence: humanValidation.confidence,
    humanValidationConfidenceBand: humanValidation.confidenceBand,
    humanValidationBadge: activeHumanBadge
      ? {
          badgeType: activeHumanBadge.badgeType,
          score: activeHumanBadge.score,
          confidence: activeHumanBadge.confidence,
          confidenceBand: activeHumanBadge.confidenceBand,
          publicNote: activeHumanBadge.publicNote,
          issuedAt: activeHumanBadge.issuedAt
        }
      : null,
    humanValidationPublicSummary: humanValidation.publicSummary,
    readinessScore: submission.readiness?.score || 0,
    thumbnail: thumbnail?.dataUrl || thumbnail?.previewUrl || "",
    gallery: gallery.map((asset) => asset.dataUrl || asset.previewUrl).filter(Boolean),
    partnerSubmissionId: submission.id,
    products: [
      {
        id: productId,
        name: submission.name,
        type: submission.type,
        upvotes: 0,
        launchStatus: submission.status,
        links: submission.links
      }
    ]
  };
}

function sanitizeSubmissionForViewer(submission, viewer) {
  const staff = Boolean(viewer?.canScore);
  const sanitized = clone(submission);
  const owner = isSubmissionOwner(submission, viewer);
  const stackVisibility = sanitized.technicalProfile?.stackVisibility || "arena_members";
  const canViewPartnerStack = staff || owner || stackVisibility === "public" || hasPartnerStackGrant(submission, viewer);
  if (!canViewPartnerStack && sanitized.technicalProfile) {
    sanitized.technicalProfile = {
      ...sanitized.technicalProfile,
      stack: [],
      frameworks: [],
      providers: [],
      dataSources: [],
      deployment: "",
      apiDetails: "",
      stackRestricted: true
    };
  }
  sanitized.humanValidation = sanitizeHumanValidationForViewer(submission.humanValidation || {}, submission, viewer);
  if (!staff) {
    sanitized.review = {
      lastNote: sanitized.review?.lastNote || null,
      lastReviewedAt: sanitized.review?.lastReviewedAt || null,
      staffVerified: Boolean(sanitized.review?.staffVerified)
    };
    sanitized.arenaScore = null;
    if (!owner) {
      sanitized.ownerId = null;
      sanitized.ownerEmail = "";
      sanitized.teamMembers = (sanitized.teamMembers || []).map(({ email: _email, ...member }) => member);
      sanitized.links = (sanitized.links || []).filter((link) => !/github|repository|source|api/i.test(link.type || ""));
    }
  }
  sanitized.arenaCardMarkdown = generateArenaCardMarkdown(sanitized);
  return sanitized;
}

function hasPartnerStackGrant(submission, viewer) {
  if (viewer?.role !== "b2b_partner") return false;
  const grants = Array.isArray(submission?.partnerGrants)
    ? submission.partnerGrants
    : Array.isArray(submission?.technicalProfile?.partnerGrants)
      ? submission.technicalProfile.partnerGrants
      : [];
  const now = Date.now();
  return grants.some((grant) => {
    const partnerMatch =
      (grant.partnerId && grant.partnerId === viewer.b2bProfileId) ||
      (grant.partnerEmail && grant.partnerEmail === viewer.email);
    const active = !grant.expiresAt || Date.parse(grant.expiresAt) > now;
    const scopes = Array.isArray(grant.scopes) ? grant.scopes : [];
    return partnerMatch && active && scopes.includes("technical_profile");
  });
}

function sanitizeHumanValidationForViewer(humanValidation, submission, viewer) {
  const normalized = normalizeHumanValidation(humanValidation || {}, submission.id, submission.review || {});
  const activeBadges = normalized.badges
    .filter((badge) => badge.status === "active")
    .map((badge) => ({
      id: badge.id,
      productId: badge.productId,
      badgeType: badge.badgeType,
      status: badge.status,
      score: badge.score,
      confidence: badge.confidence,
      confidenceBand: badge.confidenceBand,
      issuedAt: badge.issuedAt,
      publicNote: badge.publicNote
    }));
  const base = {
    machineStatus: normalized.machineStatus,
    humanStatus: normalized.humanStatus,
    verificationStatus: normalized.verificationStatus,
    humanScore: normalized.humanScore,
    confidence: normalized.confidence,
    confidenceBand: normalized.confidenceBand,
    reviewCount: normalized.reviewCount,
    staffResolutionRequired: Boolean(viewer?.canScore && normalized.staffResolutionRequired),
    publicSummary: normalized.publicSummary,
    badges: activeBadges,
    updatedAt: normalized.updatedAt
  };
  if (viewer?.canScore) return normalized;

  const owner = isSubmissionOwner(submission, viewer);
  const assigned = assignmentsForViewer(normalized, viewer);
  if (owner) {
    return {
      ...base,
      requests: normalized.requests.map((request) => ({
        id: request.id,
        productId: request.productId,
        submissionId: request.submissionId,
        status: request.status,
        validationType: request.validationType,
        reasonForNomination: request.reasonForNomination,
        memberConsentAt: request.memberConsentAt,
        evidenceConfirmed: request.evidenceConfirmed,
        moreEvidenceNote: request.moreEvidenceNote,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt
      })),
      assignmentCount: normalized.assignments.length,
      submittedReviewCount: normalized.reviews.filter((review) => review.status === "submitted").length,
      reviews: normalized.reviews
        .filter((review) => review.status === "submitted")
        .map((review) => ({
          id: review.id,
          humanValidationRequestId: review.humanValidationRequestId,
          status: review.status,
          overallScore: review.overallScore,
          confidence: review.confidence,
          publicSummary: review.publicSummary,
          riskFlags: review.riskFlags,
          missingEvidence: review.missingEvidence,
          submittedAt: review.submittedAt
        }))
    };
  }
  if (assigned.length) {
    const ownAssignmentIds = new Set(assigned.map((assignment) => assignment.id));
    const ownReviews = normalized.reviews.filter((review) => ownAssignmentIds.has(review.assignmentId));
    return {
      ...base,
      requests: normalized.requests
        .filter((request) => assigned.some((assignment) => assignment.humanValidationRequestId === request.id))
        .map((request) => ({
          id: request.id,
          productId: request.productId,
          submissionId: request.submissionId,
          status: request.status,
          validationType: request.validationType,
          reasonForNomination: request.reasonForNomination,
          createdAt: request.createdAt,
          updatedAt: request.updatedAt
        })),
      assignments: assigned.map((assignment) => ({
        id: assignment.id,
        humanValidationRequestId: assignment.humanValidationRequestId,
        status: assignment.status,
        dueAt: assignment.dueAt,
        conflictDeclared: assignment.conflictDeclared,
        conflictNote: assignment.conflictNote,
        validatorType: assignment.validatorType,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt
      })),
      reviews: ownReviews.map((review) => ({
        id: review.id,
        humanValidationRequestId: review.humanValidationRequestId,
        assignmentId: review.assignmentId,
        status: review.status,
        overallScore: review.overallScore,
        confidence: review.confidence,
        publicSummary: review.publicSummary,
        privateNote: review.privateNote,
        riskFlags: review.riskFlags,
        missingEvidence: review.missingEvidence,
        scores: review.scores,
        submittedAt: review.submittedAt
      }))
    };
  }
  return base;
}

function isAssignedHumanReviewer(submission, viewer) {
  return assignmentsForViewer(normalizeHumanValidation(submission?.humanValidation || {}, submission?.id || "", submission?.review || {}), viewer).length > 0;
}

function assignmentsForViewer(humanValidation, viewer) {
  if (!viewer?.email || (!viewer.canScore && !viewer.canSubmitHumanReviews)) return [];
  return (humanValidation.assignments || []).filter(
    (assignment) =>
      assignment.status !== "cancelled" &&
      (assignment.reviewerEmail === viewer.email || (assignment.reviewerUserId && assignment.reviewerUserId === viewer.id) || viewer.canScore)
  );
}

function isSubmissionOwner(submission, viewer) {
  if (!viewer?.canScore && viewer?.role !== "member") return false;
  return Boolean(viewer?.email && (submission.ownerId === viewer.id || submission.ownerEmail === viewer.email));
}

function assertCanEditSubmission(existing, viewer) {
  if (!existing) return;
  if (viewer?.canScore) return;
  if (isSubmissionOwner(existing, viewer)) {
    if (["published", "archived"].includes(existing.status)) {
      const error = new Error("Published or archived submissions need SparkLabs staff to reopen before editing.");
      error.status = 403;
      throw error;
    }
    return;
  }
  const error = new Error("You can only edit your own submissions.");
  error.status = 403;
  throw error;
}

function assertUniqueSlug(submission, submissions) {
  const conflict = submissions.find((item) => item.id !== submission.id && item.slug === submission.slug && item.status !== "archived");
  if (conflict) throw new Error("This slug is already used by another submission.");
}

function requiredSubmission(submissions, id) {
  const submission = findSubmission(submissions, id);
  if (!submission) {
    const error = new Error("Submission not found.");
    error.status = 404;
    throw error;
  }
  return submission;
}

function findSubmission(submissions, id) {
  if (!id) return null;
  return submissions.find((submission) => submission.id === id) || null;
}

function requiredString(payload, key, maxLength) {
  const value = limitedString(payload?.[key], maxLength);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function requiredEmail(payload, key) {
  const value = limitedString(payload?.[key], 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error(`${key} must be a valid email.`);
  return value;
}

function optionalString(payload, key, maxLength) {
  return limitedString(payload?.[key], maxLength);
}

function optionalIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("dueAt must be a valid date.");
  return date.toISOString();
}

function validateOptionalUrl(value) {
  if (!value) return "";
  const result = validateUrl(value);
  if (!result.ok) throw new Error(result.error);
  return result.url;
}

function normalizeLinkType(type) {
  return slugify(type || "link").replaceAll("-", "_") || "link";
}

function detectLinkType(host) {
  if (/github\.com$/i.test(host)) return "github";
  if (/huggingface\.co$/i.test(host)) return "huggingface";
  if (/youtube\.com$|youtu\.be$/i.test(host)) return "video";
  if (/loom\.com$|arcade\.software$|storylane\.io$/i.test(host)) return "demo";
  if (/figma\.com$/i.test(host)) return "figma";
  if (/linkedin\.com$/i.test(host)) return "linkedin";
  if (/x\.com$|twitter\.com$/i.test(host)) return "x";
  return "website";
}

function normalizeStringList(value) {
  if (Array.isArray(value)) return value.map((item) => limitedString(item, 80)).filter(Boolean);
  return String(value || "")
    .split(/[,;\n]/)
    .map((item) => limitedString(item, 80))
    .filter(Boolean);
}

function joinValues(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return String(value || "");
}

function yamlValue(value) {
  return JSON.stringify(String(value || ""));
}

function yamlArray(value) {
  const items = Array.isArray(value) ? value.filter(Boolean) : normalizeStringList(value);
  return `[${items.map((item) => JSON.stringify(item)).join(", ")}]`;
}

function cleanId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 90);
}

function limitedString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value || 0)));
}

function mean(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  return numbers.length ? numbers.reduce((total, value) => total + value, 0) / numbers.length : 0;
}

function standardDeviation(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (numbers.length <= 1) return 0;
  const avg = mean(numbers);
  return Math.sqrt(mean(numbers.map((value) => (value - avg) ** 2)));
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function actorFromViewer(viewer) {
  return {
    id: viewer?.id || null,
    email: viewer?.email || "",
    role: viewer?.canScore ? "staff" : "partner"
  };
}

function eventId(prefix, material, now) {
  return `${prefix}_${crypto.createHash("sha256").update(`${material}:${now}`).digest("hex").slice(0, 18)}`;
}

function titleCase(value) {
  return String(value || "link").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
