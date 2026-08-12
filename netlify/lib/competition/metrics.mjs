const EPSILON = 1e-15;

export const METRIC_KEYS = new Set([
  "accuracy",
  "precision",
  "recall",
  "f1",
  "mae",
  "mse",
  "rmse",
  "log_loss",
  "roc_auc",
  "pass_rate",
  "latency_ms",
  "cost_per_task",
  "composite"
]);

export function computeMetric(metricKey, predictions, labels, config = {}) {
  if (!METRIC_KEYS.has(metricKey)) throw new Error(`Unsupported metric: ${metricKey}`);
  if (!predictions.length || predictions.length !== labels.length) throw new Error("Predictions and labels must have matching rows.");

  if (metricKey === "accuracy") return mean(predictions.map((prediction, index) => sameValue(prediction, labels[index]) ? 1 : 0));
  if (metricKey === "precision") return precision(predictions, labels, config.positiveLabel);
  if (metricKey === "recall") return recall(predictions, labels, config.positiveLabel);
  if (metricKey === "f1") return f1(predictions, labels, config.positiveLabel);
  if (metricKey === "mae") return mean(predictions.map((prediction, index) => Math.abs(number(prediction) - number(labels[index]))));
  if (metricKey === "mse") return mean(predictions.map((prediction, index) => (number(prediction) - number(labels[index])) ** 2));
  if (metricKey === "rmse") return Math.sqrt(computeMetric("mse", predictions, labels, config));
  if (metricKey === "log_loss") return logLoss(predictions, labels, config.positiveLabel);
  if (metricKey === "roc_auc") return rocAuc(predictions, labels, config.positiveLabel);
  if (metricKey === "pass_rate") return mean(predictions.map((prediction) => truthy(prediction) ? 1 : 0));
  if (metricKey === "latency_ms" || metricKey === "cost_per_task") return mean(predictions.map(number));
  if (metricKey === "composite") return composite(predictions, labels, config);
  throw new Error(`Unsupported metric: ${metricKey}`);
}

export function normalizeScore(value, metricKey, higherIsBetter, config = {}) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  if (["accuracy", "precision", "recall", "f1", "pass_rate", "roc_auc"].includes(metricKey)) {
    return clamp(score * 100, 0, 100);
  }
  if (metricKey === "log_loss" || metricKey === "mae" || metricKey === "mse" || metricKey === "rmse") {
    const targetMax = Number(config.normalizationMax || 1);
    return clamp((1 - score / Math.max(targetMax, EPSILON)) * 100, 0, 100);
  }
  if (!higherIsBetter) {
    const targetMax = Number(config.normalizationMax || 1000);
    return clamp((1 - score / Math.max(targetMax, EPSILON)) * 100, 0, 100);
  }
  return clamp(score, 0, 100);
}

export function compareScores(left, right, higherIsBetter = true) {
  const l = Number(left ?? (higherIsBetter ? -Infinity : Infinity));
  const r = Number(right ?? (higherIsBetter ? -Infinity : Infinity));
  return higherIsBetter ? r - l : l - r;
}

function precision(predictions, labels, positiveLabel = "1") {
  let tp = 0;
  let fp = 0;
  for (let i = 0; i < predictions.length; i += 1) {
    if (sameValue(predictions[i], positiveLabel) && sameValue(labels[i], positiveLabel)) tp += 1;
    if (sameValue(predictions[i], positiveLabel) && !sameValue(labels[i], positiveLabel)) fp += 1;
  }
  return tp + fp === 0 ? 0 : tp / (tp + fp);
}

function recall(predictions, labels, positiveLabel = "1") {
  let tp = 0;
  let fn = 0;
  for (let i = 0; i < predictions.length; i += 1) {
    if (sameValue(labels[i], positiveLabel) && sameValue(predictions[i], positiveLabel)) tp += 1;
    if (sameValue(labels[i], positiveLabel) && !sameValue(predictions[i], positiveLabel)) fn += 1;
  }
  return tp + fn === 0 ? 0 : tp / (tp + fn);
}

function f1(predictions, labels, positiveLabel = "1") {
  const p = precision(predictions, labels, positiveLabel);
  const r = recall(predictions, labels, positiveLabel);
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

function logLoss(predictions, labels, positiveLabel = "1") {
  return mean(predictions.map((prediction, index) => {
    const probability = clamp(number(prediction), EPSILON, 1 - EPSILON);
    return sameValue(labels[index], positiveLabel) ? -Math.log(probability) : -Math.log(1 - probability);
  }));
}

function rocAuc(predictions, labels, positiveLabel = "1") {
  const pairs = predictions
    .map((prediction, index) => ({ score: number(prediction), positive: sameValue(labels[index], positiveLabel) }))
    .sort((left, right) => left.score - right.score);
  const positives = pairs.filter((item) => item.positive).length;
  const negatives = pairs.length - positives;
  if (!positives || !negatives) return 0.5;
  let rankSum = 0;
  for (let i = 0; i < pairs.length; i += 1) {
    if (pairs[i].positive) rankSum += i + 1;
  }
  return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

function composite(predictions, labels, config = {}) {
  const components = Array.isArray(config.components) ? config.components : [];
  if (!components.length) throw new Error("Composite metric requires allowlisted components.");
  let totalWeight = 0;
  let total = 0;
  for (const component of components) {
    const metricKey = component.metricKey;
    if (metricKey === "composite" || !METRIC_KEYS.has(metricKey)) throw new Error(`Unsupported composite component: ${metricKey}`);
    const weight = Number(component.weight || 0);
    if (weight <= 0) continue;
    const raw = computeMetric(metricKey, predictions, labels, { ...config, ...component.config });
    total += normalizeScore(raw, metricKey, component.higherIsBetter ?? true, component.config) * weight;
    totalWeight += weight;
  }
  if (!totalWeight) throw new Error("Composite metric weights must be positive.");
  return total / totalWeight;
}

function sameValue(left, right) {
  return String(left ?? "").trim().toLowerCase() === String(right ?? "").trim().toLowerCase();
}

function truthy(value) {
  return ["true", "1", "yes", "pass", "passed"].includes(String(value ?? "").trim().toLowerCase());
}

function number(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`Expected numeric value, received ${value}`);
  return numeric;
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
