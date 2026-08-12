const ICON_DEFINITIONS = {
  fashion: {
    label: "패션·디자인",
    keywords: ["fashion", "design", "apparel", "textile", "패션", "디자인", "의류", "섬유", "패턴", "스타일"],
    svg: '<path d="M9.5 6.5a2.5 2.5 0 1 1 4.7 1.2L20 12l-2.2 3-2.3-1.4V20h-7v-6.4L6.2 15 4 12l5.5-4.1"/><path d="M9 12h6"/>'
  },
  health: {
    label: "헬스케어·바이오",
    keywords: ["healthcare", "medical", "medtech", "medicaltech", "bio", "wellness", "헬스", "의료", "메디컬", "건강", "바이오", "병원", "환자"],
    svg: '<path d="M20.8 8.7c0 5.4-8.8 10.3-8.8 10.3S3.2 14.1 3.2 8.7A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.4Z"/><path d="M6.7 11.5h2.5l1.2-2.7 2.2 5.3 1.3-2.6h3.4"/>'
  },
  marketing: {
    label: "광고·콘텐츠",
    keywords: ["advertising", "adtech", "marketing", "media", "content", "creator", "광고", "마케팅", "미디어", "콘텐츠", "브랜드", "크리에이터"],
    svg: '<path d="M4 10v4h3l8 4V6l-8 4H4Z"/><path d="m7 14 1.5 5h3L10 15.5M18 9.5c1.1.7 1.7 1.5 1.7 2.5s-.6 1.8-1.7 2.5"/>'
  },
  education: {
    label: "교육·학습",
    keywords: ["education", "edtech", "learning", "training", "교육", "에듀", "학습", "러닝", "튜터", "훈련"],
    svg: '<path d="M4 5.5h5.5A2.5 2.5 0 0 1 12 8v11a3 3 0 0 0-3-3H4V5.5ZM20 5.5h-5.5A2.5 2.5 0 0 0 12 8v11a3 3 0 0 1 3-3h5V5.5Z"/>'
  },
  analytics: {
    label: "데이터·분석",
    keywords: ["data analytics", "analytics", "forecast", "insight", "데이터 분석", "애널리틱스", "분석", "예측", "인사이트", "리서치"],
    svg: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="m4 8 6-4 6 6 5-5"/>'
  },
  robotics: {
    label: "로보틱스·산업",
    keywords: ["robot", "robotics", "mobility", "hardware", "manufacturing", "factory", "logistics", "로봇", "로보틱스", "모빌리티", "하드웨어", "제조", "공장", "물류"],
    svg: '<rect x="6" y="7" width="12" height="11" rx="3"/><path d="M12 3v4M9.5 12h.01M14.5 12h.01M9 15h6M3 10h3M18 10h3"/>'
  },
  finance: {
    label: "금융·핀테크",
    keywords: ["fintech", "finance", "financial", "payment", "insurance", "banking", "금융", "핀테크", "결제", "보험", "은행", "자산"],
    svg: '<ellipse cx="9" cy="7" rx="5" ry="2.5"/><path d="M4 7v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7M4 11v4c0 1.4 2.2 2.5 5 2.5 1 0 2-.2 2.7-.5"/><path d="M15.5 12.5h5v6h-5zM18 10.5v2"/>'
  },
  security: {
    label: "보안·신뢰",
    keywords: ["security", "cyber", "privacy", "fraud", "compliance", "보안", "사이버", "개인정보", "인증", "컴플라이언스", "이상 탐지"],
    svg: '<path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>'
  },
  climate: {
    label: "기후·에너지",
    keywords: ["climate", "energy", "sustainability", "carbon", "environment", "green", "기후", "에너지", "탄소", "환경", "친환경", "지속가능"],
    svg: '<path d="M19.5 4.5C12 4.5 6 8 6 14c0 3.3 2.2 5.5 5.2 5.5 6 0 8.3-7.5 8.3-15Z"/><path d="M4 20c3.5-5.5 7-8 12-10"/>'
  },
  commerce: {
    label: "커머스·리테일",
    keywords: ["commerce", "e-commerce", "marketplace", "retail", "shopping", "커머스", "이커머스", "마켓플레이스", "리테일", "쇼핑", "유통"],
    svg: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>'
  },
  saas: {
    label: "AI·SaaS",
    keywords: ["saas", "ai agent", "agentic", "workflow", "automation", "llm", "artificial intelligence", "ai", "에이전트", "자동화", "워크플로", "생성형", "인공지능"],
    svg: '<circle cx="12" cy="6" r="2.5"/><circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="m10.7 8.2-3.4 6.6M13.3 8.2l3.4 6.6M8.5 17h7"/>'
  },
  general: {
    label: "기술·서비스",
    keywords: [],
    svg: '<path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/>'
  }
};

const ICON_ORDER = ["fashion", "health", "marketing", "education", "analytics", "robotics", "finance", "security", "climate", "commerce", "saas"];

function companySearchText(company = {}) {
  return [
    company.category,
    company.tagline,
    company.description,
    company.serviceSummary,
    company.aiIdeaSummary,
    ...(Array.isArray(company.functions) ? company.functions : []),
    ...(Array.isArray(company.tags) ? company.tags : [])
  ].filter(Boolean).join(" ").toLowerCase();
}

function hasKeyword(searchText, keyword) {
  if (keyword === "ai") return /(^|[^a-z0-9])ai([^a-z0-9]|$)/i.test(searchText);
  return searchText.includes(keyword);
}

export function companyIconKind(company = {}) {
  const searchText = companySearchText(company);
  return ICON_ORDER.find((kind) => ICON_DEFINITIONS[kind].keywords.some((keyword) => hasKeyword(searchText, keyword))) || "general";
}

export function companyIconLabel(company = {}) {
  return ICON_DEFINITIONS[companyIconKind(company)].label;
}

export function companyIconMarkup(company = {}) {
  const kind = companyIconKind(company);
  const icon = ICON_DEFINITIONS[kind];
  return `<span class="market-team-monogram market-team-icon" data-company-icon="${kind}" role="img" aria-label="${icon.label} 아이콘"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icon.svg}</svg></span>`;
}
