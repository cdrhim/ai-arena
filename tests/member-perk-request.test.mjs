import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/arena/index.html", import.meta.url), "utf8");
const communityJs = await readFile(new URL("../public/arena/community.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/arena/arena.css", import.meta.url), "utf8");

test("Claw members request a desired perk instead of being asked to provide one", () => {
  assert.match(html, /class="partner-callout-provider" data-hide-from-claw-member[\s\S]*?Feature a perk/);
  assert.match(html, /id="memberPerkRequestForm"[\s\S]*?data-show-for-claw-member[\s\S]*?우리 팀에 필요한 혜택을 적어주세요\./);
  assert.match(html, /요청 초안 만들기/);
  assert.match(html, /게시 전 내용과 공개 범위를 수정할 수 있습니다\./);
});

test("desired perk input creates a reviewable Community draft without direct posting", () => {
  const functionSource = communityJs.match(/function prepareMemberPerkRequest\(event\) \{[\s\S]*?\nfunction configureCommunitySorts/)?.[0] || "";
  assert.match(functionSource, /원하는 혜택:/);
  assert.match(functionSource, /필요한 이유:/);
  assert.match(functionSource, /예상 사용 방식 또는 팀 규모:/);
  assert.match(functionSource, /threadLinkedLabel\.value = "perk_request"/);
  assert.match(functionSource, /data-go-page="community"/);
  assert.match(functionSource, /invalidateThreadAnalysis/);
  assert.doesNotMatch(functionSource, /fetch\(|createThread\(|analyzeThreadDraft\(/);
});

test("member perk request card remains readable and responsive", () => {
  assert.match(css, /\.member-perk-request\s*\{[\s\S]*?display: grid/);
  assert.match(css, /\.member-perk-request textarea:focus[\s\S]*?box-shadow/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.member-perk-request-actions[\s\S]*?flex-direction: column/);
});

test("perk request drafts are cleared when the signed-in account changes", () => {
  assert.match(communityJs, /const currentViewerKey = viewerKey\(context\.viewer\)/);
  assert.match(communityJs, /function resetForumForViewerChange\(\)[\s\S]*?resetMemberPerkRequest\(\)/);
  assert.match(communityJs, /function resetMemberPerkRequest\(\)[\s\S]*?memberPerkRequestForm\?\.reset\(\)[\s\S]*?setStatus\(els\.memberPerkRequestStatus\)/);
});
