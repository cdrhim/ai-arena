import { loadArenaEvents } from "../lib/arena-store.mjs";
import { buildArenaSnapshot } from "../lib/arena-core.mjs";
import { filterSubmissionsForViewer } from "../lib/arena-submissions.mjs";
import { loadArenaSubmissions } from "../lib/supabase-submissions-store.mjs";
import { buildB2BMatchability } from "../lib/b2b-match-ai.mjs";
import { partnerDirectoryCandidates } from "../lib/b2b-match-ai.mjs";
import { productCandidates } from "../lib/b2b-match-ai.mjs";
import {
  externalPartnerProfileForViewer,
  loadExternalPartnerProfiles
} from "../lib/external-partner-profiles.mjs";
import { loadProgramDirectoryContext } from "../lib/program-hub.mjs";
import { consumeRateLimit } from "../lib/rate-limit.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";

async function b2bMatch(req) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (!["GET", "POST"].includes(req.method)) return json({ error: "지원하지 않는 요청 방식입니다." }, 405);

  try {
    const auth = await verifyArenaRequest(req);
    if (!auth.ok) {
      return json(
        { error: auth.status === 401 ? "기업 추천을 이용하려면 로그인이 필요합니다." : "기업 추천 이용 권한을 확인할 수 없습니다." },
        auth.status
      );
    }
    const input = await discoveryInput(req);
    let directory = [];
    let effectiveViewer = auth.viewer;
    let viewerTeamId = null;
    try {
      const programContext = await loadProgramDirectoryContext(auth.viewer, process.env, fetch);
      directory = programContext.directory;
      effectiveViewer = programContext.viewer || auth.viewer;
      viewerTeamId = programContext.viewerTeamId;
    } catch {
      directory = [];
    }
    if (!effectiveViewer?.canScore && !effectiveViewer?.canRequestConnections && effectiveViewer?.role !== "member") {
      return json({ error: "승인된 Arena 멤버, B2B 파트너와 SparkLabs 운영진만 기업 추천을 이용할 수 있습니다." }, 403);
    }
    if (!effectiveViewer?.canScore && !featureEnabled(process.env.SPARKCLAW_ENABLE_B2B_PORTAL)) {
      return json({ error: "현재 기업 추천 기능을 이용할 수 없습니다." }, 403);
    }

    const rateLimit = await consumeRateLimit(
      `b2b-match:${effectiveViewer.id || effectiveViewer.email}`,
      {
        max: process.env.SPARKCLAW_B2B_MATCH_LIMIT_PER_HOUR || 20,
        windowMs: process.env.SPARKCLAW_B2B_MATCH_WINDOW_MS || 60 * 60 * 1000
      }
    );
    if (!rateLimit.allowed) {
      return json(
        {
          error: "기업 추천 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
          resetAt: rateLimit.resetAt
        },
        429,
        { "retry-after": String(rateLimit.retryAfterSeconds) }
      );
    }

    const events = await loadArenaEvents();
    const submissions = await loadArenaSubmissions();
    const snapshot = buildArenaSnapshot(events, new Date().toISOString(), submissions);
    const visibleSnapshot = {
      ...snapshot,
      submissions: filterSubmissionsForViewer(snapshot.submissions || [], effectiveViewer)
    };
    directory = partnerVisibleDirectory(directory, effectiveViewer, process.env)
      .filter((team) => !viewerTeamId || String(team.id) !== viewerTeamId);
    const products = directory.length ? partnerDirectoryCandidates(directory) : undefined;
    const externalProfiles = await loadExternalPartnerProfiles();
    const storedProfile = externalPartnerProfileForViewer(effectiveViewer, externalProfiles);
    const profiles = discoveryProfiles(storedProfile, effectiveViewer, input);
    const result = await buildB2BMatchability(visibleSnapshot, effectiveViewer, {
      products,
      profiles,
      queryMode: Boolean(input.query),
      resultLimit: 12
    });
    return json({
      ok: true,
      accessScope: effectiveViewer.role === "member"
        ? "other_participating_companies"
        : effectiveViewer.role === "b2b_partner" || effectiveViewer.canScore
          ? "all_participating_companies"
          : "authorized",
      partnerProfileId: storedProfile?.id || effectiveViewer.b2bProfileId || null,
      ...result
    });
  } catch (error) {
    const status = Number(error?.status) === 400 ? 400 : 500;
    return json(
      { error: status === 400 ? "요청 내용을 확인해 주세요." : "회사 추천을 불러오지 못했습니다." },
      status
    );
  }
}

export default withScArenaDevelopmentLogging("b2b-match", b2bMatch);

export function partnerVisibleDirectory(directory = [], viewer, env = process.env) {
  const rows = Array.isArray(directory) ? directory : [];
  if (viewer?.canScore || viewer?.role === "member" || viewer?.role === "b2b_partner") return rows;
  return [];
}

export function discoveryProfiles(profile, viewer, input = {}) {
  const query = bounded(input.query, 1200);
  if (!profile && !query) return undefined;
  const priorities = Array.isArray(profile?.priorities)
    ? profile.priorities
        .filter((item) => item?.status !== "inactive")
        .slice(0, 8)
        .map((item) => item.matchingQuery || item.title || item.summary)
        .filter(Boolean)
    : [];
  const baseThesis = bounded(profile?.matchingThesis || profile?.thesis || viewer?.b2bThesis, 900);
  const thesis = [
    query ? `이번 탐색 요청: ${query}` : "",
    priorities.length ? `현재 우선 협업 과제: ${priorities.join(" · ")}` : "",
    baseThesis ? `파트너 프로필 맥락: ${baseThesis}` : ""
  ].filter(Boolean).join("\n");
  return [{
    id: profile?.id || viewer?.b2bProfileId || "agentic-discovery-query",
    name: input.organization || profile?.organizationName || profile?.name || viewer?.organization || "Arena discovery",
    entityType: input.entityType || profile?.entityType || "company",
    focusCategories: profile?.focusCategories || viewer?.b2bFocusCategories || [],
    targetStages: profile?.targetStages || viewer?.b2bTargetStages || [],
    preferredRegions: profile?.preferredRegions || viewer?.b2bPreferredRegions || [],
    thesis: thesis || query,
    isDiscoveryQuery: Boolean(query)
  }];
}

function featureEnabled(value) {
  if (value === undefined || value === null || String(value).trim() === "") return true;
  return ["1", "true", "yes", "on", "enabled"].includes(String(value || "").trim().toLowerCase());
}

async function discoveryInput(req) {
  if (req.method === "GET") {
    const url = new URL(req.url);
    return {
      query: bounded(url.searchParams.get("q"), 1200),
      organization: bounded(url.searchParams.get("organization"), 160),
      entityType: bounded(url.searchParams.get("entityType"), 80)
    };
  }
  const text = await req.text();
  if (!text) return {};
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    const error = new Error("요청 본문은 올바른 JSON 형식이어야 합니다.");
    error.status = 400;
    throw error;
  }
  return {
    query: bounded(payload.query, 1200),
    organization: bounded(payload.organization, 160),
    entityType: bounded(payload.entityType, 80)
  };
}

function bounded(value, max) {
  return String(value || "").trim().slice(0, max);
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
import { withScArenaDevelopmentLogging } from "../lib/sc-arena-operational-logs.mjs";
