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

const TASK_DETAIL_COPY = new Map([
  ["품질 검사", "이미지·영상·센서 데이터에서 불량 징후를 식별해 검사와 판정 업무를 빠르게 만듭니다."],
  ["생산 공정 최적화", "설비·생산 데이터를 연결해 공정 병목과 낭비를 찾고 현장 의사결정을 개선합니다."],
  ["수요·재고 예측", "판매·운영 데이터를 바탕으로 수요를 예측해 재고 부족과 과잉을 줄입니다."],
  ["물류·공급망 운영", "입고부터 배송까지 흐름을 추적해 공급망 지연과 반복 확인 업무를 줄입니다."],
  ["에너지·탄소 관리", "설비 에너지와 배출 데이터를 분석해 비용 절감과 탄소 관리 실행을 지원합니다."],
  ["문서 검토·정보 추출", "계약서·PDF·업무 문서에서 핵심 항목을 추출하고 검토 흐름을 자동화합니다."],
  ["고객 문의·상담 자동화", "반복 문의를 분류하고 답변 초안을 생성해 고객 응대 속도와 일관성을 높입니다."],
  ["영업·CRM 운영", "리드 발굴·분류·후속 연락을 연결해 영업팀이 우선 고객에 집중하도록 돕습니다."],
  ["마케팅·광고 최적화", "고객·콘텐츠·캠페인 데이터를 분석해 타깃 선정과 광고 운영을 정교하게 만듭니다."],
  ["콘텐츠 제작·편집", "기획부터 생성·편집·배포까지 반복 제작 단계를 줄여 콘텐츠 생산성을 높입니다."],
  ["이미지·영상 생성", "텍스트와 브랜드 조건을 반영해 활용 가능한 이미지·영상 시안을 생성합니다."],
  ["이미지·영상 분석", "이미지와 영상의 객체·행동·패턴을 찾아 사람이 확인하던 판독 업무를 보조합니다."],
  ["데이터 분석·예측", "흩어진 운영 데이터를 구조화해 핵심 지표와 다음 행동을 설명 가능한 형태로 제시합니다."],
  ["검색·지식 응답", "사내 문서와 지식에서 근거를 찾아 질문에 답하고 필요한 정보를 빠르게 연결합니다."],
  ["개발·코딩 자동화", "코드 작성·검토·테스트의 반복 작업을 줄여 개발팀의 실행 속도를 높입니다."],
  ["보안·이상 탐지", "로그와 거래 패턴에서 이상 징후를 탐지해 보안·사기 대응 우선순위를 제시합니다."],
  ["채용·인재 매칭", "직무 조건과 후보 역량을 구조화해 탐색·평가·매칭 과정을 효율화합니다."],
  ["교육·학습 지원", "학습자의 수준과 기록에 맞춰 콘텐츠·피드백·훈련 경로를 개인화합니다."],
  ["의료·헬스케어 운영", "의료·건강 데이터를 활용해 판독·기록·환자 관리의 반복 업무를 보조합니다."],
  ["바이오·신약 R&D", "연구·임상 데이터를 분석해 후보 탐색과 실험 의사결정 시간을 줄입니다."],
  ["금융·결제·리스크", "금융·결제 데이터를 분석해 심사·이상거래·리스크 관리 판단을 지원합니다."],
  ["법무·컴플라이언스", "법률·규제 문서를 구조화해 검토 누락을 줄이고 준수 여부 확인을 돕습니다."],
  ["커머스·리테일 운영", "상품·고객·판매 데이터를 연결해 추천·운영·구매 전환 의사결정을 개선합니다."],
  ["패션·소재 개발", "트렌드·상품·소재 데이터를 활용해 기획과 개발 과정의 탐색 시간을 줄입니다."],
  ["로봇·현장 자동화", "현장 인지와 제어를 자동화해 반복 작업과 위험 작업의 사람 의존도를 낮춥니다."],
  ["R&D·특허 분석", "논문·특허·기술 정보를 비교해 연구 방향과 권리화 기회를 빠르게 찾습니다."],
  ["음성·통화 처리", "통화와 음성을 텍스트·요약·분류로 전환해 기록과 후속 업무를 자동화합니다."],
  ["번역·언어 처리", "다국어 콘텐츠를 문맥과 용도에 맞게 변환해 현지화 업무를 줄입니다."],
  ["공간·3D 설계", "공간·설계 데이터를 3D와 시뮬레이션으로 연결해 검토와 협업을 빠르게 만듭니다."],
  ["업무 워크플로 자동화", "여러 도구에 흩어진 반복 업무를 에이전트가 순서대로 실행하도록 연결합니다."],
  ["API·시스템 연동", "기존 업무 시스템과 AI 기능을 API로 연결해 실제 운영 흐름 안에서 작동하게 합니다."],
  ["해결 Task 확인 필요", "팀이 해결하려는 고객 문제와 업무 흐름을 추가로 확인해야 합니다."]
]);

