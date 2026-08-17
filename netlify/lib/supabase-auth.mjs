import { splitList } from "./core.mjs";
import { trustedExternalPartnerAccount } from "./external-partner-directory.mjs";

const SCORE_ACTIONS = new Set(["submitBenchmark", "recordVote"]);
const STAFF_REVIEW_ACTIONS = new Set([
  "requestSubmissionChanges",
  "approveSubmission",
  "publishSubmission",
  "archiveSubmission",
  "markStaffVerified"
]);
const PARTNER_STUDIO_ACTIONS = new Set(["saveSubmissionDraft", "submitSubmissionForReview"]);
const B2B_PARTNER_ACTIONS = new Set(["requestBounty", "requestConnection"]);
const MEMBER_CONNECTION_ACTIONS = new Set(["respondToConnectionRequest"]);
const PARTNERSHIP_STAFF_ACTIONS = new Set(["updateConnectionRequest", "updateBountyRequest"]);
const MEMBER_ROLES = new Set(["member", "approved_member", "submitter", "founder", "startup", "startup_member"]);
const B2B_PARTNER_ROLES = new Set(["b2b_partner", "b2b", "partner", "approved_partner", "corporate_partner", "buyer"]);
const STAFF_ROLES = new Set(["sparklabs", "staff", "spark_staff"]);
const HUMAN_VALIDATOR_ROLES = new Set(["human_validator", "validator", "reviewer", "mentor", "advisor", "technical_expert", "investor_reviewer"]);
const DISABLED_ACTIONS = new Set(["upvoteProduct"]);
const ROLE_METADATA_KEYS = ["arenaRole", "arena_role", "accountRole", "account_role", "accountType", "account_type", "role", "userRole"];
const HUMAN_VALIDATOR_METADATA_KEYS = ["humanValidator", "human_validator", "isHumanValidator", "is_human_validator"];

export function arenaAuthConfig(env = process.env) {
  const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = String(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "");
  const adminDomains = splitList(env.SPARKLABS_ARENA_ADMIN_DOMAINS || "sparklabs.co.kr").map((item) =>
    item.toLowerCase()
  );
  const adminEmails = splitList(env.SPARKLABS_ARENA_ADMIN_EMAILS).map((item) => item.toLowerCase());
  const memberDomains = splitList(env.SPARKLABS_ARENA_MEMBER_DOMAINS).map((item) => item.toLowerCase());
  const memberEmails = splitList(env.SPARKLABS_ARENA_MEMBER_EMAILS).map((item) => item.toLowerCase());
  const b2bPartnerDomains = splitList(env.SPARKLABS_ARENA_B2B_PARTNER_DOMAINS).map((item) => item.toLowerCase());
  const b2bPartnerEmails = splitList(env.SPARKLABS_ARENA_B2B_PARTNER_EMAILS).map((item) => item.toLowerCase());
  const humanValidatorDomains = splitList(env.SPARKLABS_ARENA_HUMAN_VALIDATOR_DOMAINS).map((item) => item.toLowerCase());
  const humanValidatorEmails = splitList(env.SPARKLABS_ARENA_HUMAN_VALIDATOR_EMAILS).map((item) => item.toLowerCase());
  return {
    supabaseUrl,
    anonKey,
    configured: Boolean(supabaseUrl && anonKey),
    adminDomains,
    adminEmails,
    memberDomains,
    memberEmails,
    b2bPartnerDomains,
    b2bPartnerEmails,
    humanValidatorDomains,
    humanValidatorEmails,
    googleAdminLoginEnabled: envFlag(env.SPARKLABS_ARENA_GOOGLE_ADMIN_LOGIN_ENABLED),
    features: {
      arena: envFlag(env.SPARKCLAW_ENABLE_ARENA),
      forum: envFlag(env.SPARKCLAW_ENABLE_FORUM, true),
      b2bPortal: envFlag(env.SPARKCLAW_ENABLE_B2B_PORTAL, true),
      bounties: envFlag(env.SPARKCLAW_ENABLE_BOUNTIES, false),
      publicTechDisclosure: envFlag(env.SPARKCLAW_ENABLE_PUBLIC_TECH_DISCLOSURE)
    }
  };
}

