import { YOUNGONE_EXTERNAL_PARTNER_PROFILE } from "../netlify/data/external-partner-profiles/youngone-profile.mjs";
import { collaborationFitMetrics } from "../netlify/lib/collaboration-fit.mjs";
import { loadPartnerDirectory } from "../netlify/lib/program-hub.mjs";

const teams = await loadPartnerDirectory(process.env, fetch);
const metrics = collaborationFitMetrics({
  candidateTeams: teams,
  partnerProfile: YOUNGONE_EXTERNAL_PARTNER_PROFILE
});

if (teams.length !== 76) {
  throw new Error(`Expected 76 eligible teams, received ${teams.length}.`);
}
if (metrics.collaborationFitStatus !== "ready") {
  throw new Error(`Expected ready collaboration metrics, received ${metrics.collaborationFitStatus}.`);
}
if (metrics.collaborationFitCount !== metrics.collaborationFitCompanies.length) {
  throw new Error("Collaboration fit count and company list are inconsistent.");
}
if (!metrics.collaborationFitCompanies.every((company) => company.name && Number.isFinite(company.score))) {
  throw new Error("A collaboration fit company is missing its name or numeric score.");
}

console.log(JSON.stringify({
  evaluatedCompanies: teams.length,
  keywordTaggedCompanies: teams.filter((team) => Array.isArray(team.matchingKeywords) && team.matchingKeywords.length).length,
  collaborationFitCount: metrics.collaborationFitCount,
  companies: metrics.collaborationFitCompanies.map((company) => ({ name: company.name, score: company.score }))
}));
