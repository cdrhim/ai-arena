import {
  externalPartnerProfileForViewer,
  loadExternalPartnerProfiles,
  safeExternalPartnerProfile,
  saveExternalPartnerProfile
} from "../lib/external-partner-profiles.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";

const MAX_BODY_BYTES = 128 * 1024;

function externalPartners(req) {
  return handleExternalPartnersRequest(req);
}

export default withScArenaDevelopmentLogging("external-partners", externalPartners);

export async function handleExternalPartnersRequest(req, options = {}) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (!["GET", "POST"].includes(req.method)) return json({ error: "지원하지 않는 요청 방식입니다." }, 405);

  const verifyRequest = options.verifyRequest || verifyArenaRequest;
  const storeOptions = {
    ...(options.store ? { store: options.store } : {}),
    ...(options.seeds !== undefined ? { seeds: options.seeds } : {})
  };

  try {
    const auth = await verifyRequest(req);
    if (!auth?.ok) {
      return json(
        { error: auth?.status === 401 ? "외부 파트너 프로필을 확인하려면 로그인이 필요합니다." : auth?.error || "계정 권한을 확인할 수 없습니다." },
        auth?.status || 401
      );
    }

    const viewer = auth.viewer || {};
    const staff = Boolean(viewer.canScore);
    const b2bPartner = viewer.role === "b2b_partner";
    if (!staff && !b2bPartner) {
      return json({ error: "외부 파트너 프로필은 승인된 기업 파트너와 SparkLabs 운영진만 확인할 수 있습니다." }, 403);
    }

    if (req.method === "GET") {
      const profiles = await loadExternalPartnerProfiles(storeOptions);
      if (staff) {
        return json({
          ok: true,
          accessScope: "staff",
          profiles: profiles.map((profile) => safeExternalPartnerProfile(profile, { audience: "staff" })),
          profileCount: profiles.length
        });
      }

      const ownProfile = externalPartnerProfileForViewer(viewer, profiles);
      if (!ownProfile || ownProfile.status === "archived" || ownProfile.visibility === "staff_private") {
        return json({ ok: true, accessScope: "owner", profile: null });
      }
      return json({
        ok: true,
        accessScope: "owner",
        profile: safeExternalPartnerProfile(ownProfile, { audience: "owner" })
      });
    }

    if (!staff) {
      return json({ error: "외부 파트너 프로필 저장은 SparkLabs 운영진만 할 수 있습니다." }, 403);
    }
    const payload = await readJson(req);
    const profile = await saveExternalPartnerProfile(payload.profile || payload, {
      ...storeOptions,
      now: options.now
    });
    return json({
      ok: true,
      accessScope: "staff",
      profile: safeExternalPartnerProfile(profile, { audience: "staff" })
    });
  } catch (error) {
    const status = Number(error?.status);
    return json(
      { error: status >= 400 && status < 500 ? error.message : "외부 파트너 프로필을 처리하지 못했습니다." },
      status >= 400 && status < 600 ? status : 500
    );
  }
}

async function readJson(req) {
  const text = await req.text();
  if (!text) return {};
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    const error = new Error("프로필 데이터가 허용 크기를 초과했습니다.");
    error.status = 413;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("요청 본문은 올바른 JSON 형식이어야 합니다.");
    error.status = 400;
    throw error;
  }
}

function json(payload, status = 200, headers = {}) {
  return corsResponse(JSON.stringify(payload), status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
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
