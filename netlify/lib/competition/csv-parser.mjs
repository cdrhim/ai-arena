const DEFAULT_MAX_BYTES = 1_000_000;

export function parseCsv(text, options = {}) {
  const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
  const raw = String(text || "");
  if (!raw.trim()) throw validationError("empty_csv", "CSV content is required.");
  if (byteLength(raw) > maxBytes) {
    throw validationError("file_too_large", `CSV must be ${Math.round(maxBytes / 1000)} KB or smaller.`);
  }

  const rows = parseRows(raw);
  if (!rows.length) throw validationError("empty_csv", "CSV content is required.");
  const headers = rows[0].map((header) => header.trim());
  if (!headers.length || headers.some((header) => !header)) {
    throw validationError("invalid_header", "CSV headers must be present and non-empty.");
  }

  const seenHeaders = new Set();
  const duplicateHeaders = [];
  for (const header of headers) {
    if (seenHeaders.has(header)) duplicateHeaders.push(header);
    seenHeaders.add(header);
  }
  if (duplicateHeaders.length) {
    throw validationError("duplicate_headers", `Duplicate CSV headers: ${duplicateHeaders.join(", ")}`);
  }

  const records = rows
    .slice(1)
    .filter((row) => row.some((cell) => String(cell || "").trim()))
    .map((row, index) => {
      const record = {};
      for (let column = 0; column < headers.length; column += 1) {
        record[headers[column]] = String(row[column] ?? "").trim();
      }
      return { __rowNumber: index + 2, ...record };
    });

  return { headers, records };
}

export function toCsv(rows, headers) {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))
  ].join("\n");
}

function parseRows(raw) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    const next = raw[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  if (quoted) throw validationError("unterminated_quote", "CSV has an unterminated quoted field.");
  row.push(cell.replace(/\r$/, ""));
  rows.push(row);
  return rows;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function validationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
