import assert from "node:assert/strict";
import test from "node:test";
import arenaPublic from "../netlify/functions/arena-public.mjs";
import { buildPublicArenaSnapshot } from "../netlify/lib/public-arena.mjs";
import { normalizePublicBrief } from "../netlify/lib/public-brief-store.mjs";

test("public snapshot exposes only published submissions and explicitly consented directory teams", () => {
  const snapshot = buildPublicArenaSnapshot({
    directory: [
      { id: "1", name: "Consented AI", sector: "Enterprise AI", oneLiner: "Safe", websiteUrl: "https://safe.example" },
      { id: "2", name: "Private AI", sector: "Health", oneLiner: "Private", websiteUrl: "https://private.example" }
    ],
    publicTeamIds: ["1"],
    submissions: [
      { id: "published", status: "published", visibility: "public", name: "Published AI", category: "Robotics", links: [] },
      { id: "draft", status: "draft", visibility: "private", name: "Draft AI", category: "Security", links: [] }
    ]
  });
  assert.deepEqual(snapshot.teams.map((team) => team.name).sort(), ["Consented AI", "Published AI"]);
  assert.equal(JSON.stringify(snapshot).includes("Private AI"), false);
  assert.equal(JSON.stringify(snapshot).includes("Draft AI"), false);
  assert.equal(snapshot.metrics.curatedCompanies, 2);
});

test("public snapshot exposes only explicitly public events and confirmed benefits", () => {
  const snapshot = buildPublicArenaSnapshot({
    program: {
      events: [
        {
          id: "open",
          title: "Open Demo Day",
          targetGroup: "Public",
          date: "2026-08-13",
          description: "<b>Booked by</b><br>Kim<br>kim@example.com<br>010-1234-5678<br><b>회사명/서비스명</b><br>Safe AI<p>공개 데모 안내</p>"
        },
        { id: "members", title: "Founder Private Table", targetGroup: "Members", date: "2026-08-14" }
      ],
      benefits: [
        { id: "github", title: "Startup benefit", provider: "GitHub", isActive: true, verificationStatus: "confirmed", visibility: "all_members" },
        { id: "pending", title: "Pending benefit", provider: "Vendor", isActive: true, verificationStatus: "pending", visibility: "all_members" },
        { id: "selected", title: "Selected benefit", provider: "Vendor", isActive: true, verificationStatus: "confirmed", visibility: "selected_teams" }
      ]
    }
  });
  assert.deepEqual(snapshot.events.map((event) => event.id), ["open"]);
  assert.deepEqual(snapshot.benefits.map((benefit) => benefit.id), ["github"]);
  assert.equal(snapshot.events[0].description, "Safe AI\n공개 데모 안내");
  assert.doesNotMatch(snapshot.events[0].description, /Booked by|kim@example\.com|010-1234-5678|<\/?[a-z]/iu);
});

test("public brief requires consent and stores a 90-day review date", () => {
  assert.throws(
    () => normalizePublicBrief({ organization: "Buyer", contactName: "Kim", email: "kim@example.com", problem: "Need AI", successMetric: "Reduce handling time" }),
    /동의/
  );
  const brief = normalizePublicBrief(
    {
      organization: "Buyer",
      contactName: "Kim",
      email: "kim@example.com",
      problem: "Need Korean support automation",
      successMetric: "Reduce handling time by 30%",
      consent: true
    },
    "2026-08-07T00:00:00.000Z"
  );
  assert.equal(brief.introductionPolicy, "double_opt_in");
  assert.equal(brief.retentionReviewAt, "2026-11-05T00:00:00.000Z");
  assert.equal(brief.status, "received");
});

