import crypto from "node:crypto";

import { parseCsv } from "./csv-parser.mjs";
import { computeMetric, normalizeScore } from "./metrics.mjs";

export function validateAndScoreCsvSubmission(challenge, csvText, solution, now = new Date().toISOString()) {
  if (!challenge || challenge.challengeType !== "csv_prediction") {
    throw publicError("unsupported_challenge_type", "This challenge does not accept CSV predictions.");
  }
  if (!solution?.rows?.length) {
    throw publicError("missing_solution", "Challenge solution data is not configured.");
  }

  const parsed = parseCsv(csvText, { maxBytes: Number(challenge.maxFileBytes || 1_000_000) });
  const idColumn = challenge.submissionIdColumn || "id";
  const scoreFields = scoredFieldsFor(challenge.metricConfig || {});
  const requiredColumns = [
    ...new Set([idColumn, ...scoreFields.map((field) => field.predictionColumn), ...(challenge.requiredColumns || [])])
  ];
  const missingColumns = requiredColumns.filter((column) => !parsed.headers.includes(column));
  const extraColumns = parsed.headers.filter((column) => !requiredColumns.includes(column));
  const duplicateIds = [];
  const missingIds = [];
  const unknownIds = [];
  const invalidValues = [];
  const seenIds = new Set();
  const solutionById = new Map(solution.rows.map((row) => [String(row.id), row]));
  const solutionIds = new Set(solution.rows.map((row) => String(row.id)));

  for (const record of parsed.records) {
    const id = String(record[idColumn] || "").trim();
    if (!id) invalidValues.push({ row: record.__rowNumber, column: idColumn, reason: "ID is required." });
    if (seenIds.has(id)) duplicateIds.push(id);
    seenIds.add(id);
    if (id && !solutionById.has(id)) unknownIds.push(id);
    for (const field of scoreFields) {
      validatePredictionValue(record[field.predictionColumn], field, record.__rowNumber, field.predictionColumn, invalidValues);
    }
  }

  for (const id of solutionIds) {
    if (!seenIds.has(id)) missingIds.push(id);
  }

  const expectedRowCount = Number(challenge.expectedRowCount || 0);
  const wrongRowCount = expectedRowCount > 0 && parsed.records.length !== expectedRowCount;
  const schemaValid = !missingColumns.length && !duplicateIds.length && !missingIds.length && !unknownIds.length && !invalidValues.length && !wrongRowCount;
  const report = {
    id: stableId("report", `${challenge.id}:${hash(csvText)}:${now}`),
    schemaValid,
    rowCount: parsed.records.length,
    missingColumns,
    extraColumns,
    duplicateIds,
    missingIds,
    unknownIds,
    invalidValues,
    warnings: extraColumns.length ? [`Ignored extra columns: ${extraColumns.join(", ")}`] : [],
    logsPublic: [
      { level: schemaValid ? "info" : "error", message: schemaValid ? "CSV schema is valid." : "CSV schema failed validation." }
    ],
    logsPrivate: [
      { level: "debug", message: `Validated ${parsed.records.length} rows against ${solution.rows.length} hidden solution rows.` }
    ],
    createdAt: now
  };

  if (wrongRowCount) {
    report.invalidValues.push({
      row: null,
      column: null,
      reason: `Expected ${expectedRowCount} rows, received ${parsed.records.length}.`
    });
  }

  if (!schemaValid) {
    return {
      status: "schema_failed",
      report,
      publicScore: null,
      privateScore: null,
      metricBreakdown: null
    };
  }

  const joined = parsed.records.map((record) => {
    const solutionRow = solutionById.get(String(record[idColumn]));
    return {
      id: String(record[idColumn]),
      prediction: record[scoreFields[0].predictionColumn],
      label: solutionRow?.[scoreFields[0].labelColumn],
      predictions: Object.fromEntries(scoreFields.map((field) => [field.predictionColumn, record[field.predictionColumn]])),
      labels: Object.fromEntries(scoreFields.map((field) => [field.predictionColumn, solutionRow?.[field.labelColumn]])),
      split: solutionRow?.split || "private"
    };
  });
  const publicRows = joined.filter((row) => row.split === "public");
  const privateRows = joined.filter((row) => row.split === "private");
  const metricKey = challenge.metricKey || "accuracy";
  const publicResult = scoreSubmissionRows(metricKey, publicRows, challenge.metricConfig || {}, scoreFields);
  const privateResult = scoreSubmissionRows(metricKey, privateRows, challenge.metricConfig || {}, scoreFields);
  const publicScore = publicResult.score;
  const privateScore = privateResult.score;
  const publicNormalized = normalizeScore(publicScore, metricKey, challenge.higherIsBetter !== false, challenge.metricConfig || {});
  const privateNormalized = normalizeScore(privateScore, metricKey, challenge.higherIsBetter !== false, challenge.metricConfig || {});

  return {
    status: "scored",
    report,
    publicScore: round6(publicScore),
    privateScore: round6(privateScore),
    metricBreakdown: {
      publicScore: round6(publicScore),
      privateScore: round6(privateScore),
      publicNormalized: round4(publicNormalized),
      privateNormalized: round4(privateNormalized),
      metricKey,
      publicRows: publicRows.length,
      privateRows: privateRows.length,
      publicFields: publicResult.fields,
      privateFields: privateResult.fields
    }
  };
}

