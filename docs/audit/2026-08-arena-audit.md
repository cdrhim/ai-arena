# SparkLabs AI Arena Phase 0 감사 보고서

- 감사일: 2026-08-08 (KST)
- 라이브 읽기 전용 검증: 2026-08-08 09:14–09:16 KST
- 대상: 로컬 워크스페이스와 `https://sparkclaw-arena.netlify.app`
- 상태: **Phase 0 완료 — 코드·DB·운영 배포 변경 없이 여기서 중단**

> 이 문서는 현재 상태를 확인한 감사 결과다. 보안 취약점을 확인하기 위한 읽기 요청 외에 운영 데이터 쓰기, 마이그레이션, 설정 변경, 배포는 수행하지 않았다. 라이브 응답의 실제 이메일·이름·내부 메모 값은 기록하거나 출력하지 않았다.

## 결론

현재 시스템은 “관리자 HTML이 익명 응답에 포함된다”는 외형적 문제보다 더 심각한 실제 데이터 노출이 있다. 운영 Supabase에서 anon key만으로 `arena_submissions`의 공개 행 원본을 읽을 수 있었고, 그 원본 JSON에는 공개 API가 의도적으로 제거하는 소유자 이메일, 팀원 이메일, 내부 검토 메모와 검토자 이메일이 포함되어 있었다. **파트너 계정을 추가로 열기 전에 이 경로를 차단해야 한다.**

그 밖에 다음 구조적 문제가 확인됐다.

- Partner, Team, Admin이 하나의 정적 HTML과 JS 번들을 공유한다.
- Program DB 원본 브라우저는 SQL injection은 막지만 명시적 테이블 allowlist 없이 PostgREST OpenAPI에 노출된 전체 테이블을 자동 허용한다.
- 관계형 Competition 스키마와 실제 Netlify Blob 기반 런타임이 서로 다른 system of record다.
- Bounty는 `Coming Soon`과 완성된 Board가 동시에 존재하고, 일반 내비게이션에서는 Board 진입점이 없다.
- 공개 Brief가 개인정보를 받지만 이용약관·개인정보처리방침 페이지와 링크가 없다.
- 일부 Blob 쓰기는 동시성 또는 저장 실패 시 데이터 손실·가짜 성공 응답 위험이 있다.

## 즉시 조치가 필요한 보안·출시 이슈

| 심각도 | 이슈 | 확인 상태 | Phase 1에서 필요한 최소 조치 |
|---|---|---|---|
| **Critical** | anon 사용자가 공개 Tech Passport의 raw `arena_submissions` 행과 민감한 `payload` 필드를 직접 읽을 수 있음 | 라이브에서 1건 확인 | base table의 anon/authenticated SELECT 차단, 안전 컬럼만 가진 view/RPC 제공, 기존 공개 행의 민감 payload 정리, 접근 로그 조사 |
| **High** | authenticated 사용자가 직접 INSERT로 `published/public` 상태를 만들 수 있는 RLS 정책 | 로컬 정책 전문 확인; 비변경 원칙 때문에 쓰기 실측 안 함 | INSERT/UPDATE를 서버 전용으로 제한하거나 상태 전이·JSON 필드를 RLS/trigger로 강제 |
| **High** | Program DB 브라우저가 명시적 allowlist 없이 전체 OpenAPI 테이블에 `select=*` 허용 | 코드 확인; 익명 API는 401 | 고정 read-only view/RPC와 필드 allowlist로 교체, staff 이메일 allowlist 필수화 |
| **High** | Arena/Competition Blob 이벤트 저장이 비원자적이며 읽기 오류 후 빈 상태를 덮어쓸 수 있음 | 코드 확인 | CAS/transactional 저장, 운영 read 오류 fail-closed, 이벤트 절단 전 snapshot/compaction |
| **High** | Program Action 저장 실패가 메모리 fallback 후 성공으로 응답할 수 있음 | 코드 확인 | 운영에서는 저장 실패를 5xx로 반환하고 재시도·idempotency 보장 |
| **High · 출시 차단** | 공개 Brief가 PII를 수집하지만 약관·개인정보처리방침과 동의 링크가 없음 | 파일/라우트 확인 | 승인된 법무 골격·링크·동의 이력 추가 전 외부 확장 금지 |
| **Medium** | 익명 HTML/JS에 관리자 패널·원본 DB 브라우저 구현 전체 포함 | 라이브·로컬 확인 | 역할별 route/bundle 분리. 단, 서버 인가를 계속 실제 경계로 유지 |
| **Medium** | Supabase access/refresh token 전체를 `localStorage`에 저장하고 CSP가 없음 | 코드·라이브 헤더 확인 | 세션 전략 재검토, 엄격한 CSP와 보안 헤더, XSS 표면 축소 |
| **Medium** | “90일 후 재검토”는 메타데이터일 뿐 삭제·검토 작업이 없음 | 코드 확인 | 보존 검토 job, 삭제/보존 결정 기록, 운영 조회·처리 API |
| **Medium** | 자격증명 CSV/XLSX가 로컬 `private/`, `outputs/`에 존재 | 파일명만 확인 | 비밀관리 도구로 이동, 배포·백업·공유 범위 점검, 필요 시 비밀번호 회전 |
| **Low** | 보호 API가 `Access-Control-Allow-Origin: *` 사용 | 코드·라이브 확인 | 운영 origin allowlist 검토. Bearer 방식이라 현재 즉시 CSRF 취약점은 아님 |

### Critical 증거: 공개 Tech Passport 원본 노출

라이브 `/api/arena-auth`가 제공하는 publishable Supabase 설정으로 다음 읽기 전용 요청을 수행했다.

