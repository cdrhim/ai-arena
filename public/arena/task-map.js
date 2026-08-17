import { searchableTaskKeywords } from "./task-keywords.js";

const TASK_MAP_LABELS = new Map([
  ["마케팅·광고 최적화", "광고 타깃·캠페인 최적화"],
  ["콘텐츠 제작·편집", "콘텐츠 기획·제작·편집"],
  ["데이터 분석·예측", "운영 데이터 분석·예측"],
  ["교육·학습 지원", "교육 콘텐츠·학습 지원"],
  ["의료·헬스케어 운영", "의료 기록·환자 운영"],
  ["바이오·신약 R&D", "신약 후보·임상 분석"],
  ["금융·결제·리스크", "금융 심사·결제 리스크"],
  ["커머스·리테일 운영", "상품·판매·리테일 운영"],
  ["패션·소재 개발", "패션 상품·소재 개발"],
  ["업무 워크플로 자동화", "반복 업무·워크플로 자동화"]
]);

export function taskMapEntries(teams = [], limit = 12) {
  const groups = new Map();

  for (const team of Array.isArray(teams) ? teams : []) {
    const companyName = String(team?.name || team?.companyName || "").trim();
    if (!companyName) continue;

    const taskEvidenceProfile = { ...team, category: "", sector: "" };
    const tasks = [...new Set(searchableTaskKeywords(taskEvidenceProfile).map(taskMapLabel))];
    for (const task of tasks) {
      if (!task) continue;
      const entry = groups.get(task) || { name: task, count: 0, companies: [] };
      entry.count += 1;
      if (!entry.companies.some((name) => name.toLocaleLowerCase("ko") === companyName.toLocaleLowerCase("ko"))) {
        entry.companies.push(companyName);
      }
      groups.set(task, entry);
    }
  }

  return [...groups.values()]
    .map((entry) => ({ ...entry, companies: entry.companies.sort((left, right) => left.localeCompare(right, "ko")) }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "ko"))
    .slice(0, Math.max(1, Number(limit) || 12));
}

export function taskMapLabel(value) {
  const task = String(value || "").trim();
  return TASK_MAP_LABELS.get(task) || task;
}
