import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE = "sparkclaw-ai-arena";
const manifest = JSON.parse(
  await readFile(path.join(ROOT, "outputs", "company-external-link-sources.json"), "utf8")
);
const supabaseUrl = required("SUPABASE_URL").replace(/\/$/, "");
const secretKey = required("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY");

let organizations = 0;
let links = 0;
for (const team of manifest.teams) {
  const safeLinks = (team.links || []).map((link, index) => ({
    kind: link.kind,
    label: link.label,
    url: link.url,
    source_url: link.sourceUrl || link.url,
    source_host: hostOf(link.sourceUrl || link.url),
    verification_status: /^curated_/.test(link.verificationStatus || "") ? "curated" : "verified",
    verified_at: link.verifiedAt || team.checkedAt || manifest.generatedAt,
    display_order: index
  }));
  await request(`${supabaseUrl}/rest/v1/rpc/sc_arena_replace_organization_external_links`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      p_workspace_slug: WORKSPACE,
      p_organization_source: "program_team",
      p_organization_key: team.teamId,
      p_organization_name: team.name,
      p_organization_type: "startup",
      p_links: safeLinks
    })
  });
  organizations += 1;
  links += safeLinks.length;
}

console.log(JSON.stringify({ organizations, links }));

async function request(url, options) {
  const headers = {
    apikey: secretKey,
    ...options.headers
  };
  // Supabase's current sb_secret_* keys are opaque API keys rather than JWTs.
  // Keep Authorization only for legacy service-role JWTs.
  if (!String(secretKey).startsWith("sb_secret_")) {
    headers.authorization = `Bearer ${secretKey}`;
  }
  const response = await fetch(url, {
    ...options,
    headers
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`${options.method} ${new URL(url).pathname} failed (${response.status}): ${message.slice(0, 300)}`);
  }
  return response;
}

function required(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  throw new Error(`Missing ${names.join(" or ")}`);
}

function hostOf(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "").slice(0, 255);
  } catch {
    return "";
  }
}
