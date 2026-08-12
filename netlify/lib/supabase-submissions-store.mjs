const TABLE_NAME = "arena_submissions";

export function supabaseSubmissionConfig(env = process.env) {
  const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const secretKey = String(
    env.SUPABASE_SECRET_KEY ||
      env.SUPABASE_SERVICE_ROLE_KEY ||
      env.SUPABASE_SERVICE_KEY ||
      env.SUPABASE_ANON_KEY ||
      env.VITE_SUPABASE_ANON_KEY ||
      ""
  );
  return {
    supabaseUrl,
    secretKey,
    configured: Boolean(supabaseUrl && secretKey)
  };
}

export async function loadArenaSubmissions(env = process.env) {
  const config = supabaseSubmissionConfig(env);
  if (!config.configured) return [];

  const response = await fetch(`${config.supabaseUrl}/rest/v1/${TABLE_NAME}?select=id,payload,updated_at&order=updated_at.desc`, {
    headers: restHeaders(config)
  });

  if (response.status === 404) return [];
  const payload = await safeJson(response);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "Unable to load Supabase arena submissions.");
  }
  return Array.isArray(payload) ? payload.map((row) => row.payload).filter(Boolean) : [];
}

export async function saveArenaSubmission(submission, env = process.env) {
  const config = supabaseSubmissionConfig(env);
  if (!config.configured) {
    throw new Error("Supabase submission storage is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY.");
  }

  const row = submissionRow(submission);
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${TABLE_NAME}?on_conflict=id`, {
    method: "POST",
    headers: {
      ...restHeaders(config),
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([row])
  });
  const payload = await safeJson(response);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "Unable to save Supabase arena submission.");
  }
  return Array.isArray(payload) ? payload[0]?.payload || submission : submission;
}

export function submissionRow(submission) {
  return {
    id: submission.id,
    owner_id: submission.ownerId || null,
    owner_email: submission.ownerEmail || "",
    status: submission.status || "draft",
    visibility: submission.visibility || "private",
    slug: submission.slug || null,
    name: submission.name || "",
    readiness_score: Number(submission.readiness?.score || 0),
    payload: submission,
    created_at: submission.createdAt || new Date().toISOString(),
    updated_at: submission.updatedAt || new Date().toISOString(),
    submitted_at: submission.submittedAt || null,
    approved_at: submission.approvedAt || null,
    published_at: submission.publishedAt || null
  };
}

function restHeaders(config) {
  return {
    apikey: config.secretKey,
    Authorization: `Bearer ${config.secretKey}`
  };
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
