# SparkLabs AI Arena

**Where AI companies meet.**

SparkLabs가 선별한 AI 기업과 기업의 문제를 연결하고, 그 연결을 창업자 커뮤니티·이벤트·검증된 혜택으로 반복 강화하는 로그인 기반 운영형 네트워크입니다. 2026년 8월 6일 피드백과 후속 리서치의 구현 기준은 [FEEDBACK_20260806.md](./FEEDBACK_20260806.md), 90일 운영안은 [OPERATING_PLAYBOOK_90D.md](./OPERATING_PLAYBOOK_90D.md)에 정리했습니다.

- 운영 화면: <https://sparkclaw-arena.netlify.app/arena/>
- 현재 기수의 선별 기업은 기존 Program DB를 서버에서 읽어 재사용합니다.
- 전체 지원자 628명이나 탈락·차단 팀은 파트너 탐색 데이터에 포함하지 않습니다.

## 제품 경험

- **Member Discover:** 로그인한 승인 회원이 선별 기업, Featured, 일정과 검증된 혜택을 확인하고 기업 문제 Brief를 제출합니다.
- **Agentic Discovery:** “어떤 회사를 찾고 있나요?”라는 자연어 질문을 구조화해, 근거와 미확인 정보를 함께 제공하는 선별 기업 추천입니다.
- **Founder Community:** 승인된 창업자가 Ask, Ship, Connect와 Outcome으로 문제를 해결하고 오프라인 행사로 연결합니다.
- **Companies:** 공개에 적합한 최소 프로필만 보여주는 선별 기업 디렉터리입니다.
- **Events:** 교육, 코칭, 창업자·기업 네트워킹 일정을 제공합니다.
- **Perks:** 확정된 멤버 혜택의 조건과 신청 흐름을 관리합니다.
- **Partner Access:** 승인된 기업 파트너가 문제와 성공 기준을 제출하고 SparkLabs 검토와 양측 동의를 거쳐 연결을 요청합니다.

포인트, 인기 순위와 상호 경쟁은 핵심 경험이 아닙니다. 결과 기반 Bounty/Arena는 별도 준비 기능으로 유지하며 기본 공개하지 않습니다.

## 멤버와 데이터 원칙

- 현재 기수의 선별된 약 70개 팀을 시작점으로 사용하며, 데이터베이스 실제 값에 따라 숫자를 표시합니다.
- `member`는 화면에서 `Claw Member ★`로 표시합니다. 파트너와 운영진은 별도 역할을 유지합니다.
- 로그인만으로 내부 데이터 접근 권한이 생기지 않습니다. 신뢰할 수 있는 허용 목록 또는 Supabase `app_metadata`와 Program DB의 팀 연결을 확인합니다.
- 다른 팀과 파트너에게는 이름, 분야, 한 줄 소개, 서비스 요약, 웹사이트 등 목적에 필요한 최소 정보만 전달합니다.
- 연락처, 내부 평가, 주간 보고, 멘토링 기록, 소스 코드, API 키와 핵심 영업정보는 기업 탐색 데이터에 포함하지 않습니다.

## 혜택과 파트너 표시 원칙

Supabase, GitHub, Replit, OpenAI, Anthropic, Microsoft, Google 등은 파트너 생태계 예시로만 표시합니다. 실제 제공사, 금액, 기간, 신청 URL은 운영진이 확인한 값만 활성화합니다. 미확정 혜택을 약속하거나 임의의 금액을 노출하지 않습니다.

참여팀의 신청은 내부 의사 기록부터 시작합니다. 외부 신청 URL이 확정되면 운영진이 혜택 설정에 추가하고, 없는 경우 수동 후속 안내로 처리합니다.

## 기능 플래그

```env
SPARKCLAW_ENABLE_FORUM=true
SPARKCLAW_ENABLE_B2B_PORTAL=true
SPARKCLAW_ENABLE_ARENA=false
SPARKCLAW_ENABLE_PUBLIC_TECH_DISCLOSURE=false
```

포럼과 선별 기업 탐색은 기본 경험입니다. Arena Bounty와 외부 기술정보 공개는 별도 검토 후 명시적으로 활성화합니다.

## 주요 API

- `GET /api/arena-public`: 로그인 필수. 동의된 안전 프로필, 회원 공유 일정, 검증된 혜택과 집계 정보
- `POST /api/arena-public`: 로그인 필수. 개인정보 동의와 90일 검토 기한을 포함한 기업 Discovery Brief 접수
- `GET /api/program-hub`: 권한별 프로그램 정보, 선별 기업, 행사와 혜택
- `POST /api/program-hub`: 리포트, 혜택 신청, 이벤트 RSVP와 운영 액션
- `GET|POST /api/forum`: 커뮤니티 피드, 글 작성과 공감
- `GET|POST /api/b2b-match`: 자연어 기반 선별 기업 추천
- `GET /api/program-database`: SparkLabs 운영진 전용 원본 DB 읽기
- `/api/arena`: 기능 플래그와 역할 검사를 거치는 Bounty 준비 기능

