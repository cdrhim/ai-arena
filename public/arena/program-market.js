const EMPTY_COMPETITION = Object.freeze({
  challenges: [],
  teams: [],
  submissions: [],
  validationReports: [],
  leaderboards: [],
  validationQueue: [],
  opportunities: [],
  metrics: {}
});

export function marketDataFromProgramHub(programHub = null, workflowSnapshot = null) {
  const directoryTeams = Array.isArray(programHub?.memberDirectory)
    ? programHub.memberDirectory
    : programHub?.teams || [];
  const startups = directoryTeams.map((team) => {
    const functions = Array.isArray(team.matchingKeywords)
      ? [...new Set(team.matchingKeywords.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 12)
      : [];
    const websiteUrl = String(team.websiteUrl || "").trim();
    return {
      id: String(team.id || ""),
      name: team.name || team.companyName || "",
      category: team.sector || team.domain || "AI",
      stage: "",
      region: "",
      tagline: team.oneLiner || team.serviceSummary || "",
      description: [team.serviceSummary, team.aiIdeaSummary].filter(Boolean).join(" "),
      serviceSummary: team.serviceSummary || "",
      aiIdeaSummary: team.aiIdeaSummary || "",
      programGroup: team.group || "",
      functions,
      tags: functions,
      products: websiteUrl ? [{ id: `${team.id}-website`, name: team.name, url: websiteUrl }] : [],
      benchmarkScore: 0,
      affiliation: "SparkClaw Program DB",
      traction: "",
      source: "program_directory",
      techStack: {
        source: "not_disclosed",
        sourceLabel: "Program DB 기본 프로필 · 기술 스택 미공개",
        verification: "not_disclosed",
        groups: [],
        itemCount: 0,
        hasDisclosure: false,
        restricted: false
      }
    };
  }).filter((team) => team.id && team.name);

  return {
    startups,
    submissions: [],
    connectionRequests: Array.isArray(workflowSnapshot?.connectionRequests) ? workflowSnapshot.connectionRequests : [],
    bountyRequests: Array.isArray(workflowSnapshot?.bountyRequests) ? workflowSnapshot.bountyRequests : [],
    reviewQueue: [],
    humanValidationQueue: [],
    metrics: {
      ...(workflowSnapshot?.metrics || {}),
      teams: startups.length,
      source: "program_directory",
      directoryScope: programHub?.directoryScope || "all_participating_companies"
    },
    competition: workflowSnapshot?.competition || { ...EMPTY_COMPETITION },
    viewer: programHub?.viewer || null
  };
}
