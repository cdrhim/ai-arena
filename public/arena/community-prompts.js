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
  return [
    prompt(
      "ai-experience",
      "우리 제품의 AI 활용 경험",
      `${profile.organizationName}의 실제 적용과 한계`,
      `${profile.organizationName}에서 시도한 AI 또는 자동화 도구:\n\n적용한 제품·업무:\n${productContext}\n\n실제로 확인한 효과:\n\n예상과 달랐던 한계:\n\n커뮤니티에 묻고 싶은 점:`,
      "제품명보다 어떤 업무에 적용했고 무엇이 달라졌는지부터 적어보세요. 수치나 실제 사용자 반응이 있으면 함께 써주세요."
    ),
    prompt(
      "shipped",
      "최근 출시·실험 공유",
      `${profile.organizationName}의 결과물에 피드백 받기`,
      `${profile.organizationName}이 최근 출시하거나 실험한 것:\n\n대상 사용자와 해결하려는 문제:\n${productContext}\n\n이번 버전에서 달라진 점:\n\n현재까지 확인한 반응 또는 데이터:\n\n커뮤니티에서 확인하고 싶은 점:\n\n데모·링크 (선택):`,
      "완성된 홍보문보다 이번에 무엇을 바꿨고 어떤 피드백이 필요한지를 구체적으로 적어보세요."
    ),
    prompt(
      "first-customers",
      "첫 고객을 만든 방법",
      `${audienceContext}을 만난 과정을 공유`,
      `${profile.organizationName}이 처음 정의한 핵심 고객:\n${audienceContext}\n\n처음 고객을 만난 경로:\n\n대화를 계약·실험으로 바꾼 계기:\n\n효과가 있었던 메시지 또는 제안:\n\n다시 한다면 바꿀 점:\n\n다른 창업자에게 묻고 싶은 점:`,
      "성공 결과만 쓰기보다 첫 접점, 전환 계기, 반복 가능한 방법을 순서대로 적어보세요."
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

function prompt(id, label, hint, template, guide) {
  return { id, label, hint, template, guide };
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