```text
GET {supabaseUrl}/rest/v1/arena_submissions
    ?select=id,owner_id,owner_email,status,visibility,payload
    &limit=5
Authorization: Bearer {publishable-anon-key}
apikey: {publishable-anon-key}
```

결과는 HTTP 200, anon-visible 총 1행이었다. 값을 출력하지 않고 키 존재 여부만 검사했으며 다음 경로가 비어 있지 않았다.

- `owner_email`
- `payload.ownerEmail`
- `payload.teamMembers[0].email`
- `payload.review.internalNote`
- `payload.review.reviewerEmail`
- `payload.assets[*].ownerId`

anon key가 브라우저에 전달되는 것 자체는 Supabase의 정상 설계다. 취약점의 원인은 공개 행 전체를 허용하는 RLS와, 공개·비공개 데이터를 하나의 `payload jsonb`에 함께 저장한 모델이다.

- 클라이언트 안전 설정 반환: `netlify/lib/supabase-auth.mjs:58-65`, `netlify/functions/arena-auth.mjs:3-7`
- 공개 행 전체 SELECT 정책: `supabase/arena_submissions.sql:41-50`
- submission 전체 객체를 payload로 저장: `netlify/lib/supabase-submissions-store.mjs:59-74`
- 정상 Netlify API의 민감 필드 제거: `netlify/lib/arena-submissions.mjs:1559-1593`

직접 PostgREST 요청은 마지막 정제 단계를 거치지 않는다. anon key 회전만으로는 해결되지 않으며 RLS·grant·데이터 모델을 함께 수정해야 한다.

## 1. 스택·구조 인벤토리

### 1.1 실행 구조

| 계층 | 현재 구현 | 증거 |
|---|---|---|
| 프론트엔드 | 프레임워크 없는 정적 HTML/CSS/ES modules SPA | `public/arena/index.html`, `arena.js`, `market.js`, `community.js` |
| UI 라우팅 | URL router가 아니라 `data-page-panel`을 토글하는 단일 문서 상태 | `public/arena/arena.js:2791-2826` |
| 호스팅 | Netlify, publish root `public` | `netlify.toml:1-4` |
| 서버 | 9개 Netlify Functions, esbuild bundling | `netlify.toml:5-55`, `netlify/functions/*.mjs` |
| 인증 | Supabase Auth password grant; 서버가 `/auth/v1/user`로 bearer token 확인 | `public/arena/arena.js:302-350`, `netlify/lib/supabase-auth.mjs:69-94` |
| Arena 데이터 | 별도 Supabase의 `arena_submissions` + Netlify Blobs | `supabase/arena_submissions.sql`, `netlify/lib/*-store.mjs` |
| Program 데이터 | 별도일 가능성이 높은 Program Supabase REST를 서버 secret/service key로 읽음 | `netlify/lib/program-database.mjs:5-29`, `program-hub.mjs:4-99` |
| 배포 | `main` push GitHub Action 또는 로컬 Netlify CLI production deploy | `.github/workflows/netlify-deploy.yml`, `package.json` |

`package.json`의 유일한 runtime dependency는 `@netlify/blobs`이고, Node 20 이상을 대상으로 한다. Netlify build command는 `pnpm test`, publish directory는 `public`, functions directory는 `netlify/functions`다.

### 1.2 배포 흐름

1. GitHub `main` push 또는 수동 workflow 실행.
2. pnpm 11.7.0 / Node 20 설정 및 frozen install.
3. Netlify CLI가 production site `a1199605-0f40-4eb8-88d8-cd5445271841`에 배포.
4. Netlify가 `netlify.toml`의 build command와 redirects/functions 설정을 적용.

현재 워크스페이스에는 `.git` 디렉터리가 없다. 따라서 현재 파일이 어느 commit과 일치하는지, credential artifact가 과거 Git 기록에 들어간 적이 있는지, “한 작업 = 한 커밋” 규칙을 만족하는지 확인할 수 없다. 감사 문서 생성을 위해 새 저장소를 임의 초기화하지 않았다.

### 1.3 인증과 역할 결정

- 브라우저가 `/api/arena-auth`에서 Supabase URL과 publishable anon key를 받는다.
- 이메일/비밀번호로 Supabase password grant를 호출한다.
- access/refresh token을 포함한 session 전체를 `localStorage`에 저장한다: `public/arena/arena.js:2857-2885`.
- 모든 보호 Function은 bearer token을 Supabase `/auth/v1/user`로 다시 확인한다.
- 권한 역할은 신뢰된 외부 파트너 매핑, `app_metadata`, 서버 환경 allowlist와 이메일 domain으로 결정한다. mutable `user_metadata`는 privileged role 결정에 사용하지 않는다.
- 기본 `@sparklabs.co.kr` domain 사용자는 `canScore=true`다: `netlify/lib/supabase-auth.mjs:105-121`.
- `SPARKCLAW_PROGRAM_DB_ALLOWED_EMAILS`가 비어 있으면 Program DB에 추가 staff 이메일 제한이 없다.

역할 이름의 실제 대응은 다음과 같다.

| 지시서 용어 | 코드 역할 | 비고 |
|---|---|---|
| Public | 인증 없음 또는 `public` | 공개 Brief POST와 로그인만 사용 가능 |
| Partner | `b2b_partner` | 전체 참가기업의 안전 프로필, Brief/Bounty/소개 요청 |
| Team | `member` | 연결된 자기 팀의 private workspace와 제출 기능 |
| Admin | `admin`, `sparklabs`, `canScore` | 운영 큐, 전체 Program data, raw DB |
| 추가 역할 | `human_validator` | 지시서 3역할 외의 별도 검토자 역할 |

### 1.4 실제 URL 라우트

