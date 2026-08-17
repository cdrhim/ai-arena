import assert from "node:assert/strict";
import test from "node:test";

import { loadPublicBriefMonitor, normalizePublicBrief, savePublicBrief } from "../netlify/lib/public-brief-store.mjs";

const NOW = "2026-08-07T00:00:00.000Z";
const validInput = Object.freeze({
  organization: "Youngone",
  contactName: "Kim",
  email: "brief.owner@example.com",
  website: "https://example.com/partner#private-fragment",
  problem: "Need governed manufacturing AI",
  successMetric: "Reduce defects by 20%",
  constraints: "Korea-region deployment",
  deadline: "2026-10-31",
  budgetRange: "30m_100m",
  procurementPath: "Pilot review, security review, procurement",
  consent: true
});

test("public Brief consent and identity claims are strict and server-controlled", () => {
  assert.throws(() => normalizePublicBrief({ ...validInput, consent: "true" }, NOW), /동의/);
  assert.throws(() => normalizePublicBrief({ ...validInput, consent: false }, NOW), /동의/);
  assert.throws(() => normalizePublicBrief({ ...validInput, email: "invalid@example" }, NOW), /유효한 이메일/);
  assert.throws(() => normalizePublicBrief({ ...validInput, email: `${"a".repeat(65)}@example.com` }, NOW), /유효한 이메일/);

  const brief = normalizePublicBrief({
    ...validInput,
    id: "client-controlled-id",
    status: "approved",
    source: "trusted_staff",
    userId: "admin",
    role: "sparklabs",
    ipAddress: "127.0.0.1",
    contactVerificationStatus: "verified",
    retentionReviewAt: "2099-01-01T00:00:00.000Z",
    createdAt: "1999-01-01T00:00:00.000Z"
  }, NOW);

  assert.match(brief.id, /^public_brief_/);
  assert.notEqual(brief.id, "client-controlled-id");
  assert.equal(brief.status, "received");
  assert.equal(brief.source, "public_discovery_brief");
  assert.equal(brief.contactVerificationStatus, "self_declared_unverified");
  assert.equal(brief.introductionPolicy, "double_opt_in");
  assert.equal(brief.consentVersion, "public-brief-intake-v1");
  assert.equal(brief.consentAt, NOW);
  assert.equal(brief.retentionReviewAt, "2026-11-05T00:00:00.000Z");
  assert.equal(brief.createdAt, NOW);
  assert.equal("userId" in brief, false);
  assert.equal("role" in brief, false);
  assert.equal("ipAddress" in brief, false);
});

test("authenticated partner profile updates retain a server-bound profile owner", () => {
  const brief = normalizePublicBrief({
    ...validInput,
    requestType: "partner_profile_update",
    partnerProfileId: "youngone-trade",
    ownerUserId: "auth-user-123"
  }, NOW);

  assert.equal(brief.source, "partner_profile_update_request");
  assert.equal(brief.status, "update_requested");
  assert.equal(brief.contactVerificationStatus, "authenticated_partner");
  assert.equal(brief.partnerProfileId, "youngone-trade");
  assert.equal(brief.ownerUserId, "auth-user-123");
});

test("public Brief rejects honeypots, unsafe URLs, invalid dates and unknown enums", () => {
  assert.throws(() => normalizePublicBrief({ ...validInput, companyUrl: "https://bot.example" }, NOW), /Unable to accept/);
  assert.throws(() => normalizePublicBrief({ ...validInput, websiteTrap: { bot: true } }, NOW), /Unable to accept/);
  assert.throws(() => normalizePublicBrief({ ...validInput, website: "javascript:alert(1)" }, NOW), /http 또는 https/);
  assert.throws(() => normalizePublicBrief({ ...validInput, website: "https://user:pass@example.com" }, NOW), /로그인 정보/);
  assert.throws(() => normalizePublicBrief({ ...validInput, deadline: "2026-02-30" }, NOW), /유효한/);
  assert.throws(() => normalizePublicBrief({ ...validInput, budgetRange: "unlimited" }, NOW), /예산 범위/);

  const brief = normalizePublicBrief(validInput, NOW);
  assert.equal(brief.website, "https://example.com/partner");
  assert.equal(brief.deadline, "2026-10-31");
  assert.equal(brief.budgetRange, "30m_100m");
});