test("anonymous users can submit only a validated public Brief while GET data remains login-gated", async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousAnonKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  try {
    const getResponse = await arenaPublic(new Request("https://example.test/api/arena-public"));
    const postResponse = await arenaPublic(new Request("https://example.test/api/arena-public", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-nf-client-connection-ip": "203.0.113.10"
      },
      body: JSON.stringify({
        organization: "Anonymous Buyer",
        contactName: "Kim",
        email: "kim.public@example.com",
        problem: "Need a governed AI workflow partner",
        successMetric: "Reduce review time by 30%",
        constraints: "Korea-region deployment",
        consent: true
      })
    }));
    assert.equal(getResponse.status, 401);
    const getPayload = await getResponse.json();
    assert.match(getPayload.error, /Login required/i);
    assert.equal(Object.hasOwn(getPayload, "teams"), false);
    assert.equal(Object.hasOwn(getPayload, "events"), false);
    assert.equal(Object.hasOwn(getPayload, "benefits"), false);

    assert.equal(postResponse.status, 202);
    const postPayload = await postResponse.json();
    assert.equal(postPayload.ok, true);
    assert.equal(postPayload.status, "received");
    assert.match(postPayload.id, /^public_brief_/);
    assert.match(postPayload.nextStep, /대상 스타트업이 My Log에서 요청을 승인/);
    assert.equal(Object.hasOwn(postPayload, "email"), false);
    assert.equal(Object.hasOwn(postPayload, "problem"), false);
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousAnonKey === undefined) delete process.env.SUPABASE_ANON_KEY;
    else process.env.SUPABASE_ANON_KEY = previousAnonKey;
  }
});

test("anonymous Brief intake keeps consent, honeypot, and per-client rate-limit safeguards", async () => {
  const previousLimit = process.env.SPARKCLAW_PUBLIC_BRIEF_LIMIT_PER_HOUR;
  process.env.SPARKCLAW_PUBLIC_BRIEF_LIMIT_PER_HOUR = "1";
  const validBrief = {
    organization: "Public Buyer",
    contactName: "Lee",
    email: "lee.public@example.com",
    problem: "Need manufacturing AI",
    successMetric: "Reduce defects by 20%",
    consent: true
  };

  try {
    const missingConsent = await arenaPublic(new Request("https://example.test/api/arena-public", {
      method: "POST",
      headers: { "content-type": "application/json", "x-nf-client-connection-ip": "203.0.113.20" },
      body: JSON.stringify({ ...validBrief, consent: false })
    }));
    assert.equal(missingConsent.status, 400);
    assert.match((await missingConsent.json()).error, /동의/);

    const trapped = await arenaPublic(new Request("https://example.test/api/arena-public", {
      method: "POST",
      headers: { "content-type": "application/json", "x-nf-client-connection-ip": "203.0.113.21" },
      body: JSON.stringify({ ...validBrief, websiteTrap: "bot-filled" })
    }));
    assert.equal(trapped.status, 400);

    const oversized = await arenaPublic(new Request("https://example.test/api/arena-public", {
      method: "POST",
      headers: { "content-type": "application/json", "x-nf-client-connection-ip": "203.0.113.23" },
      body: JSON.stringify({ ...validBrief, problem: "x".repeat(64 * 1024) })
    }));
    assert.equal(oversized.status, 413);
    assert.match((await oversized.json()).error, /64KB/);

    const first = await arenaPublic(new Request("https://example.test/api/arena-public", {
      method: "POST",
      headers: { "content-type": "application/json", "x-nf-client-connection-ip": "203.0.113.22" },
      body: JSON.stringify(validBrief)
    }));
    const limited = await arenaPublic(new Request("https://example.test/api/arena-public", {
      method: "POST",
      headers: { "content-type": "application/json", "x-nf-client-connection-ip": "203.0.113.22" },
      body: JSON.stringify(validBrief)
    }));
    assert.equal(first.status, 202);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.has("retry-after"), true);
  } finally {
    if (previousLimit === undefined) delete process.env.SPARKCLAW_PUBLIC_BRIEF_LIMIT_PER_HOUR;
    else process.env.SPARKCLAW_PUBLIC_BRIEF_LIMIT_PER_HOUR = previousLimit;
  }
});