| URL | 대상 | 구현/인가 |
|---|---|---|
| `/` | Public | meta refresh로 `/arena/` 이동 |
| `/arena`, `/arena/*` | Public shell + 모든 역할 | 모두 같은 `public/arena/index.html`로 rewrite |
| `/api/arena-auth` | Public GET | client-safe auth config 반환 |
| `/api/arena-public` | Public POST; 승인 역할 GET | 익명 Brief 접수만 공개, GET은 bearer 필요 |
| `/api/arena` | Team/Partner/Admin, flag 의존 | bearer + viewer/feature 검사, Arena/Bounty/Passport |
| `/api/b2b-match` | Team/Partner/Admin | bearer + 역할 + feature + rate limit |
| `/api/external-partners` | Partner own profile / Admin all | bearer; POST 저장은 Admin만 |
| `/api/forum` | 승인 역할 | bearer; 댓글/글 권한은 server core에서 추가 검사 |
| `/api/program-hub` | 연결된 Team, Partner, Validator, Admin | bearer; Team은 Program DB team 연결 필요 |
| `/api/program-database` | Admin | bearer + `canScore` + 선택적 이메일 allowlist, GET only |
| `/api/sparkclaw-applicants-export` | Admin | Program DB와 동일한 인가 |

SPA 내부 panel은 `overview`, `arena`, `discover`, `passports`, `compare`, `partnerships`, `community`, `workspace`, `teams`, `calendar`, `benefits`, `operations`, `database`다. 이들은 독립 URL이 아니며 reload/deep-link 상태를 보존하지 않는다.

### 1.5 SPA 내 역할별 화면

| 화면 | Public | Partner | Team | Admin |
|---|---:|---:|---:|---:|
| 공개 Brief | 제출 가능 | 로그인 후 재사용 | 로그인 후 재사용 | 로그인 후 재사용 |
| Discover/Companies | 로그인 전 숨김 | 안전 필드 전체 참가기업 | 안전 필드 + 자기 팀 private | 전체 운영 projection |
| Community | 숨김 | 숨김 | 표시 | 표시 |
| Events & Perks | 숨김 | 메뉴는 보이나 server shell이 빈 배열을 반환 | 표시 | 표시 |
| Workspace | 숨김 | 파트너 pipeline/profile | 자기 팀 workspace | 운영 workspace |
| Operations | 숨김 | 거부 | 거부 | 허용 |
| Raw Database | 숨김 | 거부 | 거부 | 허용 |

Partner/Validator용 `externalViewerShell`은 `events`, `benefits`, `mentoringSessions`, `weeklyReports`, 신청/등록 배열을 의도적으로 비운다: `netlify/functions/program-hub.mjs:48-88`. 그러나 primary `Events & Perks` 메뉴는 모든 인증 역할에 표시되어 빈 화면을 구조적으로 유발한다.

## 2. 보안 감사

### 2.1 익명 HTML에 관리자 마크업이 포함되는 이유

라이브 `/arena/` 응답과 로컬 HTML 모두 다음 문자열을 포함한다.

- `TABLE VOLUME`
- `WEEKLY REPORT QUEUE`
- `RSVP QUEUE`
- `RAW DATABASE`
- `SPARKCLAW APPLICANT EXPORT`
- `databaseTableSelect`

원인은 역할별 서버 route가 아니라 하나의 정적 SPA shell을 모든 사용자에게 내려주기 때문이다. `programApp`과 모든 panel은 최초 `hidden`이고, 익명일 때 JS가 `programApp`을 숨긴 채 공개 Brief만 mount한다. 유효한 session으로 `/api/program-hub`를 불러온 뒤에야 app을 표시한다.

- 정적 admin panel: `public/arena/index.html:930-1055`
- 모든 사용자에게 동일 module 3개 전송: `public/arena/index.html:1106-1108`
- 익명 app 숨김: `public/arena/arena.js:2726-2738`
- 서버 확인 후 app 표시: `public/arena/arena.js:352-389`, `2713-2724`
- Operations/Database client permission 재검사: `public/arena/arena.js:606-655`, `2791-2817`

개발자 도구로 `hidden`을 제거하면 관리자 UI 껍데기와 구현 코드는 볼 수 있다. 그러나 관련 Netlify API는 라이브 익명 요청에서 모두 401을 반환했다. 따라서 **마크업 포함 자체는 실제 관리자 데이터 유출이 아니지만, client hiding을 인가로 오해하기 쉬운 구조이자 공격 표면·내부 구조 노출**이다. 실제 Critical 유출은 별개인 Supabase 직접 REST 경로에서 확인됐다.

### 2.2 원본 DB 브라우저 추적

```text
Admin UI table selector
  public/arena/arena.js:2433-2457
       │ GET /api/program-database
       ▼
Netlify Function
  netlify/functions/program-database.mjs:4-35
       │ verifyArenaRequest → assertProgramDatabaseAccess
       ▼
Program DB adapter
  netlify/lib/program-database.mjs
       │ GET /rest/v1/ OpenAPI definitions
       │ GET /rest/v1/{selected-table}?select=*&limit=&offset=
       ▼
Separate Program Supabase
```

판정:

- 클라이언트가 query string의 `table` 값을 바꿀 수는 있다.
- 서버는 identifier 정규식과 방금 받은 OpenAPI schema의 정확한 table name 일치를 요구하므로 SQL injection이나 임의 path 주입은 막힌다: `program-database.mjs:60-67`, `159-162`.
- 그러나 별도의 비즈니스 allowlist는 없다. secret/service key로 보이는 모든 OpenAPI definition을 UI에 반환하고 선택된 table에 `select=*`를 수행한다: `32-53`, `56-96`, `114-123`.
- 따라서 새 민감 table이 PostgREST `public` schema에 추가되면 별도 코드 변경 없이 raw browser에 자동 포함될 수 있다.
- max page size는 100이지만 offset pagination으로 전체 추출이 가능하다.
- 익명은 401이지만 staff session 탈취 또는 과도한 staff domain 권한의 blast radius가 크다.

