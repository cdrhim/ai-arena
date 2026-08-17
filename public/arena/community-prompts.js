const PARTNER_ROLES = new Set(["b2b", "b2b_partner"]);
const STAFF_ROLES = new Set(["admin", "sparklabs"]);

export function personalizedCommunityPrompts(context = {}) {
  const profile = communityPromptProfile(context);
  if (profile.kind === "partner") return partnerPrompts(profile);
  if (profile.kind === "staff") return staffPrompts(profile);
  return founderPrompts(profile);
}

export function communityPromptProfile(context = {}) {
  const hub = context?.hub || {};
  const viewer = hub.viewer || context?.viewer || {};
  const team = hub.viewerTeam || null;
  const partner = hub.partnerProfile || null;
  const role = String(viewer.role || "member").trim().toLowerCase();
  const organizationName = clean(
    partner?.organizationName
      || team?.companyName
      || team?.name
      || viewer.organization
      || (STAFF_ROLES.has(role) || viewer.canScore ? "SparkLabs" : "우리 팀"),
    80
  );
  const sector = clean(team?.sector || partner?.focusCategories?.[0] || "", 80);
  const summary = clean(
    team?.oneLiner
      || team?.serviceSummary
      || partner?.thesis
      || partner?.defaultDiscoveryPrompt
      || "",
    220
  );
  const priorities = partnerPriorities(partner);
  const kind = PARTNER_ROLES.has(role)
    ? "partner"
    : STAFF_ROLES.has(role) || viewer.canScore
      ? "staff"
      : "founder";
  return { kind, organizationName, sector, summary, priorities };
}

function founderPrompts(profile) {
  const productContext = profile.summary || `${profile.organizationName}의 제품·서비스`;
  const audienceContext = profile.sector ? `${profile.sector} 고객` : "핵심 고객";
  const delegatedWork = delegatedWorkExamples(profile);
  return [
    prompt(
      "preot-finance-ops",
      "회계·재무 운영, 다들 어떻게 하나요?",
      `${profile.organizationName}의 월 마감·자금 관리 경험을 묻기`,
      `${profile.organizationName}의 현재 단계에서 가장 궁금한 회계·재무 운영:\n\n현재 직접 처리하거나 외부에 맡기는 업무:\n\n월 마감·세무·자금 흐름에서 반복되는 어려움:\n\n지금 사용 중인 도구 또는 대행 방식:\n\n효과가 있었거나 피하고 싶은 방법:\n\n비슷한 단계의 팀에게 묻고 싶은 질문:`,
      "여러 창업팀이 회계·재무 운영 방식을 서로 듣고 싶어 하는 질문입니다. 업체명이나 계약 금액 같은 비공개 정보 대신 팀의 단계, 맡기는 범위, 선택 기준을 적어주세요.",
      "작성 힌트 · 왼쪽 초안에 적용"
    ),
    prompt(
      "preot-go-to-market",
      "개발팀의 마케팅, 어디서 시작했나요?",
      `${audienceContext}을 만난 채널과 시행착오 공유`,
      `${profile.organizationName}의 제품·서비스 맥락:\n${productContext}\n\n지금 만나려는 고객:\n${audienceContext}\n\n직접 해본 마케팅·세일즈 채널:\n\n시간 또는 비용 대비 반응이 있었던 시도:\n\n내부에서 하기 어렵거나 외부 도움이 필요한 부분:\n\n비슷한 고객을 만나는 팀에게 묻고 싶은 질문:`,
      "개발 중심 팀들이 마케팅과 고객 획득 경험을 나누기 위한 질문입니다. 성과 홍보보다 실제 채널, 투입한 노력, 배운 점을 중심으로 적어주세요.",
      "작성 힌트 · 왼쪽 초안에 적용"
    ),
    prompt(
      "preot-nondev-outsourcing",
      "비개발 업무, 어디까지 외주로 맡기나요?",
      `${delegatedWork}의 위탁 기준과 노하우 묻기`,
      `${profile.organizationName}에서 외주·위탁을 고민하는 비개발 업무:\n${delegatedWork}\n\n내부에서 직접 하기 어려운 이유:\n\n파트너 또는 프리랜서를 고를 때 보는 기준:\n\n업무 범위·품질·커뮤니케이션을 관리하는 방식:\n\n직접 해보며 배운 점 또는 아직 막힌 점:\n\n비슷한 팀에게 추천받거나 묻고 싶은 것:`,
      "비개발 업무를 어떤 기준으로 외주·위탁하는지 경험을 나누기 위한 질문입니다. 특정 업체를 홍보하기보다 맡긴 범위, 검수 기준, 실패를 줄인 방법을 공유해 주세요.",
      "작성 힌트 · 왼쪽 초안에 적용"
    )
  ];
}

