import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readProgramDatabaseTable } from "../netlify/lib/program-database.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "outputs", "company-external-link-sources.json");
const overrides = JSON.parse(
  await readFile(path.join(ROOT, "scripts", "company-logo-overrides.json"), "utf8")
);
const linkOverrides = JSON.parse(
  await readFile(path.join(ROOT, "scripts", "company-external-link-overrides.json"), "utf8")
);
const result = await readProgramDatabaseTable({ table: "teams", limit: 100 }, process.env, fetch);
const teams = result.rows.filter((team) => !isExcluded(team));
const checkedAt = new Date().toISOString();

const collected = [];
for (let index = 0; index < teams.length; index += 6) {
  const group = teams.slice(index, index + 6);
  const items = await Promise.all(group.map((team) => collectForTeam(team, checkedAt)));
  collected.push(...items);
}

await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(
  OUTPUT,
  `${JSON.stringify({ generatedAt: checkedAt, source: "official_company_websites", teams: collected }, null, 2)}\n`,
  "utf8"
);

const linkCount = collected.reduce((sum, team) => sum + team.links.length, 0);
process.stdout.write(`${JSON.stringify({ teams: collected.length, teamsWithLinks: collected.filter((team) => team.links.length).length, links: linkCount, output: OUTPUT })}\n`);

async function collectForTeam(team, verifiedAt) {
  const teamId = String(team.id || "");
  const override = overrides[teamId] || {};
  const websiteUrl = primaryWebsite(override.websiteUrl || team.website_url);
  const submitted = submittedExternalLinks(team.website_url, verifiedAt);
  const curated = curatedExternalLinks(teamId, verifiedAt);
  if (!websiteUrl) {
    const links = mergeLinks(submitted, curated);
    return sourceRecord(team, websiteUrl, links, links.length ? "verified" : "website_missing", verifiedAt);
  }

  try {
    const response = await fetch(websiteUrl, {
      redirect: "follow",
      headers: { "user-agent": "SparkClaw-AI-Arena-LinkVerifier/1.0" },
      signal: AbortSignal.timeout(12_000)
    });
    if (!response.ok) return sourceRecord(team, websiteUrl, [], `website_http_${response.status}`, verifiedAt);
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html")) return sourceRecord(team, websiteUrl, [], "website_not_html", verifiedAt);
    const html = (await response.text()).slice(0, 2_000_000);
    const resolvedWebsiteUrl = response.url || websiteUrl;
    const links = mergeLinks(
      submitted,
      curated,
      externalLinksFromHtml(html, resolvedWebsiteUrl, verifiedAt)
    );
    return sourceRecord(team, resolvedWebsiteUrl, links, links.length ? "verified" : "no_public_links_found", verifiedAt);
  } catch (error) {
    const links = mergeLinks(submitted, curated);
    return sourceRecord(
      team,
      websiteUrl,
      links,
      links.length ? "verified" : `fetch_failed:${safeError(error)}`,
      verifiedAt
    );
  }
}

function externalLinksFromHtml(html, websiteUrl, verifiedAt) {
  const websiteClass = classifyExternalLink(websiteUrl);
  if (websiteClass) {
    return [{
      ...websiteClass,
      sourceUrl: websiteUrl,
      verificationStatus: "submitted_official_link",
      verifiedAt
    }];
  }
  const candidates = [];
  const hrefPattern = /href\s*=\s*["']([^"']+)["']/gi;
  for (const match of String(html || "").matchAll(hrefPattern)) candidates.push(match[1]);
  const sameAsPattern = /"sameAs"\s*:\s*\[([^\]]+)\]/gi;
  for (const group of String(html || "").matchAll(sameAsPattern)) {
    for (const match of group[1].matchAll(/"(https?:\\?\/\\?\/[^"\\]+)"/gi)) candidates.push(match[1]);
  }

  const unique = new Map();
  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate, websiteUrl);
    const classified = classifyExternalLink(normalized);
    if (!classified || unique.has(`${classified.kind}:${classified.url}`)) continue;
    unique.set(`${classified.kind}:${classified.url}`, {
      ...classified,
      sourceUrl: websiteUrl,
      verificationStatus: "official_website_linked",
      verifiedAt
    });
  }
  const values = [...unique.values()];
  const kindCount = values.reduce((counts, link) => {
    counts.set(link.kind, (counts.get(link.kind) || 0) + 1);
    return counts;
  }, new Map());
  return values
    .filter((link) => isStoreKind(link.kind) || kindCount.get(link.kind) === 1)
    .sort((left, right) => linkOrder(left.kind) - linkOrder(right.kind));
}

function submittedExternalLinks(value, verifiedAt) {
  const links = [];
  for (const rawUrl of String(value || "").match(/https?:\/\/[^\s\])}>,]+/gi) || []) {
    const normalized = normalizeCandidate(rawUrl, "https://sparkclaw.invalid/");
    const classified = classifyExternalLink(normalized);
    if (!classified) continue;
    links.push({
      ...classified,
      sourceUrl: normalized,
      verificationStatus: "submitted_program_profile",
      verifiedAt
    });
  }
  return links;
}

