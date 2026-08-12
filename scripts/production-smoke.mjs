const baseUrl = String(process.env.ARENA_BASE_URL || "https://sparkclaw-arena.netlify.app").replace(/\/$/, "");
const email = process.env.ARENA_TEST_EMAIL;
const password = process.env.ARENA_TEST_PASSWORD;

if (!email || !password) {
  throw new Error("Set ARENA_TEST_EMAIL and ARENA_TEST_PASSWORD for the production smoke check.");
}

const configResponse = await fetch(`${baseUrl}/api/arena-auth`);
const config = await configResponse.json();
const loginResponse = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: {
    apikey: config.supabaseAnonKey,
    "content-type": "application/json"
  },
  body: JSON.stringify({ email, password })
});
const session = await loginResponse.json();
if (!loginResponse.ok) throw new Error(`Production login failed with ${loginResponse.status}.`);

const headers = { Authorization: `Bearer ${session.access_token}` };
const [hubResponse, arenaResponse, pageResponse] = await Promise.all([
  fetch(`${baseUrl}/api/program-hub`, { headers }),
  fetch(`${baseUrl}/api/arena`, { headers }),
  fetch(`${baseUrl}/arena/`)
]);
const hub = await hubResponse.json();
const arena = await arenaResponse.json();
const html = await pageResponse.text();
const stackProfiles = (arena.startups || []).filter((startup) => startup.techStack?.hasDisclosure);
const stackSample = stackProfiles.find((startup) => startup.techStack.groups?.some((group) => group.items?.length));

console.log(
  JSON.stringify({
    login: loginResponse.status,
    hub: hubResponse.status,
    arena: arenaResponse.status,
    page: pageResponse.status,
    role: arena.viewer?.role,
    programTeams: hub.teams?.length,
    collaborationFitCount: hub.metrics?.collaborationFitCount,
    collaborationFitStatus: hub.metrics?.collaborationFitStatus,
    collaborationFitCompanies: Array.isArray(hub.metrics?.collaborationFitCompanies)
      ? hub.metrics.collaborationFitCompanies.map((company) => ({ name: company.name, score: company.score }))
      : [],
    capabilityTeams: arena.startups?.length,
    openBounties: arena.competition?.metrics?.openChallenges,
    bountyRequests: Array.isArray(arena.bountyRequests),
    techStackProfiles: stackProfiles.length,
    stackSample: stackSample
      ? {
          team: stackSample.name,
          groups: stackSample.techStack.groups.map((group) => group.key),
          items: stackSample.techStack.groups.flatMap((group) => group.items).slice(0, 6)
        }
      : null,
    marketUi: html.includes('id="marketTeamGrid"'),
    stackFilterUi: html.includes('id="marketStackFilter"'),
    techPassportUi: html.includes('id="passportForm"'),
    partnershipUi: html.includes('id="bountyBriefForm"')
  })
);
