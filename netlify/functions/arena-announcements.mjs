import { loadForumEvents } from "../lib/forum-store.mjs";
import { buildForumSnapshot } from "../lib/forum-core.mjs";
import { resolveProgramParticipantViewer } from "../lib/program-hub.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";

export default async function arenaAnnouncements(req, options = {}) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (req.method !== "GET") return json({ error: "지원하지 않는 요청 방식입니다." }, 405);

  try {
    const auth = await (options.verifyRequest || verifyArenaRequest)(req);
    if (!auth.ok) return json({ error: "AI Arena 공지를 확인하려면 로그인이 필요합니다." }, auth.status);
    const viewer = await announcementViewer(
      auth.viewer,
      options.resolveViewer || resolveProgramParticipantViewer,
      options.env || process.env,
      options.fetchImpl || fetch
    );
    if (!viewer?.canScore && !["member", "b2b_partner", "human_validator", "sparklabs", "admin"].includes(viewer?.role)) {
      return json({ error: "승인된 Arena 계정만 공지를 확인할 수 있습니다." }, 403);
    }
    const events = await (options.loadEvents || loadForumEvents)();
    const snapshot = buildForumSnapshot(events, { viewer });
    return json({
      announcements: publicAnnouncements(snapshot.threads),
      generatedAt: snapshot.generatedAt
    });
  } catch (error) {
    return json({ error: error?.message || "AI Arena 공지를 불러오지 못했습니다." }, Number(error?.status) || 500);
  }
}

export function publicAnnouncements(threads = [], limit = 5) {
  const boundedLimit = Math.max(1, Math.min(10, Number(limit || 5)));
  return (Array.isArray(threads) ? threads : [])
    .filter((thread) => thread?.categorySlug === "announcements" && thread?.official)
    .sort((left, right) => Date.parse(right.updatedAt || right.createdAt || 0) - Date.parse(left.updatedAt || left.createdAt || 0))
    .slice(0, boundedLimit)
    .map((thread) => ({
      id: String(thread.id || ""),
      title: String(thread.title || "").slice(0, 120),
      bodyMarkdown: String(thread.bodyMarkdown || "").slice(0, 6000),
      visibility: thread.visibility === "members_only" ? "members_only" : "public",
      authorDisplayName: String(thread.authorDisplayName || "SparkLabs 운영진").slice(0, 80),
      pinned: Boolean(thread.pinned),
      official: true,
      createdAt: thread.createdAt || null,
      updatedAt: thread.updatedAt || thread.createdAt || null
    }))
    .filter((announcement) => announcement.id && announcement.title && announcement.bodyMarkdown);
}

async function announcementViewer(viewer, resolveViewer, env, fetchImpl) {
  if (viewer?.role !== "public") return viewer;
  try {
    return (await resolveViewer(viewer, env, fetchImpl))?.viewer || viewer;
  } catch {
    return viewer;
  }
}

function json(payload, status = 200) {
  return corsResponse(JSON.stringify(payload), status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store"
  });
}

function corsResponse(body, status, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      ...headers
    }
  });
}
