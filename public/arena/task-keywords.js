const TASK_DEFINITIONS = [
  ["품질 검사", ["quality inspection", "defect detection", "visual inspection", "비전 검사", "품질 검사", "불량 검출", "검품"]],
  ["생산 공정 최적화", ["smart factory", "factory dx", "manufacturing dx", "mes", "생산 최적화", "공정 최적화", "스마트 팩토리", "스마트공장", "제조 dx"]],
  ["수요·재고 예측", ["demand forecast", "inventory optimization", "inventory", "수요 예측", "재고 최적화", "재고 관리", "sku"]],
  ["물류·공급망 운영", ["supply chain", "logistics", "warehouse", "traceability", "공급망", "물류", "창고", "배송", "이력 추적"]],
  ["에너지·탄소 관리", ["energy management", "fems", "carbon", "emission", "에너지 관리", "탄소", "배출량", "에너지 비용"]],
  ["문서 검토·정보 추출", ["document ai", "document review", "contract review", "ocr", "pdf", "문서 ai", "문서 검토", "계약서", "서류", "정보 추출"]],
  ["고객 문의·상담 자동화", ["customer support", "customer service", "contact center", "call center", "cs automation", "고객지원", "고객 상담", "콜센터", "문의 자동화"]],
  ["영업·CRM 운영", ["sales automation", "sales enablement", "crm", "revenue operations", "lead generation", "세일즈", "영업", "리드", "고객 관리"]],
  ["마케팅·광고 최적화", ["marketing", "advertising", "adtech", "campaign", "마케팅", "광고", "캠페인", "브랜드"]],
  ["콘텐츠 제작·편집", ["content creation", "content generation", "creator", "media", "콘텐츠 제작", "콘텐츠 생성", "크리에이터", "미디어", "레시피"]],
  ["이미지·영상 생성", ["image generation", "video generation", "text to image", "text to video", "이미지 생성", "영상 생성", "생성 이미지"]],
  ["이미지·영상 분석", ["computer vision", "vision ai", "image recognition", "video analytics", "컴퓨터 비전", "영상 인식", "이미지 인식", "영상 분석"]],
  ["데이터 분석·예측", ["data analytics", "business intelligence", "forecasting", "analytics", "데이터 분석", "데이터 인사이트", "예측 분석", "애널리틱스"]],
  ["검색·지식 응답", ["enterprise search", "semantic search", "knowledge base", "knowledge management", "rag", "검색", "지식 관리", "질의응답", "정보 검색"]],
  ["개발·코딩 자동화", ["developer tool", "devtool", "code generation", "coding assistant", "개발자 도구", "코드 생성", "코딩", "개발 자동화"]],
  ["보안·이상 탐지", ["cybersecurity", "fraud detection", "anomaly detection", "security", "보안", "사이버", "이상 탐지", "부정 탐지"]],
  ["채용·인재 매칭", ["recruiting", "hiring", "talent matching", "human resources", "채용", "리크루팅", "인재 매칭", "인사"]],
  ["교육·학습 지원", ["education", "edtech", "learning", "training", "교육", "에듀테크", "학습", "튜터", "훈련"]],
  ["의료·헬스케어 운영", ["healthcare", "medical", "health tech", "hospital", "헬스케어", "의료", "병원", "환자", "건강"]],
  ["바이오·신약 R&D", ["biotech", "drug discovery", "clinical trial", "바이오", "신약", "의약", "임상"]],
  ["금융·결제·리스크", ["fintech", "finance", "banking", "payment", "insurance", "핀테크", "금융", "결제", "보험", "리스크"]],
  ["법무·컴플라이언스", ["legal tech", "legal", "compliance", "regulation", "리걸테크", "법률", "법무", "규제", "컴플라이언스"]],
  ["커머스·리테일 운영", ["ecommerce", "e-commerce", "commerce", "marketplace", "retail", "커머스", "이커머스", "마켓플레이스", "리테일", "유통"]],
  ["패션·소재 개발", ["fashion tech", "fashion", "textile", "fabric", "apparel", "materials", "패션", "텍스타일", "원단", "섬유", "의류", "소재"]],
  ["로봇·현장 자동화", ["robotics", "autonomous machine", "robot", "로보틱스", "로봇", "현장 자동화", "무인화"]],
  ["R&D·특허 분석", ["patent", "research", "r&d", "technology transfer", "특허", "연구개발", "기술사업화"]],
  ["음성·통화 처리", ["voice ai", "speech", "transcription", "음성 ai", "음성", "통화", "녹취"]],
  ["번역·언어 처리", ["translation", "localization", "multilingual", "번역", "현지화", "다국어"]],
  ["공간·3D 설계", ["spatial computing", "digital twin", "3d", "xr", "ar", "vr", "공간 컴퓨팅", "디지털 트윈", "가상현실"]],
  ["업무 워크플로 자동화", ["workflow automation", "business automation", "rpa", "ai agent", "agentic", "업무 자동화", "워크플로", "에이전트", "반복 업무"]],
  ["API·시스템 연동", ["api integration", "system integration", "api 연동", "시스템 연동", "erp 연동", "sdk"]]
];

