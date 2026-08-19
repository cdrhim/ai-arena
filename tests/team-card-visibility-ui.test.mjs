import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync("public/arena/arena.js", "utf8");
const css = readFileSync("public/arena/arena.css", "utf8");

test("members edit their own card and staff receive an accessible editor for every Directory card", () => {
  assert.match(client, /team\.cardVisibility\?\.canEdit && hub\?\.permissions\?\.canEditTeamCardVisibility/);
  assert.match(client, /내 카드 공개 범위/);
  assert.match(client, /SPARKLABS CARD CONTROL/);
  assert.match(client, /관리자 권한으로 이 팀 카드의 공개 범위를 관리/);
  assert.match(client, /data-team-id="\$\{escapeHtml\(String\(team\.id \|\| ""\)\)\}"/);
  assert.match(client, /연락처·내부 원문은 항상 비공개/);
  assert.match(client, /팀명·산업·현단계는 Directory 식별을 위해 계속 표시/);
  assert.match(client, /TEAM_CARD_VISIBILITY_PROGRESS_STEPS[\s\S]*?Clawee가 선택한 공개 범위/);
  assert.match(client, /showElapsed: true/);
  assert.match(client, /postProgramAction\("updateTeamCardVisibility", \{ teamId, fields \}, \{ signal: controller\.signal \}\)/);
  assert.match(client, /window\.setTimeout\(\(\) => controller\.abort\(\), 30000\)/);
  assert.match(client, /30초 안에 저장 완료를 확인하지 못했습니다/);
  assert.match(client, /다른 회원과 파트너 화면에도 즉시 반영/);
  assert.match(css, /\.team-card-visibility-grid/);
  assert.match(css, /@media \(max-width: 720px\)/);
});
