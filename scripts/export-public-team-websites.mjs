import { loadPartnerDirectory } from "../netlify/lib/program-hub.mjs";

const directory = await loadPartnerDirectory();
const safeRows = directory.map((team) => ({
  id: String(team.id || ""),
  name: String(team.name || ""),
  companyName: String(team.companyName || ""),
  websiteUrl: String(team.websiteUrl || "")
}));

process.stdout.write(`${JSON.stringify(safeRows)}\n`);
