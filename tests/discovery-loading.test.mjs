import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Spark AI discovery exposes a clear accessible loading state", () => {
  const html = readFileSync("public/arena/index.html", "utf8");
  const js = readFileSync("public/arena/community.js", "utf8");
  const css = readFileSync("public/arena/arena.css", "utf8");

  assert.match(html, /id="agenticDiscoverySubmit"[^>]*data-idle-label="Spark AI에게 묻기 →"/);
  assert.match(html, /id="agenticDiscoveryStatus"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(js, /setDiscoveryPending\(true\)/);
  assert.match(js, /setDiscoveryPending\(false\)/);
  assert.match(js, /setAttribute\("aria-busy", String\(pending\)\)/);
  assert.match(js, /pending \? "찾는 중…"/);
  assert.match(js, /startProcessStatus\(els\.discoveryStatus, DISCOVERY_PROGRESS_STEPS/);
  assert.match(js, /finishProcessStatus\(els\.discoveryStatus, progressToken/);
  assert.match(css, /\.form-status\.process-status\.is-loading/);
  assert.match(css, /button\[type="submit"\]\.is-searching::before/);
  assert.match(css, /@keyframes process-status-spin/);
  assert.match(css, /--process-progress/);
});