익명 검색은 허용하지 않습니다. 회원·파트너 검색은 유효한 세션을 확인한 뒤 서버의 역할·공개 범위 필터를 통과한 데이터만 평가합니다.

## My Log 활동 원장 운영

My Log는 `public.sc_arena_` 접두사의 SparkClaw AI Arena 전용 활동 원장을 사용합니다. 기록 범위는 이 플랫폼 안에서 발생한 `Discover`, `Community`, `Bounty` 액션뿐입니다. 별도 SparkClaw Program DB의 행사 RSVP, 혜택 신청, Weekly Report 및 다른 플랫폼의 활동은 수집·조회·화면 fallback 대상에 포함하지 않습니다. 원장은 화면용 이력이며 연결 요청, Community, Bounty 등 원래 도메인 테이블이 현재 상태의 기준입니다. 모든 조회자는 해당 Workspace의 `active` 멤버십이 있어야 하며, 공개 범위는 다음과 같이 적용합니다.

팀 연결이 아직 확인되지 않은 Claw Member는 `arena_user` 조직으로 임시 동기화합니다. 이 값은 비권위 fallback이므로 기존 `program_team` 또는 다른 공식 조직 연결을 덮어쓰지 않으며, 이후 확인된 `program_team` 동기화는 `arena_user` 연결을 승격·교체할 수 있습니다.

| 공개 범위 | 조회 가능한 사용자 |
| --- | --- |
| `actor_only` | 행위자와 명시적으로 지정된 조회자 |
| `organization` | 위 사용자 + 행위자 조직의 활성 멤버 |
| `participants` | 위 사용자 + 행위자 조직 및 `subject`·`target`으로 연결된 참여 조직의 활성 멤버 |
| `staff` | 행위자·명시 조회자 + SparkLabs `staff`·`admin` |
| `participants_and_staff` | `participants` 범위 + SparkLabs `staff`·`admin` |

운영진이라고 모든 로그를 자동 조회할 수는 없습니다. `staff` 또는 `participants_and_staff`로 기록된 이벤트만 운영진 범위에 추가됩니다.

### 보존 및 만료 삭제

- Community 반응: 365일
- Discover·Community 글·댓글: 1,095일
- Bounty 활동: 2,555일
- 이벤트별 `retention_until`이 지난 뒤에만 삭제 대상으로 분류합니다. 값이 `NULL`인 이벤트는 자동 만료되지 않습니다.
- `public.sc_arena_purge_expired_activity(p_limit)`는 한 번에 1~5,000건만 물리 삭제합니다. 연결 엔터티, 명시 조회자, 읽음 상태는 외래 키 cascade로 함께 삭제되며, 조직·멤버십·공용 엔터티 기준정보와 원래 도메인 기록은 삭제하지 않습니다.
- 함수는 `service_role` 전용입니다. 브라우저나 일반 로그인 세션에서 실행하지 않습니다.

수동 정리는 Supabase SQL Editor의 관리자 세션에서 반환값이 `0`이 될 때까지 배치로 실행합니다.

```sql
select public.sc_arena_purge_expired_activity(5000) as deleted_count;
```

정기 정리는 [Supabase Cron](https://supabase.com/docs/guides/cron)을 활성화한 뒤 SQL Editor에서 다음과 같이 등록할 수 있습니다. 작업은 매일 KST 04:17에 해당하는 UTC 19:17에 실행됩니다.

```sql
select cron.schedule(
  'sc-arena-purge-expired-activity',
  '17 19 * * *',
  $$select public.sc_arena_purge_expired_activity(5000);$$
);
```

탈퇴·삭제 요청은 보존기간 만료와 별도로 처리합니다. 인증 사용자 삭제만으로 `actor_user_id`는 분리되지만 이미 기록된 표시 이름·제목·요약까지 자동 익명화되지는 않습니다. 법적 보존 의무가 없으면 관리자가 관련 이벤트를 물리 삭제하고, 보존이 필요하면 관리자 트랜잭션에서 `actor_user_id`를 `NULL`, `actor_label`을 `탈퇴한 사용자`, `metadata`를 빈 객체로 바꾼 뒤 명시 조회자·읽음 상태를 제거합니다. 이메일, 전화번호, 원문 본문, 비공개 메모와 자격증명은 처음부터 활동 원장에 저장하지 않습니다.

## 로컬 검사와 배포

```powershell
pnpm install
pnpm test
pnpm run deploy
```

운영 배포 전에는 인증 허용 목록, 팀 연결, 혜택 조건·URL과 파트너 표기를 확인합니다.
