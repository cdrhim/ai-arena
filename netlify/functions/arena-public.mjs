import crypto from "node:crypto";
import { loadArenaSubmissions } from "../lib/supabase-submissions-store.mjs";
import { filterSubmissionsForViewer } from "../lib/arena-submissions.mjs";
import { loadPartnerDirectory, loadProgramHub } from "../lib/program-hub.mjs";
import { loadProgramActionEvents } from "../lib/program-actions-store.mjs";
import { buildProgramActionSnapshot } from "../lib/program-actions.mjs";
import { buildPublicArenaSnapshot } from "../lib/public-arena.mjs";
import { savePublicBrief } from "../lib/public-brief-store.mjs";
import { consumeRateLimit } from "../lib/rate-limit.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";

const PUBLIC_VIEWER = Object.freeze({ role: "public", roleLabel: "Public visitor", canScore: false });
const PUBLIC_CATALOG_PROJECTOR = Object.freeze({ role: "sparklabs", roleLabel: "Public catalog projector", canScore: true });
const MAX_PUBLIC_BRIEF_BODY_BYTES = 64 * 1024;

export default async function arenaPublic(req) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (!['GET', 'POST'].includes(req.method)) return json({ error: "Method not allowed" }, 405);
  try {
    if (req.method === "POST") return await submitBrief(req);

    const auth = await verifyArenaRequest(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    if (!auth.viewer?.canScore && !["member", "b2b_partner", "human_validator"].includes(auth.viewer?.role)) {
      return json({ error: "Approved Arena membership is required." }, 403);
    }
    const [directory, submissions, program] = await Promise.all([
      safeLoad(() => loadPartnerDirectory(process.env, fetch), []),
      safeLoad(() => loadArenaSubmissions(), []),
      loadPublicProgram()
    ]);
    const visibleSubmissions = filterSubmissionsForViewer(submissions, PUBLIC_VIEWER);
    return json(
      buildPublicArenaSnapshot({
        directory,
        submissions: visibleSubmissions,
        program,
        publicTeamIds: splitEnv(process.env.SPARKCLAW_PUBLIC_TEAM_IDS),
        publicEventIds: splitEnv(process.env.SPARKCLAW_PUBLIC_EVENT_IDS)
      }),
      200
    );
  } catch (error) {
    return json({ error: error.message }, error.status || 400, error.headers || {});
  }
}

async function submitBrief(req) {
  const limit = await consumeRateLimit(`public-brief:${clientKey(req)}`, {
    max: process.env.SPARKCLAW_PUBLIC_BRIEF_LIMIT_PER_HOUR || 5,
    windowMs: 60 * 60 * 1000
  });
  if (!limit.allowed) {
    const error = new Error("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
    error.status = 429;
    error.headers = { "retry-after": String(limit.retryAfterSeconds) };
    throw error;
  }
  const payload = await readJson(req, MAX_PUBLIC_BRIEF_BODY_BYTES);
  if (payload.requestType === "partner_profile_update") {
    const auth = await verifyArenaRequest(req);
    if (!auth?.ok) {
      const error = new Error(auth?.error || "로그인한 파트너 계정 확인이 필요합니다.");
      error.status = auth?.status || 401;
      throw error;
    }
    if (auth.viewer?.role !== "b2b_partner" || !auth.viewer?.id || !auth.viewer?.b2bProfileId) {
      const error = new Error("현재 로그인한 기업 파트너 계정만 프로필 업데이트를 요청할 수 있습니다.");
      error.status = 403;
      throw error;
    }
    payload.partnerProfileId = auth.viewer.b2bProfileId;
    payload.ownerUserId = auth.viewer.id;
  }
  const result = await savePublicBrief(payload);
  return json({
    ok: true,
    ...result,
    nextStep: "SparkLabs가 2영업일 내 요청을 검토합니다. 대상 스타트업이 My Log에서 요청을 승인한 경우에만 소개가 진행됩니다."
  }, 202);
}

async function loadPublicProgram() {
  try {
    const [hub, events] = await Promise.all([
      loadProgramHub(PUBLIC_VIEWER, process.env, fetch),
      loadProgramActionEvents()
    ]);
    return buildProgramActionSnapshot(hub, events, PUBLIC_CATALOG_PROJECTOR);
  } catch {
    return { events: [], benefits: [] };
  }
}

async function safeLoad(loader, fallback) {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

async function readJson(req, maxBytes) {
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw payloadTooLargeError();

  if (!req.body) return {};
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw payloadTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

function payloadTooLargeError() {
  const error = new Error("Brief 요청 본문은 64KB 이하여야 합니다.");
  error.status = 413;
  return error;
}

function clientKey(req) {
  const value = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "anonymous";
  return crypto.createHash("sha256").update(value.split(",")[0].trim()).digest("hex").slice(0, 24);
}

function splitEnv(value) {
  return String(value || "").split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
}

function json(payload, status = 200, headers = {}) {
  return corsResponse(JSON.stringify(payload), status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
}

function corsResponse(body, status, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      ...headers
    }
  });
}