export function publicArenaAuthConfig(env = process.env) {
  const config = arenaAuthConfig(env);
  return {
    authConfigured: config.configured,
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.anonKey,
    adminDomains: config.adminDomains,
    googleAdminLoginEnabled: config.googleAdminLoginEnabled,
    features: config.features
  };
}

export async function verifyArenaRequest(req, env = process.env) {
  const config = arenaAuthConfig(env);
  if (!config.configured) {
    return {
      ok: false,
      status: 503,
      error: "Supabase auth is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY."
    };
  }

  const token = bearerToken(req);
  if (!token) return { ok: false, status: 401, error: "Login required." };

  const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`
    }
  });
  const payload = await safeJson(response);
  if (!response.ok) {
    return { ok: false, status: 401, error: payload?.msg || payload?.error_description || "Invalid login session." };
  }

  return { ok: true, user: payload, viewer: viewerFromUser(payload, config) };
}

export function viewerFromUser(user, config = arenaAuthConfig()) {
  const email = String(user?.email || "").toLowerCase();
  const domain = email.includes("@") ? email.split("@").pop() : "";
  const userMetadata = user?.user_metadata || {};
  const appMetadata = user?.app_metadata || {};
  const metadata = mergedMetadata(user);
  const trustedPartner = trustedExternalPartnerAccount(user);
  const trustedProfile = trustedPartner?.profile || null;
  const requestedRole = trustedPartner?.role || normalizeRole(metadataValue(appMetadata, ROLE_METADATA_KEYS));
  const canAdmin = !trustedPartner && config.adminEmails.includes(email);
  const domainStaff = config.adminDomains.includes(domain);
  const canScore = !trustedPartner && (canAdmin || domainStaff || STAFF_ROLES.has(requestedRole));
  const selectedHumanValidator =
    !trustedPartner &&
    (canScore ||
      HUMAN_VALIDATOR_ROLES.has(requestedRole) ||
      truthyMetadata(metadataValue(appMetadata, HUMAN_VALIDATOR_METADATA_KEYS)) ||
      config.humanValidatorEmails.includes(email) ||
      config.humanValidatorDomains.includes(domain));
  const b2bPartner = !canScore && (Boolean(trustedPartner) || B2B_PARTNER_ROLES.has(requestedRole) || config.b2bPartnerEmails.includes(email) || config.b2bPartnerDomains.includes(domain));
  const member =
    !canScore &&
    !b2bPartner &&
    !selectedHumanValidator &&
    (MEMBER_ROLES.has(requestedRole) || config.memberEmails.includes(email) || config.memberDomains.includes(domain));
  const role = canAdmin ? "admin" : canScore ? "sparklabs" : b2bPartner ? "b2b_partner" : selectedHumanValidator ? "human_validator" : member ? "member" : "public";
  const organization = limitedMetadata(trustedProfile?.organizationName, 120) || limitedMetadata(metadataValue(metadata, ["organization", "company", "companyName", "company_name", "org"]), 120) || organizationFromEmail(email);
  const canSubmitProducts = role === "member";
  const canRequestConnections = role === "b2b_partner";
  const validatorType = normalizeRole(metadataValue(metadata, ["validatorType", "validator_type", "humanValidatorType", "human_validator_type"])) || (canScore ? "staff" : selectedHumanValidator ? "mentor" : "");
  return {
    id: user?.id || null,
    email,
    role,
    roleLabel: roleLabel(role),
    organization,
    b2bProfileId: limitedMetadata(trustedProfile?.id || metadataValue(appMetadata, ["b2bProfileId", "b2b_profile_id", "connectionProfileId", "connection_profile_id"]), 80),
    b2bFocusCategories: trustedProfile ? metadataList(trustedProfile.focusCategories) : metadataList(metadataValue(appMetadata, ["b2bFocusCategories", "b2b_focus_categories", "focusCategories", "focus_categories"])),
    b2bTargetStages: trustedProfile ? metadataList(trustedProfile.targetStages) : metadataList(metadataValue(appMetadata, ["b2bTargetStages", "b2b_target_stages", "targetStages", "target_stages"])),
    b2bPreferredRegions: trustedProfile ? metadataList(trustedProfile.preferredRegions) : metadataList(metadataValue(appMetadata, ["b2bPreferredRegions", "b2b_preferred_regions", "preferredRegions", "preferred_regions"])),
    b2bThesis: limitedMetadata(trustedProfile?.thesis || metadataValue(appMetadata, ["b2bThesis", "b2b_thesis", "partnershipThesis", "partnership_thesis", "thesis"]), 500),
    humanValidatorType: validatorType,
    humanValidatorExpertiseTags: metadataList(metadataValue(metadata, ["expertiseTags", "expertise_tags", "humanValidatorExpertise", "human_validator_expertise"])),
    humanValidatorAllowedCategories: metadataList(metadataValue(metadata, ["allowedCategories", "allowed_categories", "humanValidatorCategories", "human_validator_categories"])),
    humanValidatorStatus: selectedHumanValidator ? "active" : "inactive",
    canAdmin,
    canScore,
    canSubmitProducts,
    canRequestConnections,
    canSubmitHumanReviews: Boolean(selectedHumanValidator),
    canViewPartnerRequests: canScore || role === "member",
    canConnect: canRequestConnections,
    canEnterBounties: Boolean(canScore || config.features?.bounties),
    canViewPartners: canScore || role === "member" || role === "b2b_partner"
  };
}

export function authorizeArenaAction(action, viewer) {
  if (DISABLED_ACTIONS.has(action)) {
    const error = new Error("Peer popularity voting is disabled. Teams are compared with evidence, not social votes.");
    error.status = 410;
    throw error;
  }
  if (SCORE_ACTIONS.has(action) && !viewer?.canScore) {
    const error = new Error("Only SparkLabs users can submit evaluations.");
    error.status = 403;
    throw error;
  }
  if (STAFF_REVIEW_ACTIONS.has(action) && !viewer?.canScore) {
    const error = new Error("Only SparkLabs staff can review, publish, archive, or verify submissions.");
    error.status = 403;
    throw error;
  }
  if (PARTNER_STUDIO_ACTIONS.has(action) && !viewer?.canSubmitProducts) {
    const error = new Error("Only approved members can submit and manage products.");
    error.status = viewer?.email ? 403 : 401;
    throw error;
  }
  if (B2B_PARTNER_ACTIONS.has(action) && !viewer?.canRequestConnections && !viewer?.canScore) {
    const error = new Error("Only B2B partners can request partnership access.");
    error.status = viewer?.email ? 403 : 401;
    throw error;
  }
  if (MEMBER_CONNECTION_ACTIONS.has(action) && viewer?.role !== "member" && !viewer?.canScore) {
    const error = new Error("Only the requested member company can respond to an introduction request.");
    error.status = viewer?.email ? 403 : 401;
    throw error;
  }
  if (PARTNERSHIP_STAFF_ACTIONS.has(action) && !viewer?.canScore) {
    const error = new Error("Only SparkLabs staff can update partnership stages.");
    error.status = viewer?.email ? 403 : 401;
    throw error;
  }
}

export function bearerToken(req) {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function mergedMetadata(user) {
  return {
    ...(user?.user_metadata || {}),
    ...(user?.app_metadata || {})
  };
}

function metadataValue(metadata, keys) {
  for (const key of keys) {
    if (metadata?.[key] !== undefined && metadata?.[key] !== null && metadata?.[key] !== "") return metadata[key];
  }
  return "";
}

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function metadataList(value) {
  return splitList(value).slice(0, 8).map((item) => limitedMetadata(item, 80)).filter(Boolean);
}

function limitedMetadata(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function organizationFromEmail(email) {
  if (!email.includes("@")) return "";
  const domain = email.split("@").pop().split(".")[0] || "";
  return domain ? titleCase(domain.replace(/[-_]+/g, " ")) : "";
}

function roleLabel(role) {
  if (role === "admin") return "SparkLabs admin";
  if (role === "sparklabs") return "SparkLabs staff";
  if (role === "b2b_partner") return "B2B partner";
  if (role === "human_validator") return "Human validator";
  if (role === "member") return "Approved member";
  return "Public";
}

function truthyMetadata(value) {
  return ["1", "true", "yes", "active", "approved"].includes(String(value || "").trim().toLowerCase());
}

function titleCase(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1).toLowerCase())
    .join(" ");
}

function envFlag(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return ["1", "true", "yes", "on", "enabled"].includes(String(value || "").trim().toLowerCase());
}
