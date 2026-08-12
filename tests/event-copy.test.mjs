import assert from "node:assert/strict";
import test from "node:test";

import { plainEventDescription } from "../public/arena/event-copy.js";

test("event descriptions become readable text with list structure and decoded entities", () => {
  const description = [
    "<p>안녕하세요, SparkLabs 배치팀입니다.</p>",
    "<p><strong>Meeting Information</strong></p>",
    "<ol><li>진행 방식: Zoom (온라인)</li><li>소요 시간: 25분 &amp; 질의응답</li></ol>"
  ].join("");

  const plain = plainEventDescription(description);

  assert.match(plain, /^안녕하세요, SparkLabs 배치팀입니다\./u);
  assert.match(plain, /Meeting Information/u);
  assert.match(plain, /• 진행 방식: Zoom \(온라인\)/u);
  assert.match(plain, /• 소요 시간: 25분 & 질의응답/u);
  assert.doesNotMatch(plain, /<\/?(?:p|strong|ol|li)\b/iu);
});

test("booking contacts are removed while the company and event content remain", () => {
  const description = [
    "<b>Booked by</b><br>",
    "박준영<br>",
    "jy.park@callva.ai<br>",
    "(010)97662526<br>",
    "<b>회사명/서비스명</b><br>",
    "주식회사 스토리위버/Callva.AI<br>",
    "<p>현재 상황과 니즈를 확인하는 미팅입니다.</p>",
    "문의: host@example.com / 02-123-4567"
  ].join("");

  const plain = plainEventDescription(description);

  assert.doesNotMatch(plain, /Booked by|박준영|jy\.park@callva\.ai|010|97662526/iu);
  assert.doesNotMatch(plain, /host@example\.com|02-123-4567/iu);
  assert.match(plain, /주식회사 스토리위버\/Callva\.AI/u);
  assert.match(plain, /현재 상황과 니즈를 확인하는 미팅입니다\./u);
});
