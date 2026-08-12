import assert from "node:assert/strict";
import test from "node:test";

import programDatabase from "../netlify/functions/program-database.mjs";
import {
  assertProgramDatabaseAccess,
  loadProgramDatabaseSchema,
  programDatabaseConfig,
  readProgramDatabaseTable
} from "../netlify/lib/program-database.mjs";

test("program database config accepts a Supabase REST URL and keeps keys server-side", () => {
  const config = programDatabaseConfig({
    SPARKCLAW_PROGRAM_DATA_API_URL: "https://program.supabase.co/rest/v1/",
    SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY: "server-secret",
    SPARKCLAW_PROGRAM_DB_MAX_LIMIT: "250"
  });

  assert.equal(config.supabaseUrl, "https://program.supabase.co");
  assert.equal(config.restUrl, "https://program.supabase.co/rest/v1");
  assert.equal(config.key, "server-secret");
  assert.equal(config.maxLimit, 100);
  assert.equal(config.configured, true);
});

test("program database schema reads OpenAPI table metadata", async () => {
  const schema = await loadProgramDatabaseSchema(
    {
      SPARKCLAW_PROGRAM_SUPABASE_URL: "https://program.supabase.co",
      SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY: "server-secret"
    },
    async (url, options) => {
      assert.equal(String(url), "https://program.supabase.co/rest/v1/");
      assert.equal(options.headers.apikey, "server-secret");
      assert.equal(options.headers.Accept, "application/openapi+json");
      assert.match(options.headers["user-agent"], /sparkclaw-program-database-reader/);
      return Response.json({
        definitions: {
          teams: {
            required: ["id"],
            properties: {
              id: { type: "integer" },
              name: { type: "string" },
              created_at: { format: "timestamp with time zone" }
            }
          }
        }
      });
    }
  );

  assert.deepEqual(schema.tables, [
    {
      name: "teams",
      columns: [
        { name: "id", type: "integer" },
        { name: "name", type: "string" },
        { name: "created_at", type: "timestamp with time zone" }
      ],
      required: ["id"]
    }
  ]);
});

test("program database table reads rows through GET with limit and offset", async () => {
  const result = await readProgramDatabaseTable(
    {
      schema: {
        tables: [{ name: "teams", columns: [{ name: "id", type: "integer" }, { name: "name", type: "string" }] }]
      },
      table: "teams",
      limit: 2,
      offset: 4
    },
    {
      SPARKCLAW_PROGRAM_SUPABASE_URL: "https://program.supabase.co",
      SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY: "server-secret"
    },
    async (url, options) => {
      assert.equal(String(url), "https://program.supabase.co/rest/v1/teams?select=*&limit=2&offset=4");
      assert.equal(options.headers.Prefer, "count=exact");
      return Response.json([{ id: 5, name: "SparkClaw" }], { headers: { "content-range": "4-4/12" } });
    }
  );

  assert.equal(result.totalCount, 12);
  assert.deepEqual(result.rows, [{ id: 5, name: "SparkClaw" }]);
});

test("program database access is staff-only and optionally allowlisted", () => {
  assert.throws(() => assertProgramDatabaseAccess({ email: "founder@example.com", canScore: false }), /Only SparkLabs staff/);
  assert.doesNotThrow(() => assertProgramDatabaseAccess({ email: "staff@sparklabs.co.kr", canScore: true }));
  assert.throws(
    () =>
      assertProgramDatabaseAccess(
        { email: "staff@sparklabs.co.kr", canScore: true },
        { SPARKCLAW_PROGRAM_DB_ALLOWED_EMAILS: "owner@sparklabs.co.kr" }
      ),
    /not allowlisted/
  );
});

test("program database function denies non-staff users before reading the Program database", async () => {
  const previous = captureEnv([
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SPARKCLAW_PROGRAM_SUPABASE_URL",
    "SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY"
  ]);
  const originalFetch = global.fetch;
  process.env.SUPABASE_URL = "https://auth.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.SPARKCLAW_PROGRAM_SUPABASE_URL = "https://program.supabase.co";
  process.env.SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY = "server-secret";
  let programReadAttempts = 0;

  global.fetch = async (url) => {
    if (String(url).includes("/auth/v1/user")) {
      return Response.json({ id: "member", email: "founder@example.com", user_metadata: { role: "member" } });
    }
    programReadAttempts += 1;
    return Response.json({});
  };

  try {
    const response = await programDatabase(
      new Request("https://example.test/api/program-database", {
        headers: { Authorization: "Bearer member-token" }
      })
    );
    const payload = await response.json();
    assert.equal(response.status, 403);
    assert.match(payload.error, /Only SparkLabs staff/);
    assert.equal(programReadAttempts, 0);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(previous);
  }
});

test("program database function returns staff table rows", async () => {
  const previous = captureEnv([
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SPARKCLAW_PROGRAM_SUPABASE_URL",
    "SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY",
    "SPARKLABS_ARENA_ADMIN_DOMAINS"
  ]);
  const originalFetch = global.fetch;
  process.env.SUPABASE_URL = "https://auth.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.SPARKCLAW_PROGRAM_SUPABASE_URL = "https://program.supabase.co";
  process.env.SPARKCLAW_PROGRAM_SUPABASE_SECRET_KEY = "server-secret";
  process.env.SPARKLABS_ARENA_ADMIN_DOMAINS = "sparklabs.co.kr";

  global.fetch = async (url) => {
    const href = String(url);
    if (href.includes("/auth/v1/user")) {
      return Response.json({ id: "staff", email: "staff@sparklabs.co.kr" });
    }
    if (href === "https://program.supabase.co/rest/v1/") {
      return Response.json({
        definitions: {
          teams: { properties: { id: { type: "integer" }, name: { type: "string" } } }
        }
      });
    }
    if (href === "https://program.supabase.co/rest/v1/teams?select=*&limit=1&offset=0") {
      return Response.json([{ id: 1, name: "SparkClaw" }], { headers: { "content-range": "0-0/1" } });
    }
    throw new Error(`Unexpected fetch: ${href}`);
  };

  try {
    const response = await programDatabase(
      new Request("https://example.test/api/program-database?table=teams&limit=1", {
        headers: { Authorization: "Bearer staff-token" }
      })
    );
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.selectedTable.name, "teams");
    assert.equal(payload.totalCount, 1);
    assert.deepEqual(payload.rows, [{ id: 1, name: "SparkClaw" }]);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(previous);
  }
});

function captureEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
