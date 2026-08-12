import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/sparkclaw-applicants"
);

const CONTENT_TYPES = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

export async function loadApplicantExportMetadata(dataDir = DEFAULT_DATA_DIR) {
  const raw = await fs.readFile(path.join(dataDir, "metadata.json"), "utf8");
  const metadata = JSON.parse(raw);
  return {
    source: metadata.source,
    generatedAt: metadata.generatedAt,
    applicationCount: Number(metadata.applicationCount || 0),
    uniqueTeamCount: Number(metadata.uniqueTeamCount || 0),
    duplicateApplicationCount: Number(metadata.duplicateApplicationCount || 0),
    access: metadata.access,
    formats: Object.keys(metadata.files || {}).filter((format) => CONTENT_TYPES[format])
  };
}

export async function loadApplicantExportFile(format, dataDir = DEFAULT_DATA_DIR) {
  const normalizedFormat = String(format || "").trim().toLowerCase();
  if (!CONTENT_TYPES[normalizedFormat]) {
    const error = new Error("Supported export formats are csv and xlsx.");
    error.status = 400;
    throw error;
  }

  const raw = await fs.readFile(path.join(dataDir, "metadata.json"), "utf8");
  const metadata = JSON.parse(raw);
  const fileName = path.basename(String(metadata.files?.[normalizedFormat] || ""));
  if (!fileName) {
    const error = new Error("The requested applicant export is unavailable.");
    error.status = 404;
    throw error;
  }

  const body = await fs.readFile(path.join(dataDir, fileName));
  return {
    body,
    contentType: CONTENT_TYPES[normalizedFormat],
    fileName,
    generatedAt: metadata.generatedAt
  };
}