function scoreSubmissionRows(metricKey, rows, config, scoreFields) {
  if (!rows.length) return { score: null, fields: [] };
  if (scoreFields.length === 1 && !Array.isArray(config.fields)) {
    return {
      score: computeMetric(
        metricKey,
        rows.map((row) => row.prediction),
        rows.map((row) => row.label),
        config
      ),
      fields: []
    };
  }

  const totalWeight = scoreFields.reduce((sum, field) => sum + field.weight, 0) || 1;
  const fields = scoreFields.map((field) => {
    const correct = rows.filter(
      (row) => String(row.predictions[field.predictionColumn]) === String(row.labels[field.predictionColumn])
    ).length;
    return {
      column: field.predictionColumn,
      displayName: field.displayName,
      weight: round6(field.weight / totalWeight),
      score: round6(correct / rows.length)
    };
  });
  return {
    score: fields.reduce((sum, field) => sum + field.score * field.weight, 0),
    fields
  };
}

function scoredFieldsFor(config) {
  if (Array.isArray(config.fields) && config.fields.length) {
    return config.fields.map((field) => ({
      ...field,
      predictionColumn: String(field.predictionColumn || "prediction"),
      labelColumn: String(field.labelColumn || field.predictionColumn || "label"),
      displayName: String(field.displayName || field.predictionColumn || "Prediction"),
      weight: positiveWeight(field.weight)
    }));
  }
  return [{
    ...config,
    predictionColumn: config.predictionColumn || "prediction",
    labelColumn: config.labelColumn || "label",
    displayName: config.displayName || config.predictionColumn || "Prediction",
    weight: 1
  }];
}

function positiveWeight(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

function validatePredictionValue(value, config, row, column, invalidValues) {
  const text = String(value ?? "").trim();
  if (!text) {
    invalidValues.push({ row, column, reason: "Prediction is required." });
    return;
  }
  if (Array.isArray(config.allowedValues) && config.allowedValues.length && !config.allowedValues.includes(text)) {
    invalidValues.push({ row, column, reason: `Prediction must be one of: ${config.allowedValues.join(", ")}.` });
  }
  if (config.predictionType === "number" && !Number.isFinite(Number(text))) {
    invalidValues.push({ row, column, reason: "Prediction must be numeric." });
  }
  if (config.predictionType === "boolean" && !["true", "false", "1", "0", "yes", "no"].includes(text.toLowerCase())) {
    invalidValues.push({ row, column, reason: "Prediction must be boolean." });
  }
}

export function validateEndpointUrl(value) {
  const url = String(value || "").trim();
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw publicError("invalid_endpoint_url", "Endpoint URL must be valid.");
  }
  if (parsed.protocol !== "https:") {
    throw publicError("invalid_endpoint_protocol", "Endpoint URL must use HTTPS.");
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) && isPrivateIp(host) ||
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    host === "::1"
  ) {
    throw publicError("blocked_endpoint_host", "Endpoint URL cannot target localhost, private, or internal hosts.");
  }
  return parsed.toString();
}

function isPrivateIp(host) {
  const [a, b] = host.split(".").map(Number);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 169 && b === 254;
}

function publicError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 400;
  return error;
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function stableId(prefix, material) {
  return `${prefix}_${crypto.createHash("sha256").update(material).digest("hex").slice(0, 18)}`;
}

function round4(value) {
  if (value === null || value === undefined) return null;
  return Math.round(Number(value) * 10000) / 10000;
}

function round6(value) {
  if (value === null || value === undefined) return null;
  return Math.round(Number(value) * 1_000_000) / 1_000_000;
}
