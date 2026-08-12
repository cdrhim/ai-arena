import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { personalizedCommunityPrompts } from "../public/arena/community-prompts.js";

test("창업팀 프로필로 제품·출시·고객 글쓰기 가이드를 만든다", () => {
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
  assert.match(prompts[0].hint, /테스트AI/);
  assert.match(prompts[1].template, /영업팀의 반복 업무/);
  assert.match(prompts[2].template, /SaaS 고객/);
  assert.ok(prompts.every((item) => item.template.split("\n").length >= 7));
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
  assert.match(js, /personalizedCommunityPrompts\(context\)/);
  assert.match(js, /scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
});
