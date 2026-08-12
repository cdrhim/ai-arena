import { SPARKCLAW_APPLICANT_STARTUPS } from "./sparkclaw-applicant-seed.mjs";

const applicantStartups = SPARKCLAW_APPLICANT_STARTUPS;

const challengeDefinitions = [
  {
    id: "ai-agent-workflow",
    title: "AI Agent Workflow Challenge",
    sponsor: "SparkLabs",
    category: "Developer / AI Infrastructure",
    status: "Open",
    metric: "Workflow reliability",
    higherIsBetter: true,
    deadline: "2026-08-15",
    prize: "SparkLabs review, validator feedback, and pilot introductions",
    objective:
      "Evaluate agentic AI, LLM infrastructure, automation, and productivity products on reliability, evidence quality, deployment readiness, and operator value.",
    weights: { benchmark: 0.55, pairwise: 0.25, traction: 0.2 },
    entrants: applicantIdsFor(["Developer / AI Infrastructure", "Operations / Productivity", "AI / SaaS"], 8)
  },
  {
    id: "commerce-growth-ops",
    title: "Commerce, Retail, and Growth Ops Challenge",
    sponsor: "B2B Commerce Partner",
    category: "Commerce / Retail",
    status: "Open",
    metric: "Commercial readiness",
    higherIsBetter: true,
    deadline: "2026-09-05",
    prize: "B2B buyer discovery and commerce pilot review",
    objective:
      "Compare commerce, retail, marketing, F&B, and customer-operation products by traction proof, repeatability, and B2B pilot fit.",
    weights: { benchmark: 0.5, pairwise: 0.25, traction: 0.25 },
    entrants: applicantIdsFor(["Commerce / Retail", "Marketing / AdTech", "Food / F&B", "Travel / Hospitality"], 8)
  },
  {
    id: "healthcare-bio-review",
    title: "Healthcare and Bio AI Review",
    sponsor: "Healthcare Review Partner",
    category: "Healthcare / Bio",
    status: "Private",
    metric: "Validation readiness",
    higherIsBetter: true,
    deadline: "2026-10-01",
    prize: "Clinical expert review and human validation nomination",
    objective:
      "Screen healthcare, bio, wellness, and medical workflow products for evidence quality, privacy posture, expert fit, and validation readiness.",
    weights: { benchmark: 0.45, pairwise: 0.15, traction: 0.4 },
    entrants: applicantIdsFor(["Healthcare / Bio", "Beauty / Wellness"], 8)
  },
  {
    id: "creative-media-ai",
    title: "Creative, Media, and Education AI Challenge",
    sponsor: "Creative Tech Ventures",
    category: "Media / Entertainment",
    status: "Open",
    metric: "Creator and learner value",
    higherIsBetter: true,
    deadline: "2026-09-20",
    prize: "Creative-tech partner introductions",
    objective:
      "Assess creative, media, art, education, and research products by user pull, differentiated workflow, content quality, and scalable distribution.",
    weights: { benchmark: 0.45, pairwise: 0.35, traction: 0.2 },
    entrants: applicantIdsFor(["Media / Entertainment", "Creative / Art", "Education / Research"], 8)
  },
  {
    id: "deeptech-industrial",
    title: "Deeptech, Robotics, and Industrial AI Challenge",
    sponsor: "Industrial Innovation Partner",
    category: "Robotics / Mobility",
    status: "Draft",
    metric: "Technical feasibility",
    higherIsBetter: true,
    deadline: "2026-10-25",
    prize: "Technical validator review and industrial pilot scoping",
    objective:
      "Benchmark robotics, manufacturing, logistics, materials, climate, security, and hardware-heavy products on feasibility, pilot evidence, and integration readiness.",
    weights: { benchmark: 0.6, pairwise: 0.15, traction: 0.25 },
    entrants: applicantIdsFor(
      ["Robotics / Mobility", "Manufacturing / Materials", "Logistics / Supply Chain", "Climate / Energy", "Security / Compliance"],
      8
    )
  },
  {
    id: "finance-legal-b2b",
    title: "Finance, Legal, and B2B Trust Challenge",
    sponsor: "B2B Trust Partner",
    category: "Finance / Investment",
    status: "Open",
    metric: "Trust workflow readiness",
    higherIsBetter: true,
    deadline: "2026-10-10",
    prize: "Investor, legal, and finance partner review",
    objective:
      "Rank finance, legal, IP, real-estate, and trust-workflow applicants by domain credibility, data quality, compliance posture, and B2B partner fit.",
    weights: { benchmark: 0.5, pairwise: 0.2, traction: 0.3 },
    entrants: applicantIdsFor(["Finance / Investment", "Legal / IP", "Real Estate / PropTech", "HR / Workforce"], 8)
  }
];