### 2.3 RLS·정책 전문

아래 표의 정책 전문은 **저장소 migration 기준**이다. 운영 `pg_policies`는 anon 권한으로 노출되지 않아 직접 dump하지 못했다. 라이브 동작은 별도 열에 기록했다.

| 테이블 | RLS on? | SELECT 정책 | INSERT | UPDATE | DELETE | 라이브 anon | 위험도 |
|---|---:|---|---|---|---|---|---|
| `arena_submissions` | yes | `is_sparklabs_staff() OR owner_id=auth.uid() OR owner_email=jwt.email OR (status='published' AND visibility='public')` | staff 또는 자기 `owner_id/email`; 상태·공개범위 제한 없음 | staff 또는 자기 early status; payload `arenaScore=0` 검사 | staff only | 200, 1행 | **Critical** |
| `arena_challenges` | yes | 없음 | 없음 | 없음 | 없음 | 404 | 배포 여부 불명 |
| `challenge_files` | yes | 없음 | 없음 | 없음 | 없음 | 404 | 배포 여부 불명 |
| `challenge_solutions` | yes | 없음 | 없음 | 없음 | 없음 | 404 | 배포 여부 불명 |
| `arena_teams` | yes | 없음 | 없음 | 없음 | 없음 | 404 | 배포 여부 불명 |
| `arena_team_members` | yes | 없음 | 없음 | 없음 | 없음 | 404 | 배포 여부 불명 |
| `challenge_submissions` | yes | 없음 | 없음 | 없음 | 없음 | 404 | 배포 여부 불명 |
| `submission_validation_reports` | yes | 없음 | 없음 | 없음 | 없음 | 404 | 배포 여부 불명 |
| `leaderboard_entries` | yes | 없음 | 없음 | 없음 | 없음 | 404 | 배포 여부 불명 |
| `pairwise_votes` | yes | 없음 | 없음 | 없음 | 없음 | 404 | 배포 여부 불명 |
| `validation_reviews` | yes | 없음 | 없음 | 없음 | 없음 | 404 | 배포 여부 불명 |
| `audit_logs` | yes | 없음 | 없음 | 없음 | 없음 | 200, 0행 | 낮음(현재 deny 동작) |

`arena_submissions`의 네 정책은 `supabase/arena_submissions.sql:41-86`, Competition 11개 table의 RLS enable과 정책 부재는 `supabase/competition_system.sql:178-188`에서 확인했다.

중요한 추가 문제:

- `arena_submissions` INSERT는 자기 소유 확인만 하므로 authenticated table grant가 유지된 경우 `published/public` 직접 생성이 가능하다.
- row의 indexed `status`, `visibility`, `owner_*`, `readiness_score`와 `payload` 내부 값 사이의 일관성을 보장하는 constraint/trigger가 없다.
- server storage adapter는 secret/service key가 없을 때 anon key까지 fallback한다: `netlify/lib/supabase-submissions-store.mjs:3-16`. 잘못된 운영 설정은 전체가 아닌 공개 행만 읽거나 쓰기에 실패하는 부분 상태를 만들 수 있다.
- Competition 11개 table은 RLS만 켜고 policy가 없어 일반 anon/authenticated에는 deny-by-default가 된다. 그러나 현재 runtime은 이 table들을 사용하지 않고 Blob을 사용한다.

### 2.4 anon key 라이브 테이블 probe

공개 OpenAPI schema endpoint 자체가 401이어서 모든 table을 자동 열거할 수는 없었다. 저장소 SQL에 정의된 12개 이름을 직접 read-only probe했다.

| 테이블 | HTTP | anon-visible count | 해석 |
|---|---:|---:|---|
| `arena_submissions` | 200 | 1 | 실제 raw row 노출 확인 |
| `audit_logs` | 200 | 0 | endpoint 존재, 현재 anon-visible row 없음 |
| 나머지 Competition 10개 | 404 | 확인 불가 | 미배포인지 API 비노출인지 anon으로 구분 불가 |

`pg_policies`, `information_schema.tables` 직접 REST 요청도 404였다. 따라서 운영 policy 전문, grants, 전체 row count는 DB 관리자 read-only SQL session 없이는 확정할 수 없다.

### 2.5 익명 API status matrix

| GET 경로 | 라이브 상태 | 판정 |
|---|---:|---|
| `/api/arena-auth` | 200 | 의도된 공개 설정 |
| `/api/arena` | 401 | 정상 차단 |
| `/api/arena-public` | 401 | GET 정상 차단; POST Brief만 공개 |
| `/api/b2b-match` | 401 | 정상 차단 |
| `/api/external-partners` | 401 | 정상 차단 |
| `/api/forum` | 401 | 정상 차단 |
| `/api/program-database` | 401 | 정상 차단 |
| `/api/program-hub` | 401 | 정상 차단 |
| `/api/sparkclaw-applicants-export?format=metadata` | 401 | 정상 차단 |

### 2.6 Storage와 Functions

Supabase Storage `GET /storage/v1/bucket` anon probe는 HTTP 200, anon-visible bucket 0개, public bucket 0개를 반환했다. 이는 공개 bucket이 없다는 증거지만 private bucket 존재 여부까지 부정하지는 않는다.

현재 코드에는 Supabase Storage SDK/REST 사용 경로가 없다. `challenge_files.storage_path`, `challenge_solutions.storage_path` 컬럼은 SQL에만 있고 runtime은 사용하지 않는다. Tech Passport 이미지는 별도 bucket이 아니라 submission JSON의 data URL로 저장된다.

