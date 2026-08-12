export const TEAM_KEYWORD_VERSION = 1;

const CONCEPTS = [
  ["AI 에이전트", ["ai agent", "agentic", "multi agent", "에이전트", "에이전틱"]],
  ["생성형 AI", ["generative ai", "genai", "생성형 ai", "생성형ai"]],
  ["LLM", ["llm", "large language model", "거대 언어 모델"]],
  ["컴퓨터 비전", ["computer vision", "vision ai", "영상 인식", "이미지 인식", "비전 검사"]],
  ["음성 AI", ["voice ai", "speech", "음성", "통화", "콜센터"]],
  ["데이터 분석", ["data analytics", "analytics", "business intelligence", "데이터 분석", "데이터 인사이트"]],
  ["업무 자동화", ["automation", "workflow", "rpa", "자동화", "워크플로"]],
  ["문서 AI", ["document ai", "document review", "ocr", "문서", "서류", "계약서"]],
  ["API 연동", ["api", "sdk", "integration", "연동"]],
  ["SaaS", ["saas", "software as a service", "클라우드 서비스"]],
  ["개발자 도구", ["developer tool", "devtool", "개발자 도구", "코드 생성", "코딩"]],
  ["AI 인프라", ["ai infrastructure", "mlops", "gpu", "model serving", "ai 인프라", "모델 배포"]],
  ["제조", ["manufacturing", "factory", "industrial", "제조", "공장", "산업 현장"]],
  ["스마트 팩토리", ["smart factory", "factory dx", "mes", "생산 최적화", "스마트 팩토리", "스마트공장"]],
  ["품질 검사", ["quality inspection", "defect detection", "visual inspection", "품질 검사", "불량 검출", "검품"]],
  ["로보틱스", ["robot", "robotics", "autonomous machine", "로봇", "로보틱스"]],
  ["공급망", ["supply chain", "traceability", "dpp", "공급망", "이력 추적", "제품 여권"]],
  ["물류", ["logistics", "delivery", "warehouse", "물류", "배송", "창고"]],
  ["수요·재고 최적화", ["demand forecasting", "inventory optimization", "재고 최적화", "수요 예측", "sku"]],
  ["에너지·탄소", ["energy management", "carbon", "fems", "에너지 관리", "탄소", "배출량"]],
  ["기후테크", ["climate tech", "sustainability", "기후테크", "지속가능", "친환경"]],
  ["소재·텍스타일", ["materials", "textile", "fabric", "fiber", "apparel", "소재", "텍스타일", "원단", "섬유", "의류"]],
  ["패션테크", ["fashion tech", "fashion", "패션", "의류 브랜드", "스타일"]],
  ["헬스케어", ["healthcare", "health tech", "medical", "헬스케어", "의료", "병원"]],
  ["바이오테크", ["biotech", "bio tech", "drug discovery", "바이오", "신약", "의약"]],
  ["핀테크", ["fintech", "finance", "banking", "payment", "핀테크", "금융", "결제"]],
  ["리걸테크", ["legal tech", "legal", "law", "compliance", "리걸테크", "법률", "법무", "규제"]],
  ["보안", ["cybersecurity", "security", "fraud", "보안", "사이버", "이상 탐지"]],
  ["커머스", ["ecommerce", "e-commerce", "commerce", "marketplace", "커머스", "이커머스", "마켓플레이스"]],
  ["리테일", ["retail", "store", "리테일", "유통", "매장"]],
  ["마케팅", ["marketing", "advertising", "campaign", "마케팅", "광고", "캠페인"]],
  ["세일즈·CRM", ["sales", "crm", "revenue operations", "세일즈", "영업", "고객 관리"]],
  ["고객지원", ["customer support", "customer service", "cs automation", "고객지원", "고객 상담", "문의 자동화"]],
  ["HR·채용", ["human resources", "recruiting", "hiring", "talent", "인사", "채용", "리크루팅"]],
  ["교육", ["education", "edtech", "learning", "training", "교육", "에듀테크", "학습"]],
  ["콘텐츠", ["content", "media", "creator", "콘텐츠", "미디어", "크리에이터"]],
  ["게임", ["game", "gaming", "게임", "게이밍"]],
  ["부동산", ["real estate", "proptech", "property", "부동산", "프롭테크"]],
  ["모빌리티", ["mobility", "automotive", "vehicle", "모빌리티", "자동차", "차량"]],
  ["여행", ["travel", "tourism", "hospitality", "여행", "관광", "숙박"]],
  ["푸드테크", ["food tech", "food", "restaurant", "푸드테크", "식품", "외식"]],
  ["공간 컴퓨팅", ["spatial computing", "3d", "xr", "ar", "vr", "공간 컴퓨팅", "3d", "가상현실"]],
  ["특허·R&D", ["patent", "research", "r&d", "특허", "연구개발", "기술사업화"]]
];

