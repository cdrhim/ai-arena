import assert from "node:assert/strict";
import test from "node:test";

import { appendForumEvent, loadForumEvents } from "../netlify/lib/forum-store.mjs";

const productionEnv = { NETLIFY: "true", NETLIFY_DEV: "false" };

test("forum storage fails closed on production read errors", async () => {
  const store = {
    async get() {
      throw new Error("read unavailable");
    }
  };

  await assert.rejects(
    loadForumEvents({ store, env: productionEnv }),
    (error) => error.status === 503 && /temporarily unavailable/i.test(error.message)
  );
});

test("forum storage fails closed instead of replacing malformed production data", async () => {
  const store = {
    async get() {
      return { events: [] };
    }
  };

  await assert.rejects(
    loadForumEvents({ store, env: productionEnv }),
    (error) => error.status === 503 && /temporarily unavailable/i.test(error.message)
  );
});

test("forum storage fails closed on production write errors", async () => {
  const store = {
    async getWithMetadata() {
      return { data: [], etag: "etag-1" };
    },
    async set() {
      throw new Error("write unavailable");
    }
  };

  await assert.rejects(
    appendForumEvent(forumEvent("event-write-failure"), { store, env: productionEnv }),
    (error) => error.status === 503 && /temporarily unavailable/i.test(error.message)
  );
});

test("forum storage retries conditional conflicts without losing existing events", async () => {
  const competingEvent = forumEvent("event-competing", "2026-08-08T00:00:01.000Z");
  let reads = 0;
  let saved = null;
  const store = {
    async getWithMetadata() {
      reads += 1;
      if (reads === 1) return { data: [], etag: "etag-1" };
      return { data: [competingEvent], etag: "etag-2" };
    },
    async set(_key, value, options) {
      if (options.onlyIfMatch === "etag-1") {
        const error = new Error("conditional write conflict");
        error.status = 412;
        throw error;
      }
      assert.equal(options.onlyIfMatch, "etag-2");
      saved = JSON.parse(value);
    }
  };

  const event = forumEvent("event-request", "2026-08-08T00:00:02.000Z");
  const events = await appendForumEvent(event, { store, env: productionEnv });

  assert.equal(reads, 2);
  assert.deepEqual(events.map((item) => item.id), [event.id, competingEvent.id]);
  assert.deepEqual(saved.map((item) => item.id), [event.id, competingEvent.id]);
});

test("forum storage keeps the memory fallback limited to local development", async () => {
  const store = {
    async getWithMetadata() {
      throw new Error("local blob unavailable");
    }
  };
  const event = forumEvent("event-local-fallback");

  const events = await appendForumEvent(event, {
    store,
    env: { NETLIFY: "true", NETLIFY_DEV: "true" }
  });

  assert.equal(events[0].id, event.id);
});

function forumEvent(id, createdAt = "2026-08-08T00:00:00.000Z") {
  return { id, type: "forum_comment_created", createdAt };
}