export const TASK_KEYWORD_PENDING = "해결 Task 확인 필요";

const TASK_SOURCE_GROUPS = [
  {
    label: "공개 역량",
    weight: 12,
    values: (profile) => [
      ...(profile.functions || []),
      ...(profile.tags || []),
      ...(profile.matchingKeywords || []),
      ...(profile.matching_keywords || []),
      ...(profile.products || []).flatMap((product) => [product?.name, product?.type, ...(product?.useCases || [])])
    ]
  },
  {
    label: "서비스·아이템",
    weight: 10,
    values: (profile) => [profile.item, profile.tagline, profile.oneLiner, profile.one_liner]
  },
  {
    label: "서비스 설명",
    weight: 8,
    values: (profile) => [
      profile.description,
      profile.serviceSummary,
      profile.service_summary,
      profile.aiIdeaSummary,
      profile.ai_idea_summary,
      profile.expertise,
      profile.investorProfile?.teamSummary,
      profile.investorProfile?.partneringSummary
    ]
  },
  {
    label: "업무·산업 맥락",
    weight: 3,
    values: (profile) => [profile.category, profile.sector, profile.domain]
  }
];

export function rankedTaskDetails(profile = {}, limit = TASK_DEFINITIONS.length) {
  const ranked = TASK_DEFINITIONS.map(([label, aliases], definitionIndex) => {
    let score = 0;
    const basis = [];
    const evidenceTerms = [];
    for (const source of TASK_SOURCE_GROUPS) {
      const values = source.values(profile).flat().map((value) => String(value || "").trim()).filter(Boolean);
      let sourceMatched = false;
      for (const value of values) {
        const searchable = normalize(value);
        if (!aliases.some((alias) => includesAlias(searchable, alias))) continue;
        sourceMatched = true;
        score += source.weight;
        if (value.length <= 64 && !evidenceTerms.some((item) => normalize(item) === normalize(value))) {
          evidenceTerms.push(value);
        }
      }
      if (sourceMatched) basis.push(source.label);
    }
    return { label, aliases, definitionIndex, score, basis, evidenceTerms: evidenceTerms.slice(0, 3) };
  });

  const category = String(profile.category || profile.sector || "");
  for (const [alias, label] of CATEGORY_FALLBACKS) {
    if (!normalize(category).includes(normalize(alias))) continue;
    const item = ranked.find((candidate) => candidate.label === label);
    if (!item) continue;
    item.score += 2;
    if (!item.basis.includes("산업 분류")) item.basis.push("산업 분류");
  }

  const requestedLimit = Number.isFinite(Number(limit))
    ? Math.max(1, Number(limit))
    : TASK_DEFINITIONS.length;
  const matches = ranked
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.definitionIndex - right.definitionIndex)
    .slice(0, requestedLimit)
    .map((item, index) => ({
      label: item.label,
      description: TASK_DETAIL_COPY.get(item.label) || "공개 프로필의 서비스 설명을 바탕으로 실제 해결 범위를 확인하고 있습니다.",
      rank: index + 1,
      basis: item.basis,
      evidenceTerms: item.evidenceTerms
    }));

  return matches.length
    ? matches
    : [{
        label: TASK_KEYWORD_PENDING,
        description: TASK_DETAIL_COPY.get(TASK_KEYWORD_PENDING),
        rank: 1,
        basis: [],
        evidenceTerms: []
      }];
}

export function taskKeywords(profile = {}, limit = 5) {
  return rankedTaskDetails(profile, limit).map((item) => item.label);
}

export function searchableTaskKeywords(profile = {}) {
  return taskKeywords(profile, 8).filter((item) => item !== TASK_KEYWORD_PENDING);
}

export function taskDetails(profile = {}, limit = 3) {
  return rankedTaskDetails(profile, limit);
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
