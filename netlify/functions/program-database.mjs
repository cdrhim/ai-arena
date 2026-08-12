import { loadProgramDatabaseSchema, readProgramDatabaseTable, assertProgramDatabaseAccess } from "../lib/program-database.mjs";
import { verifyArenaRequest } from "../lib/supabase-auth.mjs";

export default async function programDatabase(req) {
  if (req.method === "OPTIONS") return corsResponse(null, 204);
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await verifyArenaRequest(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    assertProgramDatabaseAccess(auth.viewer);

    const url = new URL(req.url);
    const schema = await loadProgramDatabaseSchema();
    const table = url.searchParams.get("table");
    if (!table) return json(schema);

    const result = await readProgramDatabaseTable(
      {
        schema,
        table,
        limit: url.searchParams.get("limit"),
        offset: url.searchParams.get("offset")
      }
    );
    return json({
      ...schema,
      selectedTable: result.table,
      rows: result.rows,
      limit: result.limit,
      offset: result.offset,
      contentRange: result.contentRange,
      totalCount: result.totalCount,
      generatedAt: result.generatedAt
    });
  } catch (error) {
    return json({ error: error.message }, error.status || 400);
  }
}

function json(payload, status = 200) {
  return corsResponse(JSON.stringify(payload), status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
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
