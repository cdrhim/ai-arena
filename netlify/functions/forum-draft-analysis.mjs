import { analyzeForumDraft } from "../lib/forum-draft-analysis.mjs";
import { forumComposerCategories, forumComposerVisibilities } from "../lib/forum-core.mjs";
import { resolveProgramParticipantViewer } from "../lib/program-hub.mjs";
import { consumeRateLimit } from "../lib/rate-limit.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";

export default async function forumDraftAnalysis(req, options = {}) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (req.method !== "POST") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);

  try {
    const verifyRequest = options.verifyRequest || verifyArenaRequest;
    const auth = await verifyRequest(req);
    if (!auth.ok) return json({ error: "게시글 AI 분석을 이용하려면 로그인해 주세요." }, auth.status);
    const env = options.env || process.env;
    const viewer = await communityViewer(auth.viewer, options.resolveProgramViewer || resolveProgramParticipantViewer, env, options.fetchImpl || fetch);
    if (!viewer?.canScore && !["member", "b2b_partner", "human_validator"].includes(viewer?.role)) {
      return json({ error: "승인된 Arena 회원과 기업 파트너만 게시글 AI 분석을 이용할 수 있습니다." }, 403);
    }

    const rateLimit = await (options.consumeRateLimit || consumeRateLimit)(
      `forum-draft-analysis:${viewer.id || viewer.email}`,
      {
        max: env.SPARKCLAW_FORUM_ANALYSIS_LIMIT_PER_HOUR || 30,
        windowMs: env.SPARKCLAW_FORUM_ANALYSIS_WINDOW_MS || 60 * 60 * 1000
      }
    );
    if (!rateLimit.allowed) {
      return json({ error: "게시글 분석 요청이 많습니다. 잠시 후 다시 시도해 주세요." }, 429, {
        "retry-after": String(rateLimit.retryAfterSeconds)
      });
    }

    const payload = await readJson(req);
    const categories = forumComposerCategories(viewer);
    const visibilities = forumComposerVisibilities(viewer);
    const analysis = await (options.analyzeForumDraft || analyzeForumDraft)(
      { bodyMarkdown: payload.bodyMarkdown, categories, visibilities },
      { env, fetchImpl: options.fetchImpl || fetch }
    );
    return json({ ok: true, analysis });
  } catch (error) {
    const status = Number(error?.status) || 500;
    const message = status < 500
      ? error.message
      : "현재 게시글 설정을 분석하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    return json({ error: message }, status);
  }
}

async function communityViewer(viewer, resolveViewer, env, fetchImpl) {
  if (viewer?.role !== "public") return viewer;
  try {
    return (await resolveViewer(viewer, env, fetchImpl))?.viewer || viewer;
  } catch {
    return viewer;
  }
}

async function readJson(req) {
  const text = await req.text();
  if (text.length > 20_000) throw statusError("게시글 분석 요청이 너무 큽니다.", 413);
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw statusError("요청 본문은 올바른 JSON이어야 합니다.", 400);
  }
}

function statusError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
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
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      ...headers
    }
  });
}