test("public Brief enforces field and total payload bounds instead of silently truncating", () => {
  assert.throws(
    () => normalizePublicBrief({ ...validInput, organization: "x".repeat(161) }, NOW),
    (error) => error.status === 400 && /160-character/.test(error.message)
  );
  assert.throws(
    () => normalizePublicBrief({ ...validInput, constraints: ["not", "a", "string"] }, NOW),
    (error) => error.status === 400 && /must be a string/.test(error.message)
  );
  assert.throws(
    () => normalizePublicBrief({ ...validInput, ignoredPadding: "x".repeat(25 * 1024) }, NOW),
    (error) => error.status === 413 && /크기/.test(error.message)
  );
});

test("public Brief persistence retries optimistic conflicts and remains idempotent", async () => {
  const store = memoryStore({ conflictOnce: true });
  const first = await savePublicBrief(validInput, NOW, { store, allowMemoryFallback: false });
  const second = await savePublicBrief(validInput, NOW, { store, allowMemoryFallback: false });

  assert.deepEqual(second, first);
  assert.equal(store.setCalls, 3);
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].id, first.id);
  assert.equal(Object.hasOwn(first, "email"), false);
  assert.equal(Object.hasOwn(first, "problem"), false);
});

test("public Brief monitoring returns only privacy-bounded discovery intake records", async () => {
  const discovery = normalizePublicBrief(validInput, NOW);
  const olderDiscovery = normalizePublicBrief({ ...validInput, email: "older@example.com" }, "2026-08-06T00:00:00.000Z");
  const partnerUpdate = normalizePublicBrief({
    ...validInput,
    requestType: "partner_profile_update",
    partnerProfileId: "youngone-trade",
    ownerUserId: "auth-user-123"
  }, "2026-08-08T00:00:00.000Z");
  const monitor = await loadPublicBriefMonitor({
    store: readStore([partnerUpdate, olderDiscovery, discovery]),
    allowMemoryFallback: false,
    limit: 1
  });

  assert.equal(monitor.available, true);
  assert.equal(monitor.totalCount, 2);
  assert.equal(monitor.items.length, 1);
  assert.deepEqual(monitor.items[0], {
    id: discovery.id,
    organization: "Youngone",
    problemSummary: "Need governed manufacturing AI",
    status: "received",
    createdAt: NOW,
    updatedAt: NOW,
    deadline: "2026-10-31"
  });
  assert.equal(Object.hasOwn(monitor.items[0], "email"), false);
  assert.equal(Object.hasOwn(monitor.items[0], "contactName"), false);
  assert.equal(Object.hasOwn(monitor.items[0], "website"), false);
});

test("public Brief production writes fail closed when durable storage is unavailable", async () => {
  const unavailableStore = {
    async getWithMetadata() {
      throw new Error("blob unavailable");
    },
    async set() {
      throw new Error("blob unavailable");
    }
  };
  await assert.rejects(
    savePublicBrief(validInput, NOW, { store: unavailableStore, allowMemoryFallback: false }),
    (error) => error.status === 503 && /안전하게 저장하지 못했습니다/.test(error.message)
  );
});

function memoryStore({ conflictOnce = false } = {}) {
  let rows = null;
  let version = 0;
  let shouldConflict = conflictOnce;
  return {
    setCalls: 0,
    get rows() {
      return rows || [];
    },
    async getWithMetadata() {
      return { data: structuredClone(rows), etag: version ? `v${version}` : null };
    },
    async set(_key, value, options = {}) {
      this.setCalls += 1;
      if (shouldConflict) {
        shouldConflict = false;
        const error = new Error("conflict");
        error.status = 412;
        throw error;
      }
      if (options.onlyIfNew && version) throw conflict();
      if (options.onlyIfMatch && options.onlyIfMatch !== `v${version}`) throw conflict();
      rows = JSON.parse(value);
      version += 1;
    }
  };
}

function readStore(rows) {
  return {
    async getWithMetadata() {
      return { data: structuredClone(rows), etag: "v1" };
    }
  };
}

function conflict() {
  const error = new Error("conflict");
  error.status = 412;
  return error;
}
