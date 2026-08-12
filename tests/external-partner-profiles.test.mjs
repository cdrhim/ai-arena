import assert from "node:assert/strict";
import test from "node:test";

import { handleExternalPartnersRequest } from "../netlify/functions/external-partners.mjs";
import {
  externalPartnerProfileForViewer,
  loadExternalPartnerProfiles,
  safeExternalPartnerProfile,
  saveExternalPartnerProfile
} from "../netlify/lib/external-partner-profiles.mjs";

const NOW = "2026-08-07T09:00:00.000Z";

const youngone = {
  id: "youngone-corporation",
  accountEmails: ["test@gmail.com"],
  organizationName: "영원무역",
  organizationNameEn: "Youngone Corporation",
  logoUrl: "/arena/assets/partner-logos/youngone.png",
  profileLabel: "전략적 기업 파트너 · 기업 LP/CVC 연계",
  entityType: "corporate_cvc",
  classifications: ["strategic_enterprise_partner", "corporate_lp"],
  legalEntities: [{ name: "(주)영원무역", nameEn: "Youngone Corporation", role: "운영회사" }],
  focusCategories: ["제조 DX/AX", "AI·공장 자동화"],
  preferredRegions: ["한국", "글로벌"],
  thesis: "글로벌 생산기지에 적용할 제조·공급망 기술을 찾습니다.",
  defaultDiscoveryPrompt: "해외 공장으로 확산할 제조 AI 스타트업을 찾아줘",
  priorities: [{
    rank: 1,
    id: "manufacturing-dx-ax",
    title: "글로벌 공장 제조 DX/AX",
    score: 100,
    confidence: "높음",
    hypothesis: "여러 해외 공장에 재사용할 솔루션 수요가 있습니다.",
    startupCapabilities: ["MES·ERP 연동"],
    validationQuestions: ["첫 실증 공장은 어디인가?"],
    evidenceIds: ["source-1"]
  }],
  discoveryPrompts: [{ label: "제조 DX/AX", prompt: "MES와 연동할 AI 기업을 찾아줘" }],
  evidence: [{ id: "source-1", sourceType: "사업보고서", title: "공식 보고서", publisher: "영원무역", url: "https://example.com/report", claims: ["제조 자동화 추진"] }],
  unknowns: [{ field: "pilotBudget", status: "unknown", question: "예산은?", reason: "비공개" }],
  evidenceNote: "공식 자료 기반 가설입니다.",
  contacts: [{ name: "Private Contact", email: "contact@youngone.example" }],
  internalNotes: "staff only",
  visibility: "restricted_partner_profile",
  researchAsOf: "2026-08-07",
  nextReviewDate: "2026-11-07"
};

test("external partner store merges durable records over seeds without resurrecting seed state", async () => {
  const store = memoryStore([{
    ...youngone,
    status: "paused",
    thesis: "운영진이 갱신한 파트너십 가설",
    updatedAt: "2026-08-08T00:00:00.000Z"
  }]);
  const profiles = await loadExternalPartnerProfiles({
    store,
    seeds: [youngone, { id: "lp-alpha", organizationName: "Alpha LP", entityType: "lp" }]
  });

  assert.equal(profiles.length, 2);
  assert.equal(profiles.find((profile) => profile.id === "youngone-corporation").status, "paused");
  assert.equal(profiles.find((profile) => profile.id === "youngone-corporation").thesis, "운영진이 갱신한 파트너십 가설");
  assert.equal(profiles.find((profile) => profile.id === "lp-alpha").partnerType, "lp");
});

test("profile lookup is deterministic and owner projection does not expose account or staff-only fields", async () => {
  const [profile] = await loadExternalPartnerProfiles({ store: memoryStore(), seeds: [youngone] });
  const found = externalPartnerProfileForViewer({
    id: "user-1",
    email: "TEST@GMAIL.COM",
    role: "b2b_partner"
  }, [profile]);
  const ownerSafe = safeExternalPartnerProfile(found);
  const staffSafe = safeExternalPartnerProfile(found, { audience: "staff" });

  assert.equal(found.id, "youngone-corporation");
  assert.equal(ownerSafe.partnerType, "corporate_cvc");
  assert.equal(ownerSafe.entityType, "corporate");
  assert.equal(ownerSafe.profileLabel, youngone.profileLabel);
  assert.equal(ownerSafe.logoUrl, youngone.logoUrl);
  assert.equal(ownerSafe.priorities[0].startupCapabilities[0], "MES·ERP 연동");
  assert.deepEqual(ownerSafe.evidence[0].claims, ["제조 자동화 추진"]);
  assert.equal(ownerSafe.nextReviewDate, "2026-11-07");
  assert.equal("ownerEmail" in ownerSafe, false);
  assert.equal("ownerEmails" in ownerSafe, false);
  assert.equal("contacts" in ownerSafe, false);
  assert.equal("internalNotes" in ownerSafe, false);
  assert.equal("legalEntities" in ownerSafe, false);
  assert.deepEqual(staffSafe.ownerEmails, ["test@gmail.com"]);
  assert.equal(staffSafe.contacts[0].email, "contact@youngone.example");
  assert.equal(staffSafe.legalEntities[0].name, "(주)영원무역");
});