지시서가 말한 “Edge Function”은 현재 코드베이스에 없다. 실제 backend는 9개 Netlify Functions다. 모든 보호 Function은 server-side `verifyArenaRequest`를 호출하며, 익명 Brief POST와 공개 auth config GET만 의도적으로 예외다.

### 2.7 보안 헤더·클라이언트 secret

| 헤더 | `/arena/` | `/api/arena` |
|---|---|---|
| HSTS | 있음 | 있음 |
| CSP | 없음 | 없음 |
| `X-Content-Type-Options` | 없음 | `nosniff` |
| `X-Frame-Options` | 없음 | 없음 |
| `Referrer-Policy` | 없음 | 없음 |
| `Permissions-Policy` | 없음 | 없음 |
| COOP/CORP | 없음 | 없음 |
| CORS | 없음 | `*` |

`netlify.toml`에도 `[[headers]]` 설정이 없다. 배포 HTML과 JS bundle에서 `service_role`, Supabase/Program secret key, Anthropic key, `sk-ant-*`, `sb_secret_*` marker는 발견되지 않았다. publishable anon key는 비밀정보가 아니며 RLS가 안전 경계를 제공해야 한다.

로컬에는 `temporary_password`를 포함하는 credential CSV/XLSX artifact가 `private/`, `outputs/` 아래 존재한다. 두 디렉터리는 `.gitignore`에 포함되고 Netlify publish root `public` 밖이므로 현재 정적 배포 대상은 아니다. 실제 값은 감사에서 열거나 기록하지 않았다.

## 3. 데이터 모델과 영속성

### 3.1 현재 system of record는 하나가 아니다

```text
Supabase Auth/Arena project
└─ auth.users
└─ arena_submissions                 # Tech Passport aggregate JSON

Program Supabase project (server-only REST)
├─ teams ─┬─ hypotheses ── customer_interviews
│         ├─ customer_interviews
│         ├─ mentoring_sessions ── mentors
│         ├─ pmf_survey_responses
│         ├─ event_registrations ── events
│         ├─ benefit_applications ── benefits
│         └─ report_reminders
└─ weekly_report_notice

Netlify Blobs
├─ sparklabs-ai-arena/events                     # Bounty/connection events
├─ sparklabs-ai-arena-competition/competition-events
├─ sparkclaw-program-actions/events             # RSVP/report/perk actions
├─ sparklabs-ai-arena-forum/events
├─ sparklabs-ai-arena-public-briefs/briefs
├─ sparklabs-ai-arena-external-partners/profiles
└─ sparklabs-ai-arena-rate-limits/*
```

Program ERD는 로컬 DDL이 없으므로 `netlify/lib/program-hub.mjs:4-89`의 고정 SELECT와 join 사용에서 추론했다. 실제 FK, unique constraint, RLS, ON DELETE 동작은 확인되지 않았다. Arena와 Program이 서로 다른 Supabase project라면 양쪽 데이터 사이에 DB-level FK를 만들 수 없다.

### 3.2 Competition SQL ERD

```text
arena_challenges
├─ challenge_files                    FK challenge_id
├─ challenge_solutions                FK challenge_id
├─ arena_teams                        FK challenge_id
│  ├─ arena_team_members              FK team_id
│  └─ challenge_submissions           FK challenge_id, team_id
│     ├─ submission_validation_reports FK submission_id
│     └─ leaderboard_entries          FK challenge_id, submission_id, team_id
├─ pairwise_votes                     IDs only, FK 없음
└─ validation_reviews                 IDs only, FK 없음

audit_logs                            polymorphic entity_type/entity_id, FK 없음
```

SQL은 11개 Competition table을 정의하지만 runtime에서 해당 table명을 참조하지 않는다. 현재 Competition system of record는 `sparklabs-ai-arena-competition` Blob event stream이다. 이는 migration만 보고 운영 모델을 이해할 수 없는 명백한 schema/runtime drift다.

### 3.3 Brief, Bounty, Tech Passport 저장 위치

| 객체 | 접수 경로 | 실제 저장 | 구조·문제 |
|---|---|---|---|
| Public Brief | 익명 `POST /api/arena-public` | Blob `sparklabs-ai-arena-public-briefs`, key `briefs` | 최대 500개, CAS/fail-closed. 운영 조회·검토·삭제 API 없음. 90일은 review metadata뿐 |
| Bounty Brief | Partner `requestBounty` | Blob `sparklabs-ai-arena`, key `events`의 `bounty_requested` event | 별도 table/FK 없음, replay로 상태 생성, 최대 500 event |
| Competition Bounty | `/api/arena` competition actions | Blob `sparklabs-ai-arena-competition` | SQL Competition tables와 분리, 최대 1,000 event |
| Tech Passport | Team draft/review actions | Supabase `arena_submissions` 한 행 + full `payload jsonb` | indexed column과 payload 중복, 공개/비공개 필드 혼재, 이미지 data URL 포함 |
| Weekly report / RSVP / Perk apply | `/api/program-hub` actions | Blob `sparkclaw-program-actions` | Program DB read model 위에 별도 event overlay; 저장 실패가 memory success로 바뀔 수 있음 |

### 3.4 Tech Passport 필드 매핑

`normalizeSubmission` 결과 전체가 `payload`에 저장되고 일부만 top-level column으로 중복된다.

| Supabase column | payload source | 비고 |
|---|---|---|
| `id` | `submission.id` | primary key |
| `owner_id` | `submission.ownerId` | payload에도 중복 |
| `owner_email` | `submission.ownerEmail` | payload에도 중복, 현재 익명 노출 확인 |
| `status` | `submission.status` | payload에도 중복; DB 일관성 constraint 없음 |
| `visibility` | `submission.visibility` | payload에도 중복 |
| `slug`, `name` | 동일명 | discovery용 index |
| `readiness_score` | `submission.readiness.score` | payload에도 readiness object 존재 |
| `payload` | submission 전체 | teamMembers, technicalProfile, traction, assets, review, humanValidation, partner grants 등 포함 |
| timestamps | submission timestamps | payload에도 중복 |

