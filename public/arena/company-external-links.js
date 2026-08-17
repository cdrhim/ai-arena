import { COMPANY_EXTERNAL_LINKS } from "./company-external-link-data.js";

const ICONS = Object.freeze({
  google_play: "GP",
  apple_app_store: "A",
  instagram: "IG",
  linkedin: "in",
  youtube: "YT",
  x: "X",
  facebook: "f",
  threads: "@",
  tiktok: "TT",
  naver_blog: "N",
  kakao_channel: "K"
});

export function companyExternalLinks(company = {}) {
  const id = String(company.id || company.teamId || "").trim();
  return (COMPANY_EXTERNAL_LINKS[id] || []).map((link) => ({ ...link }));
}

export function companyExternalLinkCount() {
  return Object.values(COMPANY_EXTERNAL_LINKS).reduce((total, links) => total + links.length, 0);
}

export function companyExternalLinkIcon(kind) {
  return ICONS[String(kind || "")] || "LINK";
}