test("staff upsert persists normalized profiles and rejects ambiguous account ownership", async () => {
  const store = memoryStore();
  const saved = await saveExternalPartnerProfile(youngone, { store, seeds: [], now: NOW });
  assert.equal(saved.ownerEmail, "test@gmail.com");
  assert.equal(saved.status, "active");
  assert.equal(saved.updatedAt, NOW);

  await assert.rejects(
    saveExternalPartnerProfile(
      { id: "another-partner", organizationName: "Another Partner", accountEmails: ["test@gmail.com"] },
      { store, seeds: [], now: "2026-08-07T10:00:00.000Z" }
    ),
    (error) => error.status === 409 && /다른 외부 파트너 프로필/.test(error.message)
  );
});

test("external partner API keeps authorization separate from profile presence", async () => {
  const store = memoryStore();
  const seeds = [youngone, { id: "another-partner", accountEmails: ["other@example.com"], organizationName: "Other Partner" }];
  const sameEmailMember = await requestAs(
    { id: "member-1", email: "test@gmail.com", role: "member", canScore: false },
    "GET",
    { store, seeds }
  );
  assert.equal(sameEmailMember.status, 403);

  const ownerResponse = await requestAs(
    { id: "partner-1", email: "test@gmail.com", role: "b2b_partner", canScore: false },
    "GET",
    { store, seeds }
  );
  const ownerPayload = await ownerResponse.json();
  assert.equal(ownerResponse.status, 200);
  assert.equal(ownerPayload.profile.organizationName, "영원무역");
  assert.equal(JSON.stringify(ownerPayload).includes("Other Partner"), false);
  assert.equal(JSON.stringify(ownerPayload).includes("staff only"), false);
  assert.equal(JSON.stringify(ownerPayload).includes("test@gmail.com"), false);

  const partnerWrite = await requestAs(
    { id: "partner-1", email: "test@gmail.com", role: "b2b_partner", canScore: false },
    "POST",
    { store, seeds },
    { profile: youngone }
  );
  assert.equal(partnerWrite.status, 403);
});

test("staff can list and upsert profiles while destructive methods remain unavailable", async () => {
  const store = memoryStore();
  const staff = { id: "staff-1", email: "ops@sparklabs.co.kr", role: "sparklabs", canScore: true };
  const listResponse = await requestAs(staff, "GET", { store, seeds: [youngone] });
  const listPayload = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal(listPayload.profileCount, 1);
  assert.deepEqual(listPayload.profiles[0].ownerEmails, ["test@gmail.com"]);

  const writeResponse = await requestAs(
    staff,
    "POST",
    { store, seeds: [youngone], now: NOW },
    { profile: { id: "youngone-corporation", organizationName: "영원무역", status: "paused", thesis: "검증 대기" } }
  );
  const writePayload = await writeResponse.json();
  assert.equal(writeResponse.status, 200, JSON.stringify(writePayload));
  assert.equal(writePayload.profile.status, "paused");
  assert.equal(writePayload.profile.ownerEmail, "test@gmail.com");

  const deleteResponse = await requestAs(staff, "DELETE", { store, seeds: [youngone] });
  assert.equal(deleteResponse.status, 405);
});

async function requestAs(viewer, method, options, body) {
  const req = new Request("https://example.test/api/external-partners", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  return handleExternalPartnersRequest(req, {
    ...options,
    verifyRequest: async () => ({ ok: true, viewer })
  });
}

function memoryStore(initial) {
  let data = initial === undefined ? null : structuredClone(initial);
  let version = data === null ? 0 : 1;
  return {
    async get() {
      return structuredClone(data);
    },
    async getWithMetadata() {
      return { data: structuredClone(data), etag: version ? `v${version}` : null };
    },
    async set(_key, value, options = {}) {
      if (options.onlyIfNew && version) throw conflict();
      if (options.onlyIfMatch && options.onlyIfMatch !== `v${version}`) throw conflict();
      data = JSON.parse(value);
      version += 1;
    }
  };
}

function conflict() {
  const error = new Error("write conflict");
  error.status = 412;
  return error;
}
