export const PUBLIC_BRIEF_LANGUAGE_STORAGE_KEY = "sparkclaw-public-brief-language-v1";

const COPY = Object.freeze({
  ko: Object.freeze({
    htmlLang: "ko",
    languageLabel: "페이지 언어",
    homeLabel: "SparkLabs·SparkClaw AI Arena 홈",
    gateLabel: "공개 AI 파트너 요청",
    memberLogin: "회원 로그인",
    kicker: "에이전틱 탐색 · 사람의 최종 검증",
    titleHtml: "찾는 기술·<br>해결할 문제부터 알려주세요",
    description: "문제 책임자와 성공 기준이 명확할수록 더 나은 후보를 찾을 수 있습니다. SparkLabs가 Brief를 검토한 뒤 적합한 다음 단계를 안내합니다.",
    agentStatus: "SPARK 에이전트 준비됨",
    agentCaption: "문제 입력부터 후보 연결까지",
    orchestrator: "오케스트레이터",
    nodes: [
      ["문제", "구조화"],
      ["후보", "탐색"],
      ["근거", "검증"],
      ["양측", "연결"]
    ],
    telemetry: ["제약조건 반영", "공개 근거 확인", "연락처 보호"],
    processLabel: "Brief 처리 과정",
    steps: [
      { title: "문제와 제약 검토", description: "목표·데이터·보안 조건을 구조화", status: "정의" },
      { title: "근거 기반 후보 선별", description: "역량과 적용 사례를 교차 확인", status: "검증" },
      { title: "대상 스타트업 동의 후 소개", description: "My Log에서 승인 뒤 SparkLabs가 안전하게 연결", status: "연결" }
    ],
    memberPrompt: "AI Arena 회원이신가요?",
    formKicker: "에이전트 입력",
    formTitle: "탐색 Brief 작성",
    secure: "보안 접수",
    fields: {
      organization: "조직명",
      website: "웹사이트",
      contactName: "담당자 이름",
      email: "업무 이메일",
      problem: "해결하려는 문제",
      successMetric: "성공 기준",
      constraints: "데이터·보안·연동 제약",
      deadline: "의사결정 시점",
      budgetRange: "예산 범위",
      procurementPath: "구매·법무 경로"
    },
    optional: "선택",
    placeholders: {
      website: "https://",
      problem: "현재 업무 흐름, 반복되는 병목과 영향을 구체적으로 적어주세요.",
      successMetric: "예: 처리시간 50% 단축, 정확도 95% 이상",
      constraints: "예: 온프레미스, 개인정보, SAP 연동",
      procurementPath: "예: PoC 후 구매위원회 검토"
    },
    budgets: {
      "": "논의 필요",
      under_10m: "1천만원 미만",
      "10m_30m": "1천만–3천만원",
      "30m_100m": "3천만–1억원",
      over_100m: "1억원 이상"
    },
    consent: "Brief 검토와 회신을 위해 입력 정보를 SparkLabs가 처리하는 데 동의합니다.",
    privacy: "입력 정보는 후보 탐색과 회신 목적으로만 사용하며, 접수일로부터 90일 후 보관 필요성을 재검토합니다. 소스코드, API 키, 고객 원문이나 영업비밀은 입력하지 마세요.",
    submit: "SparkLabs 검토 요청",
    honeypot: "회사 URL",
    progress: [
      "입력한 Brief의 필수 항목을 확인하고 있습니다.",
      "개인정보와 보안 입력 기준을 검증하고 있습니다.",
      "SparkLabs 검토 대기열에 안전하게 접수하고 있습니다."
    ],
    messages: {
      consentRequired: "Brief 검토를 위한 정보 처리 동의가 필요합니다.",
      submitting: "Brief를 안전하게 접수하기 시작했습니다.",
      success: "접수되었습니다. SparkLabs가 2영업일 이내 검토하며, 대상 스타트업이 My Log에서 요청을 승인한 경우에만 소개를 진행합니다.",
      failure: "Brief를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요."
    },
    login: {
      close: "로그인 창 닫기",
      network: "승인된 회원 네트워크",
      titleHtml: "로그인하고 발견하세요.<br>안전하게 협업하세요.",
      description: "기업 탐색, Community, Bounty와 My Log는 승인된 Arena 회원만 이용할 수 있습니다.",
      featuresLabel: "회원 전용 기능",
      features: ["회원 기업 탐색", "일정·검증된 혜택", "비공개 업무 공간"],
      routeLabel: "AI Arena 회원 경험",
      route: ["발견", "검증", "연결"],
      eyebrow: "회원 로그인",
      title: "AI Arena 회원 로그인",
      accessDescription: "Claw 멤버, 승인된 Arena 멤버, 기업 파트너와 SparkLabs 운영진을 위한 접근입니다.",
      email: "이메일",
      password: "비밀번호",
      passwordPlaceholder: "비밀번호 입력",
      submit: "로그인",
      trustLabel: "접근 원칙",
      trust: ["권한 기반 접근", "Double opt-in"],
      notReady: "로그인 설정이 준비되지 않았습니다.",
      starting: "로그인을 시작했습니다. 계정과 회원 권한을 확인합니다.",
      progress: [
        "계정 정보를 안전하게 확인하고 있습니다.",
        "회원 권한과 접근 범위를 확인하고 있습니다.",
        "AI Arena 데이터를 동기화하고 있습니다.",
        "개인화된 작업 공간을 준비하고 있습니다."
      ],
      failure: "로그인에 실패했습니다."
    }
  }),
  en: Object.freeze({
    htmlLang: "en",
    languageLabel: "Page language",
    homeLabel: "SparkLabs·SparkClaw AI Arena home",
    gateLabel: "Public AI partner request",
    memberLogin: "Member login",
    kicker: "AGENTIC DISCOVERY · HUMAN-VERIFIED",
    titleHtml: "Start with the technology you need—<br>or the problem you need solved.",
    description: "Clear ownership and success criteria lead to stronger candidates. SparkLabs reviews your Brief and guides you to the right next step.",
    agentStatus: "SPARK AGENT READY",
    agentCaption: "From problem input to verified candidates",
    orchestrator: "ORCHESTRATOR",
    nodes: [
      ["Problem", "Structure"],
      ["Candidate", "Discovery"],
      ["Evidence", "Verification"],
      ["Mutual", "Connection"]
    ],
    telemetry: ["Constraints included", "Public evidence checked", "Contact protected"],
    processLabel: "How your Brief is handled",
    steps: [
      { title: "Frame the problem and constraints", description: "Structure goals, data, security and operating conditions", status: "DEFINE" },
      { title: "Select evidence-based candidates", description: "Cross-check capabilities and deployment evidence", status: "VERIFY" },
      { title: "Introduce after mutual consent", description: "SparkLabs connects you only after the startup approves in My Log", status: "CONNECT" }
    ],
    memberPrompt: "Already an AI Arena member?",
    formKicker: "AGENT INPUT",
    formTitle: "Create a Discovery Brief",
    secure: "SECURE INTAKE",
    fields: {
      organization: "Organization",
      website: "Website",
      contactName: "Contact name",
      email: "Work email",
      problem: "Problem to solve",
      successMetric: "Success criteria",
      constraints: "Data, security & integration constraints",
      deadline: "Decision timeline",
      budgetRange: "Budget range",
      procurementPath: "Procurement & legal process"
    },
    optional: "optional",
    placeholders: {
      website: "https://",
      problem: "Describe the current workflow, recurring bottleneck and business impact.",
      successMetric: "e.g. Reduce processing time by 50%; achieve 95% accuracy",
      constraints: "e.g. On-premise, personal data, SAP integration",
      procurementPath: "e.g. Procurement review after a PoC"
    },
    budgets: {
      "": "Needs discussion",
      under_10m: "Under KRW 10M",
      "10m_30m": "KRW 10M–30M",
      "30m_100m": "KRW 30M–100M",
      over_100m: "KRW 100M+"
    },
    consent: "I agree that SparkLabs may process the submitted information to review and follow up on this Brief.",
    privacy: "Submitted information is used only to identify and contact suitable candidates, and its retention need is reviewed 90 days after submission. Do not include source code, API keys, customer data or confidential contract terms.",
    submit: "Request SparkLabs Review",
    honeypot: "Company URL",
    progress: [
      "Checking the required fields in your Brief.",
      "Validating privacy and security input requirements.",
      "Securely adding your Brief to the SparkLabs review queue."
    ],
    messages: {
      consentRequired: "Please consent to the processing of your information for Brief review.",
      submitting: "Securely submitting your Brief.",
      success: "Your Brief has been submitted. SparkLabs will review it within two business days, and an introduction proceeds only after the selected startup approves the request in My Log.",
      failure: "We could not submit your Brief. Please try again shortly."
    },
    login: {
      close: "Close login dialog",
      network: "APPROVED MEMBER NETWORK",
      titleHtml: "Sign in to discover.<br>Collaborate with confidence.",
      description: "Company discovery, Community, Bounty and My Log are available to approved Arena members.",
      featuresLabel: "Member-only features",
      features: ["Member company discovery", "Verified opportunities", "Private activity log"],
      routeLabel: "AI Arena member journey",
      route: ["DISCOVER", "VERIFY", "CONNECT"],
      eyebrow: "MEMBER LOGIN",
      title: "AI Arena Member Login",
      accessDescription: "Secure access for Claw members, approved Arena members, corporate partners and the SparkLabs team.",
      email: "Email",
      password: "Password",
      passwordPlaceholder: "Enter your password",
      submit: "Log in",
      trustLabel: "Access principles",
      trust: ["Role-based access", "Double opt-in"],
      notReady: "Member login is not available yet.",
      starting: "Signing in and checking your member access.",
      progress: [
        "Securely checking your account details.",
        "Confirming your member role and access scope.",
        "Synchronizing AI Arena data.",
        "Preparing your personalized workspace."
      ],
      failure: "Login failed."
    }
  })
});

export function normalizePublicBriefLanguage(value) {
  return String(value || "").trim().toLowerCase() === "en" ? "en" : "ko";
}

export function resolvePublicBriefLanguage({ search = "", stored = "" } = {}) {
  const requested = new URLSearchParams(String(search || "")).get("lang");
  if (requested === "en" || requested === "ko") return requested;
  return normalizePublicBriefLanguage(stored);
}

export function publicBriefCopy(language) {
  return COPY[normalizePublicBriefLanguage(language)];
}

export function publicBriefUrl(value, language) {
  const url = new URL(value);
  if (normalizePublicBriefLanguage(language) === "en") url.searchParams.set("lang", "en");
  else url.searchParams.delete("lang");
  return url.toString();
}
