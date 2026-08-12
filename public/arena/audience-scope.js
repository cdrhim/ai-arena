export const AUDIENCE_SCOPE = Object.freeze({
  public: "public",
  private: "members_only"
});

export const AUDIENCE_SCOPE_COPY = Object.freeze({
  public: Object.freeze({
    label: "Public · SparkClaw 산업 파트너 포함",
    badge: "PUBLIC",
    localizedBadge: "Public · 산업 파트너 포함",
    description: "SparkClaw 부트캠프 멤버, SparkLabs, 승인된 산업 파트너가 확인할 수 있습니다."
  }),
  members_only: Object.freeze({
    label: "Private · 부트캠프 멤버 + SparkLabs",
    badge: "PRIVATE",
    localizedBadge: "Private · 멤버 + SparkLabs",
    description: "SparkClaw 부트캠프 멤버와 SparkLabs만 확인할 수 있습니다. 산업 파트너에게는 표시되지 않습니다."
  })
});

const PUBLIC_AUDIENCE_ROLES = new Set(["member", "b2b_partner", "human_validator", "sparklabs", "admin"]);
const PRIVATE_AUDIENCE_ROLES = new Set(["member", "sparklabs", "admin"]);

export function canonicalAudienceScope(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "partners_only") return AUDIENCE_SCOPE.public;
  if (normalized === AUDIENCE_SCOPE.private) return AUDIENCE_SCOPE.private;
  return AUDIENCE_SCOPE.public;
}

export function audienceScopeOptionsForRole(role) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  const options = [];
  if (PUBLIC_AUDIENCE_ROLES.has(normalizedRole)) options.push(audienceScopeOption(AUDIENCE_SCOPE.public));
  if (PRIVATE_AUDIENCE_ROLES.has(normalizedRole)) options.push(audienceScopeOption(AUDIENCE_SCOPE.private));
  return options;
}

export function canViewAudienceScope(value, role) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  const scope = canonicalAudienceScope(value);
  return scope === AUDIENCE_SCOPE.private
    ? PRIVATE_AUDIENCE_ROLES.has(normalizedRole)
    : PUBLIC_AUDIENCE_ROLES.has(normalizedRole);
}

export function audienceScopeLabel(value, { localized = false } = {}) {
  const scope = canonicalAudienceScope(value);
  const copy = AUDIENCE_SCOPE_COPY[scope];
  return localized ? copy.localizedBadge : copy.badge;
}

function audienceScopeOption(value) {
  return {
    value,
    label: AUDIENCE_SCOPE_COPY[value].label,
    description: AUDIENCE_SCOPE_COPY[value].description
  };
}
