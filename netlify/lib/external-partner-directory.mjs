import { YOUNGONE_EXTERNAL_PARTNER_PROFILE } from "../data/external-partner-profiles/youngone-profile.mjs";

const YOUNGONE_ACCOUNT_EMAILS = new Set(
  ["test@gmail.com", ...(YOUNGONE_EXTERNAL_PARTNER_PROFILE.accountEmails || [])]
    .map(normalizeEmail)
    .filter(Boolean)
);

export function trustedExternalPartnerAccount(userOrEmail) {
  const email = normalizeEmail(typeof userOrEmail === "string" ? userOrEmail : userOrEmail?.email);
  if (!YOUNGONE_ACCOUNT_EMAILS.has(email)) return null;
  return {
    role: "b2b_partner",
    profile: YOUNGONE_EXTERNAL_PARTNER_PROFILE
  };
}

export function clientSafeExternalPartnerProfile(profile) {
  if (!profile) return null;
  return {
    id: text(profile.id),
    organizationName: text(profile.organizationName),
    organizationNameEn: text(profile.organizationNameEn),
    logoUrl: text(profile.logoUrl),
    profileLabel: text(profile.profileLabel),
    entityType: text(profile.entityType),
    classifications: list(profile.classifications),
    focusCategories: list(profile.focusCategories),
    targetStages: list(profile.targetStages),
    preferredRegions: list(profile.preferredRegions),
    thesis: text(profile.thesis),
    priorities: Array.isArray(profile.priorities)
      ? profile.priorities.map((priority) => ({ ...priority })).slice(0, 12)
      : [],
    researchAsOf: text(profile.researchAsOf),
    evidenceNote: text(profile.evidenceNote)
  };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function text(value) {
  return String(value || "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}
