export const FEATURED_COMPANY_CURATION = [
  {
    id: "neander-acscent",
    displayName: "네안데르 / AC'SCENT",
    aliases: ["네안데르", "AC'SCENT", "ACS CENT"],
    rank: 1,
    achievement: "공식 사이트 기준 190회 이상 행사를 운영하고, 42개 AI 체험 콘텐츠와 3개 AC'SCENT 매장을 공개했습니다.",
    hook: "AI 체험을 오프라인 매장 경험으로 확장",
    appealKeywords: ["190+ 행사 운영", "42개 AI 콘텐츠", "오프라인 AI 경험"],
    sourceLabel: "회사 공식 성과",
    sourceUrl: "https://neander.co.kr/",
    verifiedAt: "2026-08-11"
  },
  {
    id: "gorocket-oing",
    displayName: "고로켓컴퍼니 / Oing",
    aliases: ["고로켓컴퍼니", "Oing"],
    rank: 2,
    achievement: "건강 루틴 앱 Oing을 iPhone에 공개하고, CareMate 연결과 영양제 섭취 기록 기능을 운영하고 있습니다.",
    hook: "건강 루틴과 케어 데이터를 하나로 연결",
    appealKeywords: ["디지털 헬스", "CareMate 연결", "영양 루틴"],
    sourceLabel: "Apple App Store",
    sourceUrl: "https://apps.apple.com/kr/app/oing/id6756283759",
    verifiedAt: "2026-08-11"
  },
  {
    id: "vivivava-hemogry",
    displayName: "VIVIVAVA / Hemogry",
    aliases: ["비비바바", "VIVIVAVA", "Hemogry", "해먹으리"],
    rank: 3,
    achievement: "영상 링크를 레시피·재료·조리 단계로 변환하는 Hemogry 앱을 Google Play에 공개했습니다.",
    hook: "영상 콘텐츠를 실행 가능한 레시피로 전환",
    appealKeywords: ["영상→레시피", "AI 푸드테크", "Google Play 출시"],
    sourceLabel: "Google Play",
    sourceUrl: "https://play.google.com/store/apps/details?id=com.vivivava.hemogry.app",
    verifiedAt: "2026-08-11"
  },
  {
    id: "crack-edtech",
    displayName: "크랙더데이",
    aliases: ["크랙더데이", "열공"],
    rank: 4,
    achievement: "AI 기반 학습·기록 모바일 서비스를 Google Play에 공개하고 운영하고 있습니다.",
    hook: "학습 기록을 AI로 구조화한 모바일 서비스",
    appealKeywords: ["AI 학습 기록", "EdTech", "모바일 서비스"],
    sourceLabel: "Google Play",
    sourceUrl: "https://play.google.com/store/apps/details?id=day.crack.bk",
    verifiedAt: "2026-08-11"
  }
];

function normalizedCompanyName(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/주식회사|\(주\)|㈜/gu, "")
    .replace(/[^0-9a-z가-힣]+/gu, "");
}

export function featuredCurationForTeam(team = {}) {
  const companyName = normalizedCompanyName([team.name, team.companyName].filter(Boolean).join(" "));
  if (!companyName) return null;
  const curation = FEATURED_COMPANY_CURATION.find((entry) =>
    entry.aliases.some((alias) => companyName.includes(normalizedCompanyName(alias)))
  );
  return curation ? { ...curation, appealKeywords: [...curation.appealKeywords] } : null;
}

export function curatedFeaturedTeams(teams = [], limit = 4) {
  return (Array.isArray(teams) ? teams : [])
    .map((team) => ({ team, curation: featuredCurationForTeam(team) }))
    .filter((entry) => entry.curation)
    .sort((left, right) => left.curation.rank - right.curation.rank)
    .slice(0, Math.max(0, Number(limit) || 0));
}

export function featuredEditorialFacts(ids = []) {
  const requestedIds = new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()));
  return FEATURED_COMPANY_CURATION
    .filter((entry) => !requestedIds.size || requestedIds.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      company: entry.displayName,
      achievement: entry.achievement,
      hook: entry.hook,
      keywords: [...entry.appealKeywords]
    }));
}

export function featuredCurationUpdatedLabel(entries = FEATURED_COMPANY_CURATION) {
  const latest = [...entries]
    .map((entry) => String(entry?.verifiedAt || ""))
    .filter(Boolean)
    .sort()
    .at(-1);
  if (!latest) return "SPARKLABS OPERATIONS REVIEW";
  const [year, month, day] = latest.split("-");
  return `SPARKLABS OPERATIONS · VERIFIED ${year}.${month}.${day}`;
}

export const FEATURED_EDITORIAL_CRITERIA = [
  "최근 제품·고객·운영 성과",
  "회사 또는 공개 출처 확인",
  "SparkLabs 운영진 검수",
  "유료 노출 아님",
  "파트너별 개인화 아님"
];