별도 Storage bucket이 없으므로 asset data URL까지 row payload가 비대해지고, base row 공개 정책이 곧 전체 내부 객체 공개가 된다.

### 3.5 확인된 레코드 수와 확인 불가 범위

| 범위 | 확인 값 | 성격 |
|---|---:|---|
| 운영 `arena_submissions` anon-visible | 1 | **운영 실측의 최소 공개 수**; 전체 row 수 아님 |
| 운영 `audit_logs` anon-visible | 0 | 운영 실측 |
| 로컬 SQL table 정의 | 12 | `arena_submissions` 1 + Competition 11 |
| 로컬 SQL INSERT seed | 0 | migration 자체 기준 |
| 정적 Arena seed startups | 168 | runtime fixture, 운영 Program DB 수 아님 |
| 정적 Competition challenges | 6 | runtime fixture |
| 정적 connection profiles | 6 | runtime fixture |
| 외부 partner code seed | 1 | 영원무역 profile |
| 로컬 applicant snapshot | 631 applications / 628 unique teams / 3 duplicates | staff export metadata, 참가기업 수와 동일하지 않음 |
| 로컬 Netlify dev Blob cache | Competition events 2, 다른 확인 store 0 | 운영 Blob 수 아님 |

Program Supabase의 실제 row count, 전체 Tech Passport count, production Blob event/Brief count, FK orphan count는 현재 anon 권한과 로컬 환경으로 확인할 수 없었다.

### 3.6 데이터 때문에 빈 상태가 되는 화면

| 화면/섹션 | 빈 상태 원인 | 현재 표현 |
|---|---|---|
| Partner `Events & Perks` | `externalViewerShell`이 events/benefits를 항상 `[]`로 반환하지만 메뉴는 모든 인증 역할에 표시 | 정상 empty처럼 보여 구조적 불일치 |
| Bounty Board | API 실패 시 `emptyArenaData()`로 치환 | 짧은 toast 후 “선택한 상태의 Bounty가 없습니다”라는 가짜 empty |
| Perk preview | 확인된 benefit 0건 | 로딩이 끝나도 “제공 조건을 확인 중입니다” |
| Competition SQL 기반 화면 | runtime이 SQL table을 사용하지 않음 | fixture/Blob 상태와 migration row count가 불일치 가능 |
| Public Brief 운영 queue | 저장은 되지만 조회/운영 API가 없음 | 제출자는 receipt만 받고 운영 화면과 연결되지 않음 |

Teams, Events, Benefits, Community, raw DB는 기본적인 empty 또는 error 분기를 갖고 있다. 초기 HTML의 “동기화 중/불러오는 중” placeholder는 `programApp`이 hidden인 동안 존재하고 정상 hub render 시 교체된다. 확인된 핵심 문제는 무한 spinner 자체보다 **error를 empty로 바꾸거나, 의도적으로 빈 role shell에 메뉴를 노출하는 것**이다.

## 4. 프론트엔드 현황

### 4.1 loading / empty / error

- 공통 접근 가능한 단계형 process status는 구현되어 있고 `aria-live`, stale token 방지, reduced-motion 처리가 있다: `public/arena/progress-status.js:26-77`.
- Teams, Events, Benefits는 정상 empty 문구가 있다: `public/arena/arena.js:1742-1765`, `1875-1880`, `2010-2022`.
- Arena prototype fetch 실패는 `marketData`와 `arenaData`를 빈 객체로 바꾸고 2.6초 toast만 띄운다: `public/arena/arena.js:374-385`, `2912-2918`. 이후 Bounty 화면은 실제 0건과 장애를 구분할 수 없다.
- Perk preview의 0건 문구가 “제공 조건을 확인 중입니다”여서 완료된 empty state와 구분되지 않는다: `public/arena/arena.js:1889-1909`.
- Raw DB schema와 applicant export는 진행 status와 catch/error 처리가 있다: `public/arena/arena.js:2433-2483`.

### 4.2 Bounty 충돌

- Overview는 `Bounty Coming Soon`을 표시한다: `public/arena/index.html:209-228`.
- 같은 HTML에는 `EVALUATION LIVE` Bounty Board, 제출, leaderboard, staff control이 완성형으로 포함된다: `public/arena/index.html:325-478`.
- Member/Partner의 prototype load는 `features.b2bPortal`로 결정되며 `features.arena`와 일치하지 않는다: `public/arena/arena.js:572-576`.
- workspace action은 `arena` page target을 생성한다: `public/arena/market.js:854-859`.
- 그러나 정적 HTML에는 `data-page="arena"` 또는 `data-go-page="arena"` trigger가 없다. `goPage()`는 그러한 element를 click하는 방식이므로 일반 진입이 조용히 실패한다: `public/arena/market.js:1173-1175`.
- `showPage("arena")` 자체에는 Bounty 전용 feature guard가 없다: `public/arena/arena.js:2791-2826`.

따라서 “Coming Soon”, 실제 backend 활성 조건, 화면 접근 조건이 세 군데에서 서로 다르다. 지시서의 단일 `FEATURE_BOUNTY` 통제 요구는 현재 코드와 일치하는 개선 방향이다.

### 4.3 약관·개인정보처리방침

- `public` 아래 Terms/Privacy/Legal page가 없다.
- `/arena/*` catch-all 때문에 `/arena/privacy` 또는 `/arena/terms`를 열어도 별도 문서가 아니라 app shell이 반환된다.
- footer에는 법적 링크가 없다: `public/arena/index.html:1057-1060`.
- Brief 동의 문구와 90일 review 안내는 있지만 policy link, 처리자/문의처, 제3자 제공·위탁 상세가 없다: `public/arena/index.html:315-317`.

