import {
  loadApplicantExportFile,
  loadApplicantExportMetadata
} from "../lib/sparkclaw-applicant-export.mjs";
import { assertProgramDatabaseAccess } from "../lib/program-database.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";

export default async function sparkclawApplicantsExport(req) {
  if (req.method === "OPTIONS") return response(null, 204);
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await verifyArenaRequest(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    assertProgramDatabaseAccess(auth.viewer);

    const url = new URL(req.url);
    const format = String(url.searchParams.get("format") || "metadata").toLowerCase();
    if (format === "metadata") {
      return json(await loadApplicantExportMetadata());
    }

    const file = await loadApplicantExportFile(format);
    return response(file.body, 200, {
      "content-type": file.contentType,
      "content-disposition": `attachment; filename="${file.fileName}"`,
      "content-length": String(file.body.byteLength),
      "last-modified": new Date(file.generatedAt).toUTCString()
    });
  } catch (error) {
    return json({ error: error.message }, error.status || 500);
  }
}

function json(payload, status = 200) {
  return response(JSON.stringify(payload), status, {
    "content-type": "application/json; charset=utf-8"
  });
}

function response(body, status, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      ...headers
    }
  });
}
