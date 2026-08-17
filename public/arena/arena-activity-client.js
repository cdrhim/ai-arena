const SESSION_KEY = "sparkclaw-program-hub-session-gfmummaahlrnmrgnirxu-v1";
const AUTHENTICATED_ROLES = new Set(["admin", "sparklabs", "member", "b2b_partner", "human_validator"]);
const TRACKABLE_PAGES = new Set([
  "overview",
  "teams",
  "discover",
  "passports",
  "compare",
  "partnerships",
  "community",
  "arena",
  "workspace",
  "operations",
  "database"
]);

let currentViewerId = "";
let sessionRecordedForViewer = "";
let lastPageRecord = { page: "", at: 0 };

window.addEventListener("spark-arena:data", (event) => {
  const viewer = event.detail?.viewer || event.detail?.market?.viewer || event.detail?.hub?.viewer || null;
  const role = String(viewer?.role || "").toLowerCase();
  const viewerId = String(viewer?.id || "");
  if (!viewerId || !AUTHENTICATED_ROLES.has(role)) {
    currentViewerId = "";
    sessionRecordedForViewer = "";
    return;
  }
  if (currentViewerId !== viewerId) {
    currentViewerId = viewerId;
    sessionRecordedForViewer = "";
    lastPageRecord = { page: "", at: 0 };
  }
  if (sessionRecordedForViewer !== viewerId) {
    sessionRecordedForViewer = viewerId;
    void recordActivity("session_started");
  }
});

window.addEventListener("spark-arena:page", (event) => {
  const page = String(event.detail?.page || "").toLowerCase();
  const now = Date.now();
  if (!currentViewerId || !TRACKABLE_PAGES.has(page)) return;
  if (lastPageRecord.page === page && now - lastPageRecord.at < 1500) return;
  lastPageRecord = { page, at: now };
  void recordActivity("page_viewed", page);
});

async function recordActivity(action, page = "") {
  const token = readAccessToken();
  if (!token) return;
  try {
    await fetch("/api/arena-activity", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action,
        page,
        clientEventId: `${action}:${crypto.randomUUID()}`
      }),
      keepalive: true
    });
  } catch {
    // Activity telemetry must never block login or navigation.
  }
}

function readAccessToken() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    return String(session?.access_token || "");
  } catch {
    return "";
  }
}
