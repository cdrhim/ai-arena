import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/arena/index.html", import.meta.url), "utf8");
const communityJs = await readFile(new URL("../public/arena/community.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/arena/arena.css", import.meta.url), "utf8");

test("Claw members get a private three-field benefit request", () => {
  assert.match(html, /id="memberBenefitSurveyForm"[\s\S]*?data-show-for-claw-member[\s\S]*?BENEFIT NEEDS/);
  assert.match(html, /<h2>필요한 혜택을 알려주세요\.<\/h2>/);
  assert.match(html, /for="memberBenefitSurveyName"[\s\S]*?필요한 솔루션 명[\s\S]*?name="solutionName"/);
  assert.match(html, /for="memberBenefitSurveyDetails"[\s\S]*?솔루션 세부 내용[\s\S]*?name="solutionDetails"/);
  assert.match(html, /for="memberBenefitSurveyReason"[\s\S]*?필요한 이유[\s\S]*?name="solutionReason"/);
  assert.match(html, /혜택 수요 저장하기/);
  assert.match(html, /입력 내용은 비공개로 저장되며 SparkLabs 운영진만 검토합니다/);
  assert.doesNotMatch(html, /name="benefitCategory"|member-benefit-survey-categories|name="neededBy"/);
});

test("benefit request submits all three fields without navigating to Community", () => {
  const source = communityJs.match(/async function submitMemberBenefitSurvey\(event\) \{[\s\S]*?\nasync function loadMemberBenefitSurvey/)?.[0] || "";
  assert.match(source, /fetch\("\/api\/benefit-needs-survey"/);
  assert.match(source, /JSON\.stringify\(\{ solutionName, solutionDetails, solutionReason \}\)/);
  assert.match(source, /필요한 솔루션 명을 2자 이상/);
  assert.match(source, /솔루션 세부 내용을 10자 이상/);
  assert.match(source, /필요한 이유를 10자 이상/);
  assert.doesNotMatch(source, /benefitCategory|neededBy|data-go-page="community"/);
});

test("saved benefit revisions restore all three fields and reset safely", () => {
  assert.match(communityJs, /async function loadMemberBenefitSurvey\(\)[\s\S]*?fetch\("\/api\/benefit-needs-survey"/);
  assert.match(communityJs, /function applyMemberBenefitSurvey\(survey\)[\s\S]*?memberBenefitSurveyName\.value = survey\.solutionName[\s\S]*?memberBenefitSurveyDetails\.value = survey\.solutionDetails[\s\S]*?memberBenefitSurveyReason\.value = survey\.solutionReason/);
  assert.match(communityJs, /function resetForumForViewerChange\(\)[\s\S]*?resetMemberBenefitSurvey\(\)/);
  assert.match(communityJs, /function resetMemberBenefitSurvey\(\)[\s\S]*?memberBenefitSurveyForm\?\.reset\(\)/);
});

test("three benefit fields use the available width and collapse ergonomically", () => {
  assert.match(css, /Compact three-field benefit request/);
  assert.match(css, /\.member-benefit-survey\s*\{[\s\S]*?grid-template-columns: minmax\(260px, 0\.54fr\) minmax\(700px, 1\.46fr\)/);
  assert.match(css, /\.member-benefit-survey-response\s*\{[\s\S]*?grid-template-columns: minmax\(180px, 0\.65fr\) repeat\(2, minmax\(230px, 1fr\)\)/);
  assert.match(css, /\.member-benefit-survey input\s*\{[\s\S]*?height: 54px/);
  assert.match(css, /\.member-benefit-survey textarea\s*\{[\s\S]*?height: 82px;[\s\S]*?min-height: 82px/);
  assert.match(css, /\.member-benefit-survey-actions \.secondary-button\.compact\s*\{[\s\S]*?white-space: nowrap/);
  assert.match(css, /@media \(max-width: 1120px\)[\s\S]*?\.member-benefit-survey\s*\{[\s\S]*?grid-template-columns: 1fr/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.member-benefit-survey-reason\s*\{[\s\S]*?grid-column: 1 \/ -1/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.member-benefit-survey-response\s*\{[\s\S]*?grid-template-columns: 1fr/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.member-benefit-survey-actions[\s\S]*?flex-direction: column/);
});