function curatedExternalLinks(teamId, verifiedAt) {
  return (Array.isArray(linkOverrides[teamId]) ? linkOverrides[teamId] : [])
    .map((entry) => {
      const normalized = normalizeCandidate(entry.url, "https://sparkclaw.invalid/");
      const classified = classifyExternalLink(normalized);
      if (!classified || classified.kind !== entry.kind) return null;
      return {
        ...classified,
        label: entry.label || classified.label,
        sourceUrl: entry.sourceUrl || normalized,
        verificationStatus: "curated_official_source",
        verifiedAt
      };
    })
    .filter(Boolean);
}

function mergeLinks(...collections) {
  const merged = new Map();
  for (const link of collections.flat()) {
    if (!link?.kind || !link?.url) continue;
    merged.set(`${link.kind}:${link.url}`, link);
  }
  return [...merged.values()].sort((left, right) => linkOrder(left.kind) - linkOrder(right.kind));
}

function normalizeCandidate(value, baseUrl) {
  try {
    const decoded = decodeHtml(String(value || ""))
      .replace(/\\\//g, "/")
      .trim();
    const url = new URL(decoded, baseUrl);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref|source)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return "";
  }
}

function classifyExternalLink(value) {
  if (!value) return null;
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const pathName = url.pathname.replace(/\/+$/, "") || "/";

  if (host === "play.google.com" && /^\/store\/apps\/details$/i.test(pathName) && url.searchParams.get("id")) {
    return { kind: "google_play", label: "Google Play", url: canonicalGooglePlay(url) };
  }
  if ((host === "apps.apple.com" || host === "itunes.apple.com") && /\/app\//i.test(pathName)) {
    return { kind: "apple_app_store", label: "App Store", url: canonicalAppleStore(url) };
  }
  if (host === "instagram.com" && isPublicProfilePath(pathName)) return social("instagram", "Instagram", url);
  if (host === "linkedin.com" && /^\/company\//i.test(pathName)) return social("linkedin", "LinkedIn", url);
  if ((host === "youtube.com" || host === "m.youtube.com") && /^\/(?:@|channel\/|c\/|user\/)/i.test(pathName)) return social("youtube", "YouTube", url);
  if (host === "youtu.be" && pathName !== "/") return social("youtube", "YouTube", url);
  if ((host === "x.com" || host === "twitter.com") && isPublicProfilePath(pathName)) return social("x", "X", url);
  if (host === "facebook.com" && isPublicProfilePath(pathName)) return social("facebook", "Facebook", url);
  if (host === "threads.net" && isPublicProfilePath(pathName)) return social("threads", "Threads", url);
  if (host === "tiktok.com" && /^\/@/i.test(pathName)) return social("tiktok", "TikTok", url);
  if (host === "blog.naver.com" && pathName !== "/") return social("naver_blog", "Naver Blog", url);
  if (host === "pf.kakao.com" && pathName !== "/") return social("kakao_channel", "Kakao Channel", url);
  return null;
}

function social(kind, label, value) {
  const url = new URL(value);
  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  url.search = "";
  return { kind, label, url: url.toString() };
}

function canonicalGooglePlay(value) {
  const url = new URL("https://play.google.com/store/apps/details");
  url.searchParams.set("id", value.searchParams.get("id"));
  return url.toString();
}

function canonicalAppleStore(value) {
  const id = value.pathname.match(/(?:\/id|\/)(\d{7,})(?:\/|$)/i)?.[1];
  if (!id) return value.toString();
  return `https://apps.apple.com/app/id${id}`;
}

function primaryWebsite(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/https?:\/\/.*?(?=https?:\/\/|$)/i);
  const candidate = match?.[0]?.replace(/(?:%20|-\s*)+$/i, "") || raw;
  try {
    const url = new URL(candidate);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function isPublicProfilePath(pathName) {
  return pathName !== "/" && !/^\/(share|sharer|intent|login|home|explore|tr|plugins|dialog)(\/|$)/i.test(pathName);
}

function isStoreKind(kind) {
  return kind === "google_play" || kind === "apple_app_store";
}

function sourceRecord(team, websiteUrl, links, status, checkedAt) {
  return {
    teamId: String(team.id || ""),
    name: String(team.name || team.company_name || "").trim(),
    websiteUrl,
    status,
    checkedAt,
    links
  };
}

function isExcluded(team) {
  return Boolean(team.is_test_account) || /^test$/i.test(String(team.name || team.company_name || "").trim());
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

function linkOrder(kind) {
  return ["google_play", "apple_app_store", "instagram", "linkedin", "youtube", "x", "facebook", "threads", "tiktok", "naver_blog", "kakao_channel"].indexOf(kind);
}

function safeError(error) {
  return String(error?.name || "error").slice(0, 80);
}
