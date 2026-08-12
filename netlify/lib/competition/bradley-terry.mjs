export function computePairwiseRatings(participantIds, votes, options = {}) {
  const ids = [...new Set(participantIds)].filter(Boolean);
  const indexById = new Map(ids.map((id, index) => [id, index]));
  const strengths = Array(ids.length).fill(0);
  const matchCounts = new Map(ids.map((id) => [id, 0]));
  const learningRate = options.learningRate ?? 0.08;
  const iterations = options.iterations ?? 220;
  const regularization = options.regularization ?? 0.02;

  for (const vote of votes) {
    if (indexById.has(vote.winnerId)) matchCounts.set(vote.winnerId, (matchCounts.get(vote.winnerId) || 0) + 1);
    if (indexById.has(vote.loserId)) matchCounts.set(vote.loserId, (matchCounts.get(vote.loserId) || 0) + 1);
  }

  for (let step = 0; step < iterations; step += 1) {
    const gradient = Array(ids.length).fill(0);
    for (const vote of votes) {
      const winner = indexById.get(vote.winnerId);
      const loser = indexById.get(vote.loserId);
      if (winner === undefined || loser === undefined) continue;
      const observed = vote.outcome === "tie" ? 0.5 : 1;
      const probability = logistic(strengths[winner] - strengths[loser]);
      const delta = observed - probability;
      gradient[winner] += delta;
      gradient[loser] -= delta;
    }
    for (let i = 0; i < strengths.length; i += 1) {
      strengths[i] += learningRate * (gradient[i] - regularization * strengths[i]);
    }
    center(strengths);
  }

  return new Map(ids.map((id, index) => {
    const matches = matchCounts.get(id) || 0;
    return [
      id,
      {
        strength: round4(strengths[index]),
        rating: Math.round(1000 + strengths[index] * 120),
        confidence: round2(clamp(0.35 + matches / 18, 0.35, 0.96)),
        matches
      }
    ];
  }));
}

function logistic(value) {
  if (value > 30) return 1;
  if (value < -30) return 0;
  return 1 / (1 + Math.exp(-value));
}

function center(values) {
  if (!values.length) return;
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  for (let i = 0; i < values.length; i += 1) values[i] -= mean;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function round4(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}