법률 본문은 감사에서 창작하지 않았다. 운영주체, 개인정보 문의처, 실제 처리·제공 흐름과 승인된 보유/삭제 기준이 필요하다.

### 4.4 Brief 폼 정의

정의 위치는 `public/arena/index.html:292-320`, server normalization은 `netlify/lib/public-brief-store.mjs:49-90`이다.

| 필드 | HTML name | 필수 여부 | 한도/검사 |
|---|---|---:|---|
| 조직명 | `organization` | 필수 | HTML 160, server 160 |
| 웹사이트 | `website` | 선택 표기 | URL, http/https only, credentials 금지 |
| 담당자 이름 | `contactName` | 필수 | HTML/server 120 |
| 업무 이메일 | `email` | 필수 | HTML email, server email 검사 |
| 해결하려는 문제 | `problem` | 필수 | 2,000 |
| 성공 기준 | `successMetric` | 필수 | 800 |
| 데이터·보안·연동 제약 | `constraints` | 선택이지만 UI 표기 없음 | 1,200 |
| 의사결정 시점 | `deadline` | 선택이지만 UI 표기 없음 | ISO date 검사 |
| 예산 범위 | `budgetRange` | 선택이지만 UI 표기 없음 | 서버 enum allowlist |
| 구매·법무 경로 | `procurementPath` | 선택이지만 UI 표기 없음 | 800 |
| 개인정보 처리 동의 | `consent` | 필수 | server에서 boolean `true`만 허용 |
| bot honeypot | `companyUrl` | 숨김 | 값이 있으면 거부 |

요청 body는 Function에서 64KB, normalized input은 store에서 24KB로 제한된다. rate limit은 IP hash 기준 시간당 기본 5회다. 다만 rate-limit store 장애 시 메모리 fallback이므로 serverless instance 간 일관된 차단을 보장하지 않는다.

## 완료

- [P0-1] 스택·배포·인증·역할·URL/API route 인벤토리 작성 — **commit N/A (`.git` 없음)**
- [P0-2] 익명 관리자 마크업 원인, raw DB browser 경로와 server authorization 추적 — **commit N/A**
- [P0-3] 로컬 RLS 정책 전문 정리와 라이브 anon table/API/storage read-only probe — **commit N/A**
- [P0-4] Brief/Bounty/Tech Passport 영속성, ERD, row-count 범위와 schema/runtime drift 정리 — **commit N/A**
- [P0-5] empty/error 상태, Bounty 충돌, legal page, Brief 필수/선택 필드 감사 — **commit N/A**
- [P0-6] `docs/audit/2026-08-arena-audit.md` 작성 — **commit N/A**

## 검증 방법

### 로컬 구조·정책 확인

```powershell
rg -n 'TABLE VOLUME|WEEKLY REPORT QUEUE|RSVP QUEUE|RAW DATABASE' public/arena/index.html
rg -n 'program-database|canViewRawDatabase|assertProgramDatabaseAccess' public/arena netlify
rg -n 'create table|enable row level security|create policy' supabase
rg -n 'Bounty.*Coming Soon|data-page-panel="arena"|data-(page|go-page)="arena"' public/arena
Get-ChildItem public -Recurse -File | Where-Object Name -Match 'terms|privacy|legal'
```

### 라이브 익명 endpoint matrix

```powershell
@'
const base = "https://sparkclaw-arena.netlify.app";
const paths = [
  "/api/arena-auth", "/api/arena", "/api/arena-public",
  "/api/b2b-match", "/api/external-partners", "/api/forum",
  "/api/program-database", "/api/program-hub",
  "/api/sparkclaw-applicants-export?format=metadata"
];
for (const path of paths) {
  const response = await fetch(base + path);
  await response.arrayBuffer();
  console.log("GET", path, response.status);
}
'@ | node -
```

### anon table status/count only

```powershell
@'
const config = await (await fetch(
  "https://sparkclaw-arena.netlify.app/api/arena-auth"
)).json();
const tables = [
  "arena_submissions", "arena_challenges", "challenge_files",
  "challenge_solutions", "arena_teams", "arena_team_members",
  "challenge_submissions", "submission_validation_reports",
  "leaderboard_entries", "pairwise_votes", "validation_reviews",
  "audit_logs"
];
const headers = {
  apikey: config.supabaseAnonKey,
  Authorization: `Bearer ${config.supabaseAnonKey}`,
  Prefer: "count=exact",
  Range: "0-0"
};
for (const table of tables) {
  const response = await fetch(
    `${config.supabaseUrl}/rest/v1/${table}?select=id`, { headers }
  );
  const count = /\/(\d+)$/.exec(
    response.headers.get("content-range") || ""
  )?.[1] ?? null;
  await response.arrayBuffer();
  console.log({ table, status: response.status, count });
}
'@ | node -
```

### 운영 DB에서 아직 필요한 read-only SQL

```sql
select
  schemaname, tablename, policyname, permissive, roles, cmd,
  qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity,
  c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
```

추가로 table별 count, indexed column과 payload 상태 불일치, 공개 payload의 민감 key 존재 건수, Program FK orphan count를 값이 아닌 집계로 확인해야 한다.

### 테스트

```powershell
node --test tests/*.test.mjs
```

결과: Node v24.18.0에서 **183/183 통과, 실패 0**. 보안 관련 선별 테스트도 26/26 통과했다. 다만 현재 테스트는 라이브 Supabase의 direct PostgREST raw-row 노출을 검증하지 않으므로 Critical 문제를 잡지 못했다.

