import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Clawee discovery exposes a clear accessible loading state", () => {
  const html = readFileSync("public/arena/index.html", "utf8");
  const js = readFileSync("public/arena/community.js", "utf8");
  const css = readFileSync("public/arena/arena.css", "utf8");

  assert.match(html, /id="agenticDiscoverySubmit"[^>]*data-idle-label="Clawee 클로이에게 물어보기 →"/);
  assert.match(html, /id="agenticDiscoveryQuery"[^>]*aria-describedby="agenticDiscoveryKeyboardHint"[^>]*aria-keyshortcuts="Enter"/);
  assert.match(html, /id="agenticDiscoveryKeyboardHint"[^>]*>Enter로 질문하고 Shift\+Enter로 줄바꿈합니다\.<\/span>/);
  assert.match(html, /id="agenticDiscoveryStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(html, /id="claweeDiscoveryFlight"[\s\S]*?clawee-guide-search\.png[\s\S]*?클로이가 찾고 있어요/);
  assert.match(js, /setDiscoveryPending\(true\)/);
  assert.match(js, /setDiscoveryPending\(false\)/);
  assert.match(js, /setAttribute\("aria-busy", String\(pending\)\)/);
  assert.match(js, /pending \? "클로이가 찾는 중…"/);
  assert.match(js, /startProcessStatus\(els\.discoveryStatus, DISCOVERY_PROGRESS_STEPS/);
  assert.match(js, /finishProcessStatus\(els\.discoveryStatus, progressToken/);
  assert.match(js, /launchClaweeDiscoveryGuide\(\)/);
  assert.match(js, /els\.discoveryQuery\?\.addEventListener\("keydown", handleDiscoveryQueryKeydown\)/);
  assert.match(js, /event\.key !== "Enter" \|\| event\.shiftKey \|\| event\.isComposing \|\| event\.keyCode === 229/);
  assert.match(js, /els\.discoveryForm\.requestSubmit\(els\.discoverySubmit\)/);
  assert.match(js, /finishClaweeDiscoveryGuide\("success"\)/);
  assert.match(js, /finishClaweeDiscoveryGuide\("error"\)/);
  assert.match(css, /\.form-status\.process-status\.is-loading/);
  assert.match(css, /button\[type="submit"\]\.is-searching::before/);
  assert.match(css, /@keyframes process-status-spin/);
  assert.match(css, /--process-progress/);
  assert.match(css, /\.clawee-discovery-flight\.is-active/);
  assert.match(css, /@keyframes clawee-discovery-hover/);
  assert.match(css, /prefers-reduced-motion:[\s\S]*?\.clawee-discovery-flight/);
});