function partnerPrompts(profile) {
  const primaryPriority = profile.priorities[0] || profile.sector || "현재 우선 검토 과제";
  const secondaryPriorities = profile.priorities.slice(1, 3).join(" · ") || "연계 가능한 후속 과제";
  return [
    prompt(
      "partner-ai-experience",
      "검증한 AI 활용 사례",
      `${profile.organizationName}의 현장 적용과 배운 점`,
      `${profile.organizationName}이 검토하거나 적용한 AI·자동화 영역:\n${primaryPriority}\n\n적용한 현장 또는 업무:\n\n확인한 효과와 측정 방법:\n\n도입 과정에서 막힌 조건:\n\n스타트업과 함께 더 검증하고 싶은 점:`,
      "내부 기밀은 제외하고 적용 현장, 성공 기준, 도입 제약을 중심으로 작성하면 참가기업이 협업 가능성을 판단하기 쉽습니다."
    ),
    prompt(
      "partner-pilot",
      "현재 찾는 실증 과제",
      `${primaryPriority} 협업 조건 정리`,
      `${profile.organizationName}이 해결하려는 우선 과제:\n${primaryPriority}\n\n현재 업무 흐름과 반복되는 병목:\n\n실증에서 확인할 성공 기준:\n\n사용 가능한 데이터·현장·담당 조직:\n\n반드시 지켜야 할 보안·연동 조건:\n\n희망 일정과 다음 의사결정:`,
      `현재 프로필의 우선 과제인 ‘${primaryPriority}’를 기준으로 초안을 만들었습니다. 문제와 성공 기준을 수치로 구체화해 주세요.`
    ),
    prompt(
      "partner-collaboration",
      "스타트업 협업 조건",
      `${secondaryPriorities}까지 연결 가능성 공유`,
      `${profile.organizationName}이 찾는 스타트업 역량:\n${secondaryPriorities}\n\n제공할 수 있는 실증 환경 또는 지원:\n\n필수 기술·보안·지역 조건:\n\n선호하는 협업 방식 (PoC·구매·공동개발 등):\n\n검토 담당자와 의사결정 절차:\n\n참가기업에 받고 싶은 제안:`,
      "스타트업이 바로 응답할 수 있도록 필요한 역량과 함께 제공 가능한 실증 환경, 의사결정 절차를 같이 알려주세요."
    )
  ];
}

function staffPrompts(profile) {
  return [
    prompt(
      "staff-insight",
      "프로그램 인사이트 공유",
      "여러 팀에게 도움이 될 반복 패턴",
      `${profile.organizationName} 운영 중 발견한 반복 패턴:\n\n관찰한 팀·시장 맥락:\n\n잘 작동한 접근:\n\n주의해야 할 점:\n\n멤버들이 바로 시도할 다음 행동:`,
      "특정 팀의 비공개 정보는 제외하고 여러 팀이 재사용할 수 있는 실행 원칙으로 정리해 주세요."
    ),
    prompt(
      "staff-update",
      "커뮤니티에 공유할 소식",
      "멤버가 알아야 할 변화와 행동",
      `공유할 변화 또는 기회:\n\n누구에게 해당하는지:\n\n왜 지금 확인해야 하는지:\n\n멤버가 해야 할 행동:\n\n기한·링크·담당자 (필요한 경우):`,
      "공지 자체보다 대상, 영향, 해야 할 행동을 먼저 적으면 읽고 바로 움직이기 쉽습니다."
    ),
    prompt(
      "staff-connect",
      "연결이 필요한 팀 찾기",
      "수요와 제공 역량을 명확하게 연결",
      `찾는 팀 또는 역량:\n\n연결하려는 문제·파트너·기회:\n\n적합성을 판단할 조건:\n\n상대에게 제공할 수 있는 것:\n\n희망 일정과 연결 방식:`,
      "연결 대상과 목적뿐 아니라 상대가 얻는 가치와 적합성 기준까지 함께 적어주세요."
    )
  ];
}

function prompt(id, label, hint, template, guide, origin = "프로필 기반 운영진 가이드") {
  return { id, label, hint, template, guide, origin };
}

function delegatedWorkExamples(profile) {
  const haystack = `${profile.sector} ${profile.summary}`.toLowerCase();
  if (includesAny(haystack, ["health", "medical", "bio", "의료", "헬스", "바이오"])) {
    return "인허가·보험·의료기관 영업·콘텐츠 검수";
  }
  if (includesAny(haystack, ["fashion", "commerce", "retail", "food", "패션", "커머스", "리테일", "푸드"])) {
    return "콘텐츠 제작·물류·고객지원·해외 운영";
  }
  if (includesAny(haystack, ["manufact", "robot", "hardware", "mobility", "제조", "로봇", "하드웨어", "모빌리티"])) {
    return "인증·조달·현장 운영·기술 문서";
  }
  if (includesAny(haystack, ["saas", "software", "agent", "ai", "adtech", "소프트웨어", "에이전트"])) {
    return "콘텐츠·B2B 세일즈 운영·고객지원·채용";
  }
  return "법무·채용·마케팅·고객지원·운영";
}

function includesAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
}

function partnerPriorities(partner) {
  const ranked = Array.isArray(partner?.priorities)
    ? [...partner.priorities]
        .sort((left, right) => Number(left?.rank || 999) - Number(right?.rank || 999))
        .map((item) => clean(item?.title, 90))
        .filter(Boolean)
    : [];
  if (ranked.length) return ranked.slice(0, 4);
  return Array.isArray(partner?.focusCategories)
    ? partner.focusCategories.map((item) => clean(item, 90)).filter(Boolean).slice(0, 4)
    : [];
}

function clean(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