`pnpm test`는 현재 비대화식 환경에서 pnpm이 modules directory purge 확인을 요구해 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`로 시작 전에 중단됐다. 동일 underlying Node test suite는 위 명령으로 직접 통과했다.

## 미완료 · 막힌 점

- 운영 `pg_policies`, grants, private Storage bucket 정책은 anon 권한으로 조회할 수 없어 local migration 전문과 live behavior만 대조했다. Supabase SQL Editor의 read-only 관리자 session이 필요하다.
- Program Supabase의 DDL/RLS/실제 row count와 production Netlify Blob count는 staff/admin read-only 접근 없이는 확인할 수 없다.
- Partner/Team/Admin 실제 계정별 브라우저 walkthrough는 감사용 test credential이 없어 수행하지 않았다.
- Terms/Privacy 내용의 완결성은 운영주체·문의처·실제 위탁/제3자 제공 정보와 법무 승인이 필요하다.
- `.git`이 없어 commit 작성·hash 보고·history secret audit가 불가능하다. 새 Git 저장소를 임의로 만들지 않았다.
- Phase 0 지시대로 코드·DB·설정 수정과 배포를 수행하지 않았다. 특히 Critical 취약점도 이번 단계에서는 보고만 했다.

## ASSUMPTION

- `SUPABASE_URL`이 가리키는 Auth project와 `arena_submissions` project가 동일하다고 본다. 라이브 `/api/arena-auth` 설정으로 해당 table을 읽을 수 있어 강한 근거가 있다.
- Program Supabase는 별도 환경변수·URL을 사용하므로 Arena/Auth와 다른 project일 가능성이 높다. 외부에서는 project identity를 확정하지 않았다.
- 로컬 source와 2026-08-08 라이브 배포 bundle이 동일하다고 가정하지 않았다. 마크업·endpoint behavior는 라이브에서 별도로 확인했고, 세부 server 로직은 로컬 source 기준으로 기록했다.
- `SPARKCLAW_PROGRAM_DB_ALLOWED_EMAILS`와 feature flag의 production 값은 외부에서 확인할 수 없다.
- 404를 반환한 Competition table은 “미배포” 또는 “PostgREST 비노출” 중 하나다. anon 권한만으로 둘을 구분하지 않았다.
- anon-visible `arena_submissions` 1건은 전체 Tech Passport 수가 아니라 현재 RLS를 통과한 최소 공개 건수다.
- 로컬 `private/`, `outputs/`의 credential artifact가 현재 `public` deploy에는 포함되지 않는다고 Netlify publish root와 `.gitignore`를 근거로 판단했다. 별도 백업/동기화 채널은 확인하지 못했다.

## 반박

- **“익명 HTML에 admin markup이 있으면 곧 admin data breach다”는 지시는 그대로는 맞지 않는다.** 현재 admin panel은 monolithic SPA 때문에 전달되지만 server API는 익명 401로 막힌다. UI 숨김은 인가가 아니지만, 실제 데이터 경계는 server-side 검사다. 다만 별개 Supabase direct REST 경로에서 실제 Critical 유출이 확인됐다.
- **“클라이언트가 table명을 자유롭게 지정하면 곧 치명적 SQL injection이다”도 현재 구현에는 정확하지 않다.** identifier와 OpenAPI schema membership 검사가 있어 임의 문자열/SQL 주입은 막힌다. 실제 문제는 명시적 allowlist가 없고 service key의 전체 exposed schema를 자동 신뢰하는 과도한 blast radius다.
- **“Supabase 각 table의 정책 전문을 저장소만으로 운영값이라고 단정”할 수 없다.** migration 적용 여부와 drift는 관리자 catalog 조회가 필요하다. 이 문서는 local policy와 live behavior를 분리했다.
- **“Competition table이 현재 Bounty의 system of record다”는 현재 코드와 맞지 않는다.** SQL은 정의되어 있으나 runtime은 Netlify Blob event stream을 사용한다. 다음 단계에서는 migration을 더하기 전에 어느 쪽을 canonical로 할지 결정해야 한다.
- **“Brief와 Bounty가 각각 table에 저장된다”는 현재 코드와 맞지 않는다.** Public Brief와 Bounty 모두 Blob collection/event로 저장되며 전용 relational table이 없다.
- **“90일 보유 정책이 구현돼 있다”는 표현은 과장이다.** 현재는 `retentionReviewAt` metadata만 생성하고 실행되는 review/delete job이 없다.
- **“Bounty가 아직 구현되지 않았다”는 표현도 맞지 않는다.** backend, Board, submission, leaderboard, staff control이 구현되어 있으나 Coming Soon copy, feature flag, navigation이 서로 충돌한다.
- **“Edge Function”은 현재 stack에 없다.** 대응 대상은 Netlify Functions다.
- **“약 100개 Team”은 현재 운영 사실로 확인되지 않았다.** 로컬 applicant snapshot은 628 unique 지원팀이고, 정적 seed는 168 startups이며, 실제 Program DB 참가기업 count는 확인하지 못했다. 세 숫자는 서로 다른 모집단이다.
- **“한 작업 = 한 커밋”은 현재 전달된 workspace에서 실행할 수 없다.** `.git`이 없는 snapshot에 history를 새로 만드는 것은 감사 범위를 벗어나므로 commit hash를 N/A로 보고한다.

## Phase 0 중단점

지시서의 승인 gate에 따라 여기서 멈춘다. 다음 단계에서 가장 먼저 해야 할 일은 Critical `arena_submissions` 공개 정책과 기존 public payload의 민감정보를 차단하는 것이다. 승인 전에는 Phase 1/P0 구현, migration, 데이터 정리, key 변경, feature flag 변경, 자동 배포를 시작하지 않는다.