export const ARENA_SEED = {
  startups: applicantStartups,
  challenges: challengeDefinitions,
  benchmarkSubmissions: buildBenchmarkSubmissions(challengeDefinitions),
  pairwiseVotes: buildPairwiseVotes(challengeDefinitions),
  bountyRequests: [],
  connectionProfiles: [
    {
      id: "ai-platform-buyers",
      entityType: "corporate",
      name: "AI Platform and Automation Buyers",
      focusCategories: ["Developer / AI Infrastructure", "Operations / Productivity", "AI / SaaS", "Security / Compliance"],
      targetStages: ["Pre-Seed", "Seed", "Growth", "Research"],
      thesis: "Agentic workflow automation, LLM infrastructure, eval tooling, security, and operator productivity products with credible technical proof.",
      preferredRegions: ["Korea", "Asia", "Global"]
    },
    {
      id: "commerce-growth-buyers",
      entityType: "corporate",
      name: "Commerce and Growth Operators",
      focusCategories: ["Commerce / Retail", "Marketing / AdTech", "Food / F&B", "Travel / Hospitality", "Logistics / Supply Chain"],
      targetStages: ["Pre-Seed", "Seed", "Growth"],
      thesis: "Revenue, inventory, campaign, marketplace, and store-operation products that can create near-term B2B pilots.",
      preferredRegions: ["Korea", "Asia", "Global"]
    },
    {
      id: "healthcare-bio-review-board",
      entityType: "corporate",
      name: "Healthcare and Bio Review Board",
      focusCategories: ["Healthcare / Bio", "Beauty / Wellness"],
      targetStages: ["Research", "Pre-Seed", "Seed", "Growth"],
      thesis: "Healthcare, bio, wellness, clinical workflow, patient-facing, and regulated products requiring careful human validation.",
      preferredRegions: ["Korea", "Asia"]
    },
    {
      id: "creative-education-investors",
      entityType: "investor",
      name: "Creative, Media, and Education Investors",
      focusCategories: ["Media / Entertainment", "Creative / Art", "Education / Research"],
      targetStages: ["Pre-Seed", "Seed", "Growth"],
      thesis: "Creative, content, learning, research, and cultural products with differentiated user pull and AI-native workflows.",
      preferredRegions: ["Korea", "Asia", "Global"]
    },
    {
      id: "industrial-deeptech-partners",
      entityType: "corporate",
      name: "Industrial Deeptech Partners",
      focusCategories: ["Robotics / Mobility", "Manufacturing / Materials", "Climate / Energy", "Security / Compliance", "Logistics / Supply Chain"],
      targetStages: ["Research", "Pre-Seed", "Seed", "Growth"],
      thesis: "Hardware, industrial AI, robotics, materials, climate, and logistics products that need technical diligence and pilot scoping.",
      preferredRegions: ["Korea", "Asia", "Global"]
    },
    {
      id: "finance-legal-trust-partners",
      entityType: "investor",
      name: "Finance, Legal, and Trust Partners",
      focusCategories: ["Finance / Investment", "Legal / IP", "Real Estate / PropTech", "HR / Workforce"],
      targetStages: ["Pre-Seed", "Seed", "Growth"],
      thesis: "Finance, legal, IP, property, hiring, and trust workflow products with domain depth and compliance-aware go-to-market.",
      preferredRegions: ["Korea", "Asia"]
    }
  ],
  connectionRequests: [
    {
      id: "req-seed-commerce-1",
      startupId: firstApplicantIdFor(["Commerce / Retail", "Marketing / AdTech"]),
      intent: "Corporate pilot",
      organization: "Commerce and Growth Operators",
      name: "B2B Program Lead",
      email: "partner@example.com",
      message: "Interested in reviewing commerce and growth-ops applicants for pilot fit.",
      createdAt: "2026-06-26T09:00:00.000Z"
    }
  ]
};

function applicantIdsFor(categories, limit = 6) {
  return applicantStartups
    .filter((startup) => categories.includes(startup.category))
    .sort((left, right) => Number(right.benchmarkScore || 0) - Number(left.benchmarkScore || 0))
    .slice(0, limit)
    .map((startup) => startup.id);
}

function firstApplicantIdFor(categories) {
  return applicantIdsFor(categories, 1)[0] || applicantStartups[0]?.id || "";
}

function buildBenchmarkSubmissions(challenges) {
  return challenges.flatMap((challenge, challengeIndex) =>
    challenge.entrants.slice(0, 5).map((startupId, entrantIndex) => {
      const startup = applicantStartups.find((item) => item.id === startupId);
      return {
        id: `seed-benchmark-${challenge.id}-${entrantIndex + 1}`,
        challengeId: challenge.id,
        startupId,
        score: round1(Math.min(96, Number(startup?.benchmarkScore || 70) - entrantIndex * 1.2 + challengeIndex * 0.4)),
        latencyMs: 520 + challengeIndex * 80 + entrantIndex * 55,
        costPer1k: round2(0.18 + challengeIndex * 0.04 + entrantIndex * 0.015),
        createdAt: `2026-06-${String(26 + Math.min(challengeIndex, 3)).padStart(2, "0")}T0${Math.min(entrantIndex + 1, 9)}:00:00.000Z`
      };
    })
  );
}

function buildPairwiseVotes(challenges) {
  return challenges.flatMap((challenge) => {
    const entrants = challenge.entrants.slice(0, 4);
    if (entrants.length < 2) return [];
    return [
      { challengeId: challenge.id, winnerId: entrants[0], loserId: entrants[1], outcome: "win" },
      entrants[2] ? { challengeId: challenge.id, winnerId: entrants[0], loserId: entrants[2], outcome: "win" } : null,
      entrants[3] ? { challengeId: challenge.id, winnerId: entrants[1], loserId: entrants[3], outcome: "win" } : null
    ].filter(Boolean);
  });
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}
