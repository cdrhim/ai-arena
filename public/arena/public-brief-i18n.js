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
        googleAdmin: "SparkLabs 관리자 Google 로그인",
        googleAdminNote: "@sparklabs.co.kr 업무용 Google 계정만 로그인할 수 있습니다.",
        googleNotReady: "Google 관리자 로그인이 아직 활성화되지 않았습니다.",
        googleStarting: "Google 보안 로그인으로 이동합니다.",
        googleDomainRequired: "sparklabs.co.kr 업무용 Google 계정만 사용할 수 있습니다.",
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
        googleAdmin: "SparkLabs admin Google login",
        googleAdminNote: "Only @sparklabs.co.kr Google Workspace accounts can sign in.",
        googleNotReady: "Google admin login is not enabled yet.",
        googleStarting: "Opening secure Google sign-in.",
        googleDomainRequired: "Only a sparklabs.co.kr Google Workspace account can be used here.",
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
  }),
  ar: Object.freeze({
    htmlLang: "ar",
    direction: "rtl",
    languageLabel: "لغة الصفحة",
    homeLabel: "الصفحة الرئيسية لـ SparkLabs وSparkClaw AI Arena",
    gateLabel: "طلب شريك ذكاء اصطناعي عام",
    memberLogin: "دخول الأعضاء",
    kicker: "اكتشاف ذكي · تحقق بشري نهائي",
    titleHtml: "ابدأ بالتقنية التي تبحث عنها—<br>أو بالمشكلة التي تريد حلها.",
    description: "كلما كانت مسؤولية المشكلة ومعايير النجاح أوضح، استطعنا العثور على مرشحين أفضل. يراجع SparkLabs موجزك ويوجهك إلى الخطوة المناسبة التالية.",
    agentStatus: "وكيل SPARK جاهز",
    agentCaption: "من صياغة المشكلة إلى مرشحين موثّقين",
    orchestrator: "المنسّق",
    nodes: [["المشكلة", "صياغة"], ["المرشحون", "اكتشاف"], ["الأدلة", "تحقق"], ["الطرفان", "ربط"]],
    telemetry: ["تضمين القيود", "فحص الأدلة العامة", "حماية بيانات التواصل"],
    processLabel: "آلية معالجة الموجز",
    steps: [
      { title: "تحديد المشكلة والقيود", description: "تنظيم الأهداف والبيانات والأمن وظروف التشغيل", status: "تحديد" },
      { title: "اختيار مرشحين مبني على الأدلة", description: "مراجعة القدرات وأدلة التطبيق الفعلي", status: "تحقق" },
      { title: "التعريف بعد موافقة الطرفين", description: "يجري SparkLabs الربط فقط بعد موافقة الشركة الناشئة في My Log", status: "ربط" }
    ],
    memberPrompt: "هل أنت عضو في AI Arena؟",
    formKicker: "مدخلات الوكيل",
    formTitle: "إنشاء موجز اكتشاف",
    secure: "استلام آمن",
    fields: {
      organization: "اسم المؤسسة", website: "الموقع الإلكتروني", contactName: "اسم المسؤول", email: "البريد المهني",
      problem: "المشكلة المطلوب حلها", successMetric: "معايير النجاح", constraints: "قيود البيانات والأمن والتكامل",
      deadline: "موعد اتخاذ القرار", budgetRange: "نطاق الميزانية", procurementPath: "مسار الشراء والشؤون القانونية"
    },
    optional: "اختياري",
    placeholders: {
      website: "https://",
      problem: "صف سير العمل الحالي، والاختناق المتكرر، وأثره على الأعمال.",
      successMetric: "مثال: خفض وقت المعالجة 50% وتحقيق دقة 95%",
      constraints: "مثال: تشغيل داخلي، بيانات شخصية، تكامل SAP",
      procurementPath: "مثال: مراجعة المشتريات بعد إثبات المفهوم"
    },
    budgets: { "": "تحتاج إلى نقاش", under_10m: "أقل من 10 ملايين وون", "10m_30m": "10–30 مليون وون", "30m_100m": "30–100 مليون وون", over_100m: "100 مليون وون فأكثر" },
    consent: "أوافق على معالجة SparkLabs للمعلومات المقدمة بهدف مراجعة هذا الموجز والتواصل بشأنه.",
    privacy: "تُستخدم المعلومات المقدمة فقط للعثور على مرشحين مناسبين والتواصل معهم، وتُراجع ضرورة الاحتفاظ بها بعد 90 يوماً. لا تُدخل شيفرات المصدر أو مفاتيح API أو بيانات العملاء أو شروط العقود السرية.",
    submit: "طلب مراجعة SparkLabs",
    honeypot: "رابط الشركة",
    progress: ["جارٍ فحص الحقول المطلوبة في موجزك.", "جارٍ التحقق من متطلبات الخصوصية والأمن.", "جارٍ إضافة موجزك بأمان إلى قائمة مراجعة SparkLabs."],
    messages: {
      consentRequired: "يرجى الموافقة على معالجة المعلومات لمراجعة الموجز.",
      submitting: "جارٍ إرسال موجزك بأمان.",
      success: "تم استلام موجزك. سيراجعه SparkLabs خلال يومي عمل، ولن يتم التعريف إلا بعد موافقة الشركة الناشئة المختارة في My Log.",
      failure: "تعذر إرسال الموجز. يرجى المحاولة مرة أخرى بعد قليل."
    },
    login: {
      close: "إغلاق نافذة الدخول", network: "شبكة أعضاء معتمدة", titleHtml: "سجّل الدخول واكتشف.<br>وتعاون بثقة.",
      description: "اكتشاف الشركات وCommunity وBounty وMy Log متاحة لأعضاء Arena المعتمدين.",
      featuresLabel: "مزايا الأعضاء", features: ["اكتشاف شركات الأعضاء", "فرص موثّقة", "سجل نشاط خاص"],
      routeLabel: "رحلة عضو AI Arena", route: ["اكتشاف", "تحقق", "ربط"], eyebrow: "دخول الأعضاء", title: "دخول أعضاء AI Arena",
      accessDescription: "دخول آمن لأعضاء Claw وأعضاء Arena المعتمدين وشركاء الشركات وفريق SparkLabs.",
      email: "البريد الإلكتروني", password: "كلمة المرور", passwordPlaceholder: "أدخل كلمة المرور", submit: "تسجيل الدخول",
      trustLabel: "مبادئ الوصول", trust: ["صلاحيات حسب الدور", "موافقة مزدوجة"], notReady: "تسجيل دخول الأعضاء غير متاح بعد.",
      starting: "جارٍ تسجيل الدخول والتحقق من صلاحيات العضوية.",
      progress: ["جارٍ التحقق الآمن من بيانات الحساب.", "جارٍ تأكيد دور العضو ونطاق الوصول.", "جارٍ مزامنة بيانات AI Arena.", "جارٍ إعداد مساحة العمل المخصصة."],
      failure: "فشل تسجيل الدخول."
    }
  }),
  ja: Object.freeze({
    htmlLang: "ja",
    direction: "ltr",
    languageLabel: "ページ言語",
    homeLabel: "SparkLabs・SparkClaw AI Arena ホーム",
    gateLabel: "公開AIパートナー探索依頼",
    memberLogin: "会員ログイン",
    kicker: "エージェント探索 · 人による最終検証",
    titleHtml: "探している技術、または<br>解決したい課題から教えてください。",
    description: "課題の責任者と成功基準が明確なほど、より適切な候補を見つけられます。SparkLabsがBriefを確認し、次のステップをご案内します。",
    agentStatus: "SPARKエージェント準備完了",
    agentCaption: "課題入力から候補接続まで",
    orchestrator: "オーケストレーター",
    nodes: [["課題", "構造化"], ["候補", "探索"], ["根拠", "検証"], ["双方", "接続"]],
    telemetry: ["制約を反映", "公開根拠を確認", "連絡先を保護"],
    processLabel: "Briefの処理プロセス",
    steps: [
      { title: "課題と制約を整理", description: "目標・データ・セキュリティ・運用条件を構造化", status: "定義" },
      { title: "根拠に基づき候補を選定", description: "能力と導入実績を照合", status: "検証" },
      { title: "双方の同意後に紹介", description: "スタートアップがMy Logで承認した後にSparkLabsが接続", status: "接続" }
    ],
    memberPrompt: "すでにAI Arena会員ですか？",
    formKicker: "エージェント入力",
    formTitle: "探索Briefを作成",
    secure: "安全な受付",
    fields: {
      organization: "組織名", website: "ウェブサイト", contactName: "担当者名", email: "業務用メール",
      problem: "解決したい課題", successMetric: "成功基準", constraints: "データ・セキュリティ・連携上の制約",
      deadline: "意思決定時期", budgetRange: "予算範囲", procurementPath: "購買・法務プロセス"
    },
    optional: "任意",
    placeholders: {
      website: "https://", problem: "現在の業務フロー、繰り返すボトルネック、事業への影響を具体的にご記入ください。",
      successMetric: "例：処理時間を50%短縮、精度95%以上", constraints: "例：オンプレミス、個人情報、SAP連携",
      procurementPath: "例：PoC後に購買委員会で審査"
    },
    budgets: { "": "要相談", under_10m: "1,000万ウォン未満", "10m_30m": "1,000万～3,000万ウォン", "30m_100m": "3,000万～1億ウォン", over_100m: "1億ウォン以上" },
    consent: "Briefの審査と連絡のため、SparkLabsが入力情報を処理することに同意します。",
    privacy: "入力情報は候補探索と連絡の目的にのみ使用し、受付から90日後に保管の必要性を再確認します。ソースコード、APIキー、顧客データ、機密契約条件は入力しないでください。",
    submit: "SparkLabsに審査を依頼",
    honeypot: "会社URL",
    progress: ["Briefの必須項目を確認しています。", "プライバシーとセキュリティ要件を検証しています。", "SparkLabsの審査キューへ安全に登録しています。"],
    messages: {
      consentRequired: "Brief審査のための情報処理に同意してください。", submitting: "Briefを安全に送信しています。",
      success: "受け付けました。SparkLabsが2営業日以内に審査し、対象スタートアップがMy Logで承認した場合にのみ紹介します。",
      failure: "Briefを送信できませんでした。しばらくしてからもう一度お試しください。"
    },
    login: {
      close: "ログイン画面を閉じる", network: "承認済み会員ネットワーク", titleHtml: "ログインして発見し、<br>安心して協業しましょう。",
      description: "企業探索、Community、Bounty、My Logは承認済みArena会員のみ利用できます。",
      featuresLabel: "会員限定機能", features: ["会員企業の探索", "検証済み機会", "非公開アクティビティログ"],
      routeLabel: "AI Arena会員ジャーニー", route: ["発見", "検証", "接続"], eyebrow: "会員ログイン", title: "AI Arena会員ログイン",
      accessDescription: "Clawメンバー、承認済みArena会員、企業パートナー、SparkLabs運営チーム向けの安全なアクセスです。",
      email: "メール", password: "パスワード", passwordPlaceholder: "パスワードを入力", submit: "ログイン",
      trustLabel: "アクセス原則", trust: ["ロールベースアクセス", "双方同意"], notReady: "会員ログインはまだ利用できません。",
      starting: "ログインし、会員アクセスを確認しています。",
      progress: ["アカウント情報を安全に確認しています。", "会員ロールとアクセス範囲を確認しています。", "AI Arenaデータを同期しています。", "パーソナライズされたワークスペースを準備しています。"],
      failure: "ログインに失敗しました。"
    }
  }),
  zh: Object.freeze({
    htmlLang: "zh-CN",
    direction: "ltr",
    languageLabel: "页面语言",
    homeLabel: "SparkLabs·SparkClaw AI Arena 首页",
    gateLabel: "公开AI合作伙伴需求",
    memberLogin: "会员登录",
    kicker: "智能代理探索 · 人工最终验证",
    titleHtml: "请从您需要的技术，或<br>希望解决的问题开始。",
    description: "问题负责人和成功标准越清晰，我们越能找到合适的候选团队。SparkLabs将审核您的Brief，并指引下一步。",
    agentStatus: "SPARK智能代理已就绪",
    agentCaption: "从问题输入到候选团队连接",
    orchestrator: "编排器",
    nodes: [["问题", "结构化"], ["候选", "探索"], ["证据", "验证"], ["双方", "连接"]],
    telemetry: ["纳入约束", "核验公开证据", "保护联系方式"],
    processLabel: "Brief处理流程",
    steps: [
      { title: "梳理问题与约束", description: "结构化目标、数据、安全与运营条件", status: "定义" },
      { title: "基于证据筛选候选", description: "交叉核验能力与落地案例", status: "验证" },
      { title: "双方同意后介绍", description: "初创公司在My Log批准后，由SparkLabs安全连接", status: "连接" }
    ],
    memberPrompt: "已经是AI Arena会员？",
    formKicker: "智能代理输入",
    formTitle: "创建探索Brief",
    secure: "安全提交",
    fields: {
      organization: "组织名称", website: "网站", contactName: "联系人姓名", email: "工作邮箱", problem: "希望解决的问题",
      successMetric: "成功标准", constraints: "数据、安全与集成约束", deadline: "决策时间", budgetRange: "预算范围", procurementPath: "采购与法务流程"
    },
    optional: "可选",
    placeholders: {
      website: "https://", problem: "请具体描述当前工作流程、反复出现的瓶颈及其业务影响。",
      successMetric: "例如：处理时间缩短50%，准确率达到95%以上", constraints: "例如：本地部署、个人信息、SAP集成",
      procurementPath: "例如：PoC后进入采购委员会评审"
    },
    budgets: { "": "需要讨论", under_10m: "低于1,000万韩元", "10m_30m": "1,000万–3,000万韩元", "30m_100m": "3,000万–1亿韩元", over_100m: "1亿韩元以上" },
    consent: "我同意SparkLabs为审核并回复此Brief而处理所提交的信息。",
    privacy: "提交的信息仅用于寻找合适候选团队和后续联系，并将在提交90天后重新评估保留必要性。请勿输入源代码、API密钥、客户原始数据或机密合同条款。",
    submit: "请求SparkLabs审核",
    honeypot: "公司网址",
    progress: ["正在检查Brief的必填项。", "正在验证隐私与安全输入要求。", "正在将Brief安全加入SparkLabs审核队列。"],
    messages: {
      consentRequired: "请同意为Brief审核处理您的信息。", submitting: "正在安全提交您的Brief。",
      success: "已成功提交。SparkLabs将在两个工作日内审核，只有目标初创公司在My Log批准后才会进行介绍。",
      failure: "Brief提交失败，请稍后重试。"
    },
    login: {
      close: "关闭登录窗口", network: "已批准会员网络", titleHtml: "登录并发现机会。<br>安心开展合作。",
      description: "企业探索、Community、Bounty和My Log仅向获批Arena会员开放。",
      featuresLabel: "会员专属功能", features: ["会员企业探索", "已验证机会", "私密活动记录"],
      routeLabel: "AI Arena会员路径", route: ["发现", "验证", "连接"], eyebrow: "会员登录", title: "AI Arena会员登录",
      accessDescription: "为Claw成员、获批Arena会员、企业合作伙伴和SparkLabs运营团队提供安全访问。",
      email: "邮箱", password: "密码", passwordPlaceholder: "请输入密码", submit: "登录",
      trustLabel: "访问原则", trust: ["基于角色的访问", "双方同意"], notReady: "会员登录尚未开放。",
      starting: "正在登录并检查会员权限。",
      progress: ["正在安全核验账户信息。", "正在确认会员角色与访问范围。", "正在同步AI Arena数据。", "正在准备个性化工作空间。"],
      failure: "登录失败。"
    }
  })
});

