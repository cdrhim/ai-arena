function normalizedProvider(value) {
  return String(value || "").trim().toLowerCase();
}

export function googleIdentityProviders(user) {
  const providers = new Set();
  const add = (value) => {
    const provider = normalizedProvider(value);
    if (provider) providers.add(provider);
  };

  add(user?.app_metadata?.provider);
  (Array.isArray(user?.app_metadata?.providers) ? user.app_metadata.providers : []).forEach(add);
  (Array.isArray(user?.identities) ? user.identities : []).forEach((identity) => add(identity?.provider));
  return providers;
}

export function isAllowedGoogleAdminUser(user, allowedDomains = []) {
  const email = String(user?.email || "").trim().toLowerCase();
  const domain = email.includes("@") ? email.slice(email.lastIndexOf("@") + 1) : "";
  const domains = new Set(
    (Array.isArray(allowedDomains) ? allowedDomains : [])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
  return domains.has(domain) && googleIdentityProviders(user).has("google");
}
