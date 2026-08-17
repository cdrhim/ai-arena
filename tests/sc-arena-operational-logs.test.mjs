import assert from "node:assert/strict";
import test from "node:test";

import {
  developmentLogRecord,
  recordScArenaDevelopmentLog,
  withScArenaDevelopmentLogging
} from "../netlify/lib/sc-arena-operational-logs.mjs";

test("development diagnostics redact credentials, emails and query strings", () => {
  const record = developmentLogRecord({
    source: "program-hub",
    error: new Error("Bearer abc.def user@sparklabs.co.kr failed with sk-secret-value"),
    req: new Request("https://arena.test/api/program-hub?token=secret&email=user@example.com", {
      headers: { "x-nf-request-id": "request-123" }
    }),
    responseStatus: 500,
    durationMs: 37,
    env: { CONTEXT: "production", DEPLOY_ID: "deploy-1" }
  });

  assert.equal(record.httpPath, "/api/program-hub");
  assert.equal(record.requestId, "request-123");
  assert.equal(record.httpStatus, 500);
  assert.equal(record.environment, "production");
  assert.match(record.message, /\[redacted\]/);
  assert.match(record.message, /\[email\]/);
  assert.doesNotMatch(JSON.stringify(record), /abc\.def|user@sparklabs|sk-secret|token=secret/);
});

test("development diagnostics use the service-only RPC payload", async () => {
  let request;
  const result = await recordScArenaDevelopmentLog({
    source: "forum",
    error: new Error("Database unavailable"),
    req: new Request("https://arena.test/api/forum", { method: "POST" }),
    responseStatus: 503
  }, {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: "server-secret",
    CONTEXT: "test"
  }, async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return new Response("42", { status: 200, headers: { "content-type": "application/json" } });
  });

  assert.equal(result.stored, true);
  assert.match(request.url, /rpc\/sc_arena_append_development_log$/);
  assert.equal(request.options.headers.apikey, "server-secret");
  assert.equal(request.body.p_http_path, "/api/forum");
  assert.equal(Object.hasOwn(request.body, "authorization"), false);
});

test("function wrapper records returned 5xx responses without changing them", async () => {
  let writes = 0;
  const wrapped = withScArenaDevelopmentLogging("arena-guide", async () => new Response("failed", { status: 500 }));
  const response = await wrapped(new Request("https://arena.test/api/arena-guide"), {
    env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "secret", CONTEXT: "test" },
    fetchImpl: async () => { writes += 1; return new Response("8", { status: 200 }); }
  });

  assert.equal(response.status, 500);
  assert.equal(writes, 1);
});
