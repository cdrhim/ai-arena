export function sortCommunityThreads(items = [], mode = "hot") {
  const threads = Array.isArray(items) ? [...items] : [];
  if (mode === "new") return threads.sort(newestFirst);
  if (mode === "needs") {
    return threads
      .filter((thread) => Number(thread?.commentCount || 0) === 0)
      .sort(oldestFirst);
  }
  return threads.sort((left, right) => {
    const engagementDifference = communityEngagement(right) - communityEngagement(left);
    if (engagementDifference) return engagementDifference;
    return newestActivityFirst(left, right);
  });
}

export function communityEngagement(thread = {}) {
  const score = finiteNumber(thread.score, finiteNumber(thread.upvoteCount, 0));
  const comments = Math.max(0, finiteNumber(thread.commentCount, 0));
  return Math.max(0, score) + comments * 2;
}

function newestFirst(left, right) {
  return timestamp(right?.createdAt) - timestamp(left?.createdAt);
}

function oldestFirst(left, right) {
  return timestamp(left?.createdAt) - timestamp(right?.createdAt);
}

function newestActivityFirst(left, right) {
  return timestamp(right?.lastActivityAt || right?.createdAt) - timestamp(left?.lastActivityAt || left?.createdAt);
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}
