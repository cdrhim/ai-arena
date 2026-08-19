import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/arena/index.html", import.meta.url), "utf8");
const communityJs = await readFile(new URL("../public/arena/community.js", import.meta.url), "utf8");
const tutorialJs = await readFile(new URL("../public/arena/arena-guide-tutorial.js", import.meta.url), "utf8");

test("Claw Member 화면에서 희망 Perk 입력란을 제거한다", () => {
  assert.doesNotMatch(html, /memberBenefitSurveyForm|BENEFIT NEEDS|필요한 혜택을 알려주세요|혜택 수요 저장하기/);
  assert.doesNotMatch(tutorialJs, /discover-benefit|memberBenefitSurveyForm|우리 팀에 필요한 혜택을 알려주세요|Claw Member 혜택 수요 입력/);
  assert.match(html, /class="panel partner-callout"[^>]*data-hide-from-claw-member/);
});

test("멤버 화면은 숨겨진 혜택 설문을 조회하거나 제출하지 않는다", () => {
  assert.doesNotMatch(communityJs, /memberBenefitSurvey|submitMemberBenefitSurvey|loadMemberBenefitSurvey/);
  assert.doesNotMatch(communityJs, /fetch\("\/api\/benefit-needs-survey"/);
});
