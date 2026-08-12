import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/arena/index.html", import.meta.url), "utf8");
const arenaJs = await readFile(new URL("../public/arena/arena.js", import.meta.url), "utf8");
const marketJs = await readFile(new URL("../public/arena/market.js", import.meta.url), "utf8");
const arenaCss = await readFile(new URL("../public/arena/arena.css", import.meta.url), "utf8");
const marketCss = await readFile(new URL("../public/arena/market.css", import.meta.url), "utf8");

test("a Claw member can send a collaboration review to another team's My Log", () => {
  assert.match(html, /id="myLogMatches"[\s\S]*?id="myLogMatchList"/);
  assert.doesNotMatch(html, /id="programWorkspaceDetails"|id="collaborationReviewWorkspace"/);
  assert.match(html, /id="collaborationReviewDialog"[\s\S]*?name="targetTeamId"[\s\S]*?name="purpose"/);
  assert.match(arenaJs, /data-collaboration-review-team/);
  assert.match(arenaJs, /runProgramAction\(\s*"createCollaborationReview"/);
  assert.match(html, /My Log로 요청 보내기/);
});

test("the recipient approves or declines inside the matching My Log item", () => {
  assert.match(marketJs, /function myLogMatchItemMarkup/);
  assert.match(marketJs, /data-collaboration-review-status="approved"/);
  assert.match(marketJs, /data-collaboration-review-status="declined"/);
  assert.match(arenaJs, /document\.addEventListener\("click", handleCollaborationReviewResponse\)/);
  assert.match(arenaJs, /runProgramAction\(\s*"respondCollaborationReview"/);
  assert.match(marketJs, /item\.canRespond/);
});

test("SparkLabs staff sees a separate review queue and actor audit log", () => {
  assert.match(marketJs, /programQueues\?\.collaborationReviews/);
  assert.match(marketJs, /programAuditLogs/);
  assert.match(marketJs, /팀 간 협업 검토 Queue/);
  assert.match(marketJs, /요청·승인 활동 로그/);
  assert.match(marketJs, /item\.actorEmail/);
  assert.match(marketJs, /STAFF ONLY/);
});

test("collaboration review UI stays readable in its dialog and responsive My Log item", () => {
  assert.match(arenaCss, /\.collaboration-review-dialog-shell\s*\{[\s\S]*?padding:/);
  assert.match(arenaCss, /\.collaboration-review-form textarea:focus\s*\{[\s\S]*?outline:/);
  assert.match(marketCss, /\.my-log-item-actions button\s*\{[\s\S]*?min-height: 32px/);
  assert.match(marketCss, /@media \(max-width: 640px\)[\s\S]*?\.my-log-item\.has-actions[\s\S]*?grid-template-columns: 1fr/);
});
