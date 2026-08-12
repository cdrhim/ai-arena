const RESPONSE_WAITING = new Set(["awaiting_response", "needs_attention"]);

export function communityLiveCopy(snapshot = {}, now = Date.now()) {
  const threads = Array.isArray(snapshot.threads) ? snapshot.threads : [];
  const comments = Array.isArray(snapshot.comments) ? snapshot.comments : [];
  const waitingCount = threads.filter((thread) => RESPONSE_WAITING.has(thread?.responseStatus)).length;
  const latestActivity = latestActivityAt(threads, comments);

  if (!threads.length) {
    return {
      state: "ready",
      title: "첫 대화를 기다리고 있습니다",
      meta: "Ask · Ship · Connect · Outcome에서 새로운 신호를 열어보세요."
    };
  }

  const title = comments.length
    ? `${formatNumber(threads.length)}개의 대화에서 답변이 이어지고 있습니다`
    : `${formatNumber(threads.length)}개의 대화가 지금 열려 있습니다`;
  const details = [`댓글 ${formatNumber(comments.length)}개`];
  if (waitingCount) details.push(`답변을 기다리는 요청 ${formatNumber(waitingCount)}개`);
  if (latestActivity) details.push(relativeActivity(latestActivity, now));

  return {
    state: "active",
    title,
    meta: details.join(" · ")
  };
}

export function relativeActivity(value, now = Date.now()) {
  const timestamp = Date.parse(value || "");
  const current = Number(now);
  if (!Number.isFinite(timestamp) || !Number.isFinite(current)) return "최근 활동 확인 중";
  const elapsed = Math.max(0, current - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "방금 활동";
  if (minutes < 60) return `${minutes}분 전 활동`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전 활동`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전 활동`;
  return `${Math.floor(days / 7)}주 전 활동`;
}

function latestActivityAt(threads, comments) {
  const values = [
    ...threads.map((thread) => thread?.lastActivityAt || thread?.createdAt),
    ...comments.map((comment) => comment?.createdAt)
  ];
  let latest = null;
  let latestTimestamp = -Infinity;
  for (const value of values) {
    const timestamp = Date.parse(value || "");
    if (!Number.isFinite(timestamp) || timestamp <= latestTimestamp) continue;
    latest = value;
    latestTimestamp = timestamp;
  }
  return latest;
}

function formatNumber(value) {
  return new Intl.NumberFormat("ko-KR").format(Number(value || 0));
}