const STOPWORDS = new Set([
  "ai", "인공지능", "기반", "활용", "서비스", "솔루션", "플랫폼", "기업", "회사", "고객", "사용자", "통해", "위한", "대한",
  "제공", "지원", "개발", "운영", "관리", "가능", "있는", "하는", "합니다", "및", "등", "the", "and", "for", "with", "from", "that",
  "this", "into", "our", "your", "company", "service", "solution", "platform", "using", "based", "to", "co", "inc", "b2b",
  "기술", "기술력", "대표", "대표자", "구체적", "상세", "제품", "상품", "사업", "아이디어", "현재", "구축", "도입", "기능", "시장", "분야",
  "역량", "검증", "스타트업", "창업", "창업자", "팀", "본인", "명확", "사용", "경험", "경력", "구체", "상세",
  "소규모", "직접", "비용", "언어", "실무", "온라인"
]);

export function deriveTeamKeywords(team = {}) {
  const textFields = [
    team.name,
    team.company_name,
    team.item,
    team.sector,
    team.one_liner,
    team.service_summary,
    team.expertise,
    team.domain,
    team.ai_idea_summary
  ];
  const searchable = normalize(textFields.join(" "));
  const explicit = [team.sector, team.domain]
    .flatMap(splitTaxonomy)
    .filter((item) => item.length <= 48);
  const serviceNames = splitServiceNames(team.name || team.company_name);
  const concepts = CONCEPTS
    .filter(([, aliases]) => aliases.some((alias) => includesAlias(searchable, alias)))
    .map(([label]) => label);
  const salient = salientTerms(textFields.slice(2));
  const keywords = unique([...explicit, ...concepts, ...serviceNames, ...salient]).slice(0, 18);
  return keywords.length >= 2 ? keywords : unique([...keywords, "프로필 정보 부족"]);
}

export function normalizeStoredKeywords(value) {
  if (Array.isArray(value)) return unique(value).slice(0, 24);
  return unique(String(value || "").split(/[,;|\n]+/u)).slice(0, 24);
}

function salientTerms(fields) {
  const counts = new Map();
  for (const field of fields) {
    for (const rawToken of tokens(field)) {
      const token = canonicalTerm(rawToken);
      if (STOPWORDS.has(token) || /^\d+$/u.test(token)) continue;
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length || left[0].localeCompare(right[0], "ko"))
    .map(([token]) => token)
    .filter((token) => token.length >= 2 && token.length <= 24)
    .slice(0, 6);
}

function canonicalTerm(value) {
  const token = String(value || "").trim();
  if (!/^[가-힣]+$/u.test(token)) return token;
  const endings = ["으로써", "으로", "에서", "에게", "부터", "까지", "하고", "하며", "하는", "됩니다", "합니다", "입니다", "되는", "되어", "들의", "에는", "에게", "의", "을", "를", "은", "는", "이", "가", "에", "도", "만", "과", "와", "로"];
  for (const ending of endings) {
    if (token.endsWith(ending) && token.length - ending.length >= 2) return token.slice(0, -ending.length);
  }
  return token;
}

function splitServiceNames(value) {
  return String(value || "")
    .replace(/\([^)]*\)|\[[^\]]*\]/gu, " ")
    .split(/[\/·|,:-]+/u)
    .map((item) => item.replace(/^(주식회사|유한회사|㈜|\(주\)|주)\s*/u, "").trim())
    .filter((item) => item.length >= 2 && item.length <= 32)
    .slice(0, 3);
}

function splitTaxonomy(value) {
  return String(value || "")
    .split(/[,/|;]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function tokens(value) {
  return normalize(value).match(/[\p{L}\p{N}+#]+/gu) || [];
}

function includesAlias(searchable, alias) {
  const target = normalize(alias);
  if (!target) return false;
  if (target.includes(" ")) return ` ${searchable} `.includes(` ${target} `) || searchable.includes(target);
  const searchableTokens = tokens(searchable);
  return searchableTokens.some((token) => token === target || (target.length >= 4 && token.includes(target)));
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const text = String(value || "").trim();
    const key = text.toLocaleLowerCase("ko-KR");
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}
