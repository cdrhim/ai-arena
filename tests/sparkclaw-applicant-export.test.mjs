import assert from "node:assert/strict";
import test from "node:test";

import sparkclawApplicantsExport from "../netlify/functions/sparkclaw-applicants-export.mjs";
import {
  loadApplicantExportFile,
  loadApplicantExportMetadata
} from "../netlify/lib/sparkclaw-applicant-export.mjs";

test("applicant export metadata reconciles the official admin counts", async () => {
  const metadata = await loadApplicantExportMetadata();
  assert.equal(metadata.applicationCount, 631);
  assert.equal(metadata.uniqueTeamCount, 628);
  assert.equal(metadata.duplicateApplicationCount, 3);
  assert.deepEqual(metadata.formats.sort(), ["csv", "xlsx"]);
  assert.equal(metadata.access, "sparklabs_staff_only");
});

test("applicant export files are available in CSV and Excel formats", async () => {
  const csv = await loadApplicantExportFile("csv");
  const xlsx = await loadApplicantExportFile("xlsx");
  assert.match(csv.contentType, /^text\/csv/);
  assert.match(csv.body.toString("utf8", 0, 160), /Application ID/);
  assert.match(xlsx.contentType, /spreadsheetml/);
  assert.ok(xlsx.body.byteLength > 100_000);
  await assert.rejects(() => loadApplicantExportFile("json"), /csv and xlsx/);
});

test("applicant export endpoint is staff-only", async () => {
  const previous = captureEnv([
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SPARKLABS_ARENA_ADMIN_DOMAINS"
  ]);
  const originalFetch = global.fetch;
  process.env.SUPABASE_URL = "https://auth.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.SPARKLABS_ARENA_ADMIN_DOMAINS = "sparklabs.co.kr";

  global.fetch = async (url) => {
    if (String(url).includes("/auth/v1/user")) {
      return Response.json({
        id: "member",
        email: "founder@example.com",
        user_metadata: { role: "member" }
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const response = await sparkclawApplicantsExport(
      new Request("https://example.test/api/sparkclaw-applicants-export?format=metadata", {
        headers: { Authorization: "Bearer member-token" }
      })
    );
    const payload = await response.json();
    assert.equal(response.status, 403);
    assert.match(payload.error, /Only SparkLabs staff/);
  } finally {
    global.fetch = originalFetch;
    restoreEnv(previous);
  }
});

test("staff can download the Excel applicant export", async () => {
  const previous = captureEnv([
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SPARKLABS_ARENA_ADMIN_DOMAINS"
  ]);
  const originalFetch = global.fetch;
  process.env.SUPABASE_URL = "https://auth.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  process.env.SPARKLABS_ARENA_ADMIN_DOMAINS = "sparklabs.co.kr";

  global.fetch = async (url) => {
    if (String(url).includes("/auth/v1/user")) {
      return Response.json({ id: "staff", email: "staff@sparklabs.co.kr" });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const response = await sparkclawApplicantsExport(
      new Request("https://example.test/api/sparkclaw-applicants-export?format=xlsx", {
        headers: { Authorization: "Bearer staff-token" }
      })
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /spreadsheetml/);
    assert.match(response.headers.get("content-disposition"), /SparkClaw_full_applicant_list_20260730\.xlsx/);
    assert.ok((await response.arrayBuffer()).byteLength > 100_000);
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
