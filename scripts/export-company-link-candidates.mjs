import { readProgramDatabaseTable } from "../netlify/lib/program-database.mjs";

const result = await readProgramDatabaseTable(
  { table: "teams", limit: 100 },
  process.env,
  fetch
);

const teams = result.rows.map((team) => ({
  id: String(team.id || ""),
  name: String(team.name || team.company_name || "").trim(),
  websiteUrl: publicUrl(team.website_url),
  submittedLinks: submittedLinks(team.activity_links)
}));

process.stdout.write(`${JSON.stringify({ count: teams.length, teams }, null, 2)}\n`);

function submittedLinks(value) {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.values(value)
      : [];
  return entries
    .flatMap((entry) => {
      if (typeof entry === "string") return [entry];
      if (!entry || typeof entry !== "object") return [];
      return [entry.url, entry.href, entry.link].filter(Boolean);
    })
    .map(publicUrl)
    .filter(Boolean);
}

function publicUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}
