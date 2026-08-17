import assert from "node:assert/strict";
import test from "node:test";

import { investorTeamProfile, projectPartnerDirectory } from "../netlify/lib/program-hub.mjs";

test("investor profile joins a selected team to its submitted founder and traction evidence", () => {
  const profile = investorTeamProfile({
    id: "team-1",
    name: "비바시티 주식회사/딤섬",
    company_name: "비바시티 주식회사",
    founder: "고성준",
    service_summary: "글로벌 게임 사용자 피드백 자동화 SaaS",
    is_incorporated: true,
    ir_deck_url: "https://example.com/deck.pdf",
    activity_links: [{ url: "https://example.com/proof" }],
    profile_updated_at: "2026-08-11T00:00:00.000Z"
  }, {
    teamSize: 3,
    customerInterviews: 12,
    payingCustomers: 2,
    weeklyReports: 4,
    teamRoles: ["CEO", "CTO"]
  });

  assert.match(profile.teamSummary, /글로벌 게임|피드백|SaaS/i);
  assert.ok(profile.teamSummary.length > 80);
  assert.ok(profile.metrics.some((item) => /\d/.test(item)));
  assert.match(profile.programProof, /팀 3명/);
  assert.match(profile.programProof, /고객 인터뷰 12회/);
  assert.ok(profile.proofPoints.some((item) => item.label === "팀 역할 구성" && /CEO/.test(item.value)));
  assert.ok(profile.proofPoints.some((item) => item.label === "투자 검토 준비도" && /IR 자료 등록/.test(item.value)));
  assert.match(profile.partneringSummary, /실행 근거:/);
  assert.ok(profile.specialtyTasks.length > 1);
  assert.deepEqual(
    profile.specialtyTasks.map((task) => task.rank),
    profile.specialtyTasks.map((_, index) => index + 1)
  );
  assert.match(profile.specialtyTasks[0].label, /딤섬/);
  assert.ok(profile.specialtyTasks[0].description.length >= 30);
  assert.match(profile.specialtyTasks[0].evidence, /\d/);
  assert.doesNotMatch(JSON.stringify(profile), /benchmarkScore|investorInterest|corporateInterest/);
});

test("every projected company receives a distinct evidence-based investor profile without contacts", () => {
  const rows = [
    {
      id: "alpha",
      name: "Agentori",
      founder: "John Ahn",
      company_name: "Agentori",
      sector: "PropTech",
      one_liner: "부동산 업무 자동화",
      service_summary: "부동산 자산 운영 에이전트",
      status: "approved"
    },
    {
      id: "beta",
      name: "비바시티 주식회사/딤섬",
      founder: "고성준",
      company_name: "비바시티 주식회사",
      sector: "Gaming",
      one_liner: "게임 피드백 자동화",
      service_summary: "글로벌 게임 사용자 피드백 자동화 SaaS",
      status: "approved"
    }
  ];
  const activity = new Map([
    ["alpha", { teamSize: 4, teamRoles: ["CEO", "AI Tech Lead"], interviews: 8 }],
    ["beta", { teamSize: 3, teamRoles: ["CEO", "CTO"], interviews: 5 }]
  ]);
  const directory = projectPartnerDirectory(rows, [], activity);

  assert.equal(directory.length, 2);
  assert.ok(directory.every((team) => team.investorProfile?.teamSummary));
  assert.ok(directory.every((team) => team.investorProfile?.partneringSummary));
  assert.ok(directory.every((team) => team.investorProfile?.specialtyTasks?.length));
  assert.notEqual(directory[0].investorProfile.teamSummary, directory[1].investorProfile.teamSummary);
  assert.notEqual(directory[0].investorProfile.specialtyTasks[0].label, directory[1].investorProfile.specialtyTasks[0].label);
  assert.ok(directory.every((team) => !Object.hasOwn(team, "founder") && !Object.hasOwn(team, "email")));
  assert.doesNotMatch(JSON.stringify(directory), /@|010[-.\s]?\d{3,4}[-.\s]?\d{4}/);
});

test("sparse teams stay factual instead of receiving invented career or traction claims", () => {
  const profile = investorTeamProfile({ name: "Sparse Team", service_summary: "문서 업무 자동화" }, {});
  assert.equal(profile.teamSummary, "문서 업무 자동화");
  assert.deepEqual(profile.metrics, []);
  assert.deepEqual(profile.proofPoints, []);
  assert.equal(profile.partneringSummary, "문서 업무 자동화");
  assert.equal(profile.specialtyTasks[0].evidence, "공개 정량 근거 보완 필요");
  assert.equal(profile.sourceLabel, "Program Supabase 팀 프로필");
});

test("quantitative evidence preserves thousands separators and founder credentials do not become a task", () => {
  const profile = investorTeamProfile({ name: "가시안" }, {});
  assert.ok(profile.metrics.some((metric) => /6,000개/.test(metric)));
  assert.doesNotMatch(profile.specialtyTasks[0].description, /창업가|MBA/);
  assert.match(profile.specialtyTasks[0].description, /의료|건강|바이오|진료|환자|헬스케어/);
});
