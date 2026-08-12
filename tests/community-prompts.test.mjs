import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { personalizedCommunityPrompts } from "../public/arena/community-prompts.js";

test("창업팀 프로필로 프리 OT의 회계·마케팅·비개발 위탁 질문을 만든다", () => {
  const prompts = personalizedCommunityPrompts({
    hub: {
      viewer: { role: "member" },
      viewerTeam: {
        name: "테스트AI",
        sector: "SaaS",
        oneLiner: "영업팀의 반복 업무를 자동화하는 AI 에이전트"
      }
    }
  });
  assert.equal(prompts.length, 3);
  assert.deepEqual(prompts.map((item) => item.id), ["preot-finance-ops", "preot-go-to-market", "preot-nondev-outsourcing"]);
  assert.match(prompts[0].label, /회계·재무/);
  assert.match(prompts[0].template, /테스트AI/);
  assert.match(prompts[1].label, /마케팅/);
  assert.match(prompts[1].template, /영업팀의 반복 업무/);
  assert.match(prompts[1].template, /SaaS 고객/);
  assert.match(prompts[2].label, /비개발 업무/);
  assert.match(prompts[2].template, /콘텐츠·B2B 세일즈 운영·고객지원·채용/);
  assert.ok(prompts.every((item) => item.origin === "PRE-OT 공통 수요 · 운영진 질문"));
  assert.ok(prompts.every((item) => item.template.split("\n").length >= 7));
});

test("비개발 위탁 질문은 로그인 기업의 산업 프로필에 맞는 예시를 사용한다", () => {
  const [,, prompt] = personalizedCommunityPrompts({
    hub: {
      viewer: { role: "member" },
      viewerTeam: { name: "메디컬AI", sector: "Healthcare/Medicaltech", oneLiner: "병원용 AI 서비스" }
    }
  });
  assert.match(prompt.hint, /인허가·보험·의료기관 영업·콘텐츠 검수/);
  assert.match(prompt.template, /인허가·보험·의료기관 영업·콘텐츠 검수/);
});

test("기업 파트너는 프로필 우선 과제로 실증·협업 가이드를 받는다", () => {
  const prompts = personalizedCommunityPrompts({
    hub: {
      viewer: { role: "b2b_partner" },
      partnerProfile: {
        organizationName: "영원무역",
        priorities: [
          { rank: 2, title: "에너지·탄소 관리" },
          { rank: 1, title: "글로벌 공장 제조 DX/AX" }
        ]
      }
    }
  });
  assert.deepEqual(prompts.map((item) => item.id), ["partner-ai-experience", "partner-pilot", "partner-collaboration"]);
  assert.match(prompts[1].template, /영원무역/);
  assert.match(prompts[1].template, /글로벌 공장 제조 DX\/AX/);
  assert.match(prompts[2].template, /에너지·탄소 관리/);
});

test("운영진에는 기업 비공개 정보를 요구하지 않는 운영 가이드를 제공한다", () => {
  const prompts = personalizedCommunityPrompts({ hub: { viewer: { role: "admin", canScore: true } } });
  assert.equal(prompts[0].id, "staff-insight");
  assert.match(prompts[0].guide, /비공개 정보는 제외/);
});

test("Community UI는 맞춤 가이드 영역과 동적 프롬프트 목록을 연결한다", () => {
  const html = fs.readFileSync(new URL("../public/arena/index.html", import.meta.url), "utf8");
  const js = fs.readFileSync(new URL("../public/arena/community.js", import.meta.url), "utf8");
  assert.match(html, /id="communityPromptList"/);
  assert.match(html, /id="communityPromptGuide"/);
  assert.match(html, /id="communityPromptKicker"[^>]*>COMMUNITY STARTERS/);
  assert.match(html, /id="communityPromptTitle"[^>]*>대화를 시작할 질문/);
  assert.match(html, /로그인한 프로필을 확인해 맞춤 작성 가이드를 준비합니다\. 실제 게시물이 아닙니다/);
  assert.match(html, /PRE-OT 공통 수요 · 운영진 질문/);
  assert.match(js, /communityPromptProfile\(context\)/);
  assert.match(js, /personalizedCommunityPrompts\(context\)/);
  assert.match(js, /PARTNER CONVERSATION STARTERS/);
  assert.match(js, /협업 수요를 구체화할 질문/);
  assert.match(js, /COMMUNITY OPERATIONS/);
  assert.match(js, /운영진이 대화를 여는 질문/);
  assert.match(js, /PRE-OT NETWORKING NEEDS/);
  assert.match(js, /아직 게시된 글이 아닙니다/);
  assert.match(js, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
});