export const PUBLIC_BRIEF_LANGUAGES = Object.freeze(["ko", "en", "ar", "ja", "zh"]);

export function isPublicBriefLanguage(value) {
  return PUBLIC_BRIEF_LANGUAGES.includes(String(value || "").trim().toLowerCase());
}

export function normalizePublicBriefLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["zh-cn", "zh-sg", "zh-hans", "zh-tw", "zh-hk", "zh-hant"].includes(normalized)) return "zh";
  if (normalized.startsWith("ar-")) return "ar";
  if (normalized.startsWith("ja-")) return "ja";
  if (normalized.startsWith("ko-")) return "ko";
  if (normalized.startsWith("en-")) return "en";
  return isPublicBriefLanguage(normalized) ? normalized : "ko";
}

export function resolvePublicBriefLanguage({ search = "", stored = "", recommended = "", browserLanguages = [] } = {}) {
  const requested = new URLSearchParams(String(search || "")).get("lang");
  if (isPublicBriefLanguage(requested)) return normalizePublicBriefLanguage(requested);
  if (isPublicBriefLanguage(stored)) return normalizePublicBriefLanguage(stored);
  if (isPublicBriefLanguage(recommended)) return normalizePublicBriefLanguage(recommended);
  for (const candidate of (Array.isArray(browserLanguages) ? browserLanguages : [browserLanguages])) {
    const raw = String(candidate || "").trim().toLowerCase();
    if (isPublicBriefLanguage(raw) || /^(ko|en|ar|ja|zh)(-|$)/.test(raw)) return normalizePublicBriefLanguage(raw);
  }
  return "ko";
}

export function hasExplicitPublicBriefLanguage({ search = "", stored = "" } = {}) {
  const requested = new URLSearchParams(String(search || "")).get("lang");
  return isPublicBriefLanguage(requested) || isPublicBriefLanguage(stored);
}

export function publicBriefCopy(language) {
  return COPY[normalizePublicBriefLanguage(language)];
}

export function publicBriefUrl(value, language) {
  const url = new URL(value);
  const normalized = normalizePublicBriefLanguage(language);
  if (normalized === "ko") url.searchParams.delete("lang");
  else url.searchParams.set("lang", normalized);
  return url.toString();
}
