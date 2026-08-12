import { COMPANY_LOGOS } from "./company-logo-data.js";

export function companyLogoAsset(company = {}) {
  const id = String(company.id || company.teamId || "").trim();
  const logo = COMPANY_LOGOS[id];
  if (!logo?.src) return null;
  return {
    src: String(logo.src),
    websiteHost: String(logo.websiteHost || ""),
    tone: logo.tone === "dark" ? "dark" : "light"
  };
}

export function companyLogoCount() {
  return Object.keys(COMPANY_LOGOS).length;
}
