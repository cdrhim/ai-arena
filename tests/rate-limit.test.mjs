import assert from "node:assert/strict";
import test from "node:test";

import { consumeRateLimit, createMemoryRateLimitStore } from "../netlify/lib/rate-limit.mjs";

test("per-user rate limit allows requests until the configured maximum", async () => {
  const store = createMemoryRateLimitStore();
  const first = await consumeRateLimit("user@example.com", {
    store,
    max: 2,
    windowMs: 60_000,
    now: "2026-06-10T00:00:00.000Z"
  });
  const second = await consumeRateLimit("user@example.com", {
    store,
    max: 2,
    windowMs: 60_000,
    now: "2026-06-10T00:00:10.000Z"
  });
  const third = await consumeRateLimit("user@example.com", {
    store,
    max: 2,
    windowMs: 60_000,
    now: "2026-06-10T00:00:20.000Z"
  });

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.equal(third.retryAfterSeconds, 40);
});

test("rate limit resets after the window", async () => {
  const store = createMemoryRateLimitStore();
  await consumeRateLimit("user@example.com", { store, max: 1, windowMs: 60_000, now: "2026-06-10T00:00:00.000Z" });
  const blocked = await consumeRateLimit("user@example.com", { store, max: 1, windowMs: 60_000, now: "2026-06-10T00:00:10.000Z" });
  const reset = await consumeRateLimit("user@example.com", { store, max: 1, windowMs: 60_000, now: "2026-06-10T00:01:01.000Z" });

  assert.equal(blocked.allowed, false);
  assert.equal(reset.allowed, true);
});
