import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMPANY_LOGOS } from "../public/arena/company-logo-data.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "sc-arena-company-assets";
const WORKSPACE = "sparkclaw-ai-arena";
const manifest = JSON.parse(await readFile(path.join(ROOT, "outputs", "company-logo-sources.json"), "utf8"));
const sourceByTeam = new Map(manifest.teams.map((team) => [String(team.teamId), team]));
const supabaseUrl = required("SUPABASE_URL").replace(/\/$/, "");
const secretKey = required("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY");

let uploaded = 0;
for (const [teamId, logo] of Object.entries(COMPANY_LOGOS)) {
  const source = sourceByTeam.get(teamId);
  if (!source?.name) throw new Error(`Missing source record for ${teamId}`);
  const relativeAsset = String(logo.src || "").replace(/^\/+/, "");
  const localPath = path.join(ROOT, "public", relativeAsset);
  const bytes = await readFile(localPath);
  const fileName = path.basename(localPath);
  const contentType = contentTypeFor(fileName);
  if (bytes.length < 1 || bytes.length > 1_048_576) throw new Error(`Invalid logo size for ${teamId}`);
  const checksum = createHash("sha256").update(bytes).digest("hex");

  await request(`${supabaseUrl}/storage/v1/object/${BUCKET}/${fileName}`, {
    method: "POST",
    headers: {
      "content-type": contentType,
      "x-upsert": "true"
    },
    body: bytes
  });

  await request(`${supabaseUrl}/rest/v1/rpc/sc_arena_upsert_organization_asset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      p_workspace_slug: WORKSPACE,
      p_organization_source: "program_team",
      p_organization_key: teamId,
      p_organization_name: source.name,
      p_organization_type: "startup",
      p_asset_kind: "logo",
      p_storage_bucket: BUCKET,
      p_storage_path: fileName,
      p_source_url: source.sourceUrl || source.websiteUrl || "curated local asset",
      p_source_host: logo.websiteHost || "",
      p_content_type: contentType,
      p_byte_size: bytes.length,
      p_sha256: checksum,
      p_tone: logo.tone === "dark" ? "dark" : "light",
      p_verification_status: /^curated_/.test(source.status || "") ? "curated" : "verified",
      p_verified_at: source.checkedAt || manifest.generatedAt
    })
  });
  uploaded += 1;
}

console.log(JSON.stringify({ bucket: BUCKET, uploaded }));

async function request(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: secretKey,
      authorization: `Bearer ${secretKey}`,
      ...options.headers
    }
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

function contentTypeFor(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".svg") return "image/svg+xml";
  throw new Error(`Unsupported logo format: ${fileName}`);
}