const CATEGORY_FALLBACKS = [
  ["Healthcare", "의료·헬스케어 운영"],
  ["Medical", "의료·헬스케어 운영"],
  ["Advertising", "마케팅·광고 최적화"],
  ["Adtech", "마케팅·광고 최적화"],
  ["Education", "교육·학습 지원"],
  ["Edtech", "교육·학습 지원"],
  ["Fashion", "패션·소재 개발"],
  ["Manufacturing", "생산 공정 최적화"],
  ["Robotics", "로봇·현장 자동화"],
  ["Fintech", "금융·결제·리스크"],
  ["Commerce", "커머스·리테일 운영"],
  ["Retail", "커머스·리테일 운영"],
  ["Security", "보안·이상 탐지"],
  ["Analytics", "데이터 분석·예측"],
  ["SaaS", "업무 워크플로 자동화"]
];

export const TASK_KEYWORD_PENDING = "해결 Task 확인 필요";

export function taskKeywords(profile = {}, limit = 5) {
  const searchable = normalize([
    profile.name,
    profile.companyName,
    profile.company_name,
    profile.item,
    profile.category,
    profile.sector,
    profile.tagline,
    profile.description,
    profile.oneLiner,
    profile.one_liner,
    profile.serviceSummary,
    profile.service_summary,
    profile.aiIdeaSummary,
    profile.ai_idea_summary,
    profile.expertise,
    profile.domain,
    ...(profile.functions || []),
    ...(profile.tags || []),
    ...(profile.matchingKeywords || []),
    ...(profile.matching_keywords || [])
  ].filter(Boolean).join(" "));

  const matches = TASK_DEFINITIONS
    .filter(([, aliases]) => aliases.some((alias) => includesAlias(searchable, alias)))
    .map(([label]) => label);
  const category = String(profile.category || profile.sector || "");
  const fallbacks = CATEGORY_FALLBACKS
    .filter(([alias]) => normalize(category).includes(normalize(alias)))
    .map(([, label]) => label);
  const result = unique([...matches, ...fallbacks]).slice(0, Math.max(1, Number(limit) || 5));
  return result.length ? result : [TASK_KEYWORD_PENDING];
}

export function searchableTaskKeywords(profile = {}) {
  return taskKeywords(profile, 8).filter((item) => item !== TASK_KEYWORD_PENDING);
}

function includesAlias(searchable, alias) {
  const target = normalize(alias);
  if (!target) return false;
  if (target.includes(" ")) return searchable.includes(target);
  const tokens = searchable.match(/[\p{L}\p{N}+#]+/gu) || [];
  return tokens.some((token) => token === target || (target.length >= 4 && token.includes(target)));
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
  return (values || []).filter((value) => {
    const key = String(value || "").toLocaleLowerCase("ko-KR");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
