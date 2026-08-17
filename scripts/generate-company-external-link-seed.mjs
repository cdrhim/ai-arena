import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(path.join(ROOT, "outputs", "company-external-link-sources.json"), "utf8")
);
const outputPath = path.join(
  ROOT,
  "supabase",
  "migrations",
  "20260814191000_seed_sc_arena_organization_external_links.sql"
);

const teams = manifest.teams.map((team) => ({
  id: team.teamId,
  name: team.name,
  links: (team.links || []).map((link, index) => ({
    kind: link.kind,
    label: link.label,
    url: link.url,
    source_url: link.sourceUrl || link.url,
    source_host: hostOf(link.sourceUrl || link.url),
    verification_status: /^curated_/.test(link.verificationStatus || "") ? "curated" : "verified",
    verified_at: link.verifiedAt || team.checkedAt || manifest.generatedAt,
    display_order: index
  }))
}));

const payload = JSON.stringify(teams).replaceAll("$seed$", "");
const sql = `-- Verified official social and product-store links collected for current SparkClaw teams.\n\n` +
  `begin;\n\n` +
  `do $sync$\n` +
  `declare\n  v_team jsonb;\nbegin\n` +
  `  for v_team in\n    select value from jsonb_array_elements($seed$${payload}$seed$::jsonb)\n  loop\n` +
  `    perform public.sc_arena_replace_organization_external_links(\n` +
  `      'sparkclaw-ai-arena',\n      'program_team',\n      v_team ->> 'id',\n` +
  `      v_team ->> 'name',\n      'startup',\n      v_team -> 'links'\n    );\n` +
  `  end loop;\nend\n$sync$;\n\ncommit;\n`;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, sql, "utf8");
console.log(JSON.stringify({ outputPath, organizations: teams.length, links: teams.reduce((sum, team) => sum + team.links.length, 0) }));

function hostOf(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "").slice(0, 255);
  } catch {
    return "";
  }
}
