# WritingEditor 통합 프로젝트 문서 (단일 기준본)

작성일: 2026-02-16  
최종 갱신: 2026-02-16 (최신 커밋 `de5aa22` 반영)  
기준 경로: `C:\dlatl\WritingEditor`  
기준 브랜치: `main`  
원격 저장소: `https://github.com/leydian/WritingEditor`  
현재 앱 버전: `index.html` -> `app.js?v=78`  
현재 스타일 버전: `index.html` -> `styles.css?v=7`

## 0. 진행현황 요약 (이번 사이클)

이번 사이클에서 완료된 핵심 작업:

1. 문서 체계 정리
- 통합 문서를 `docs/PROJECT_UNIFIED.md`로 고정
- 운영/회귀 문서 추가: `docs/ENCRYPTION_RUNBOOK.md`, `docs/SYNC_REGRESSION_CHECKLIST.md`

2. UI/테마 개선
- 회색+그린 톤으로 전면 리테마
- 뽀모도로/오늘 기록/달성 기록 타이틀 정렬 및 크기 통일
- 뽀모도로 설정줄/표시줄 레이아웃 개선

3. 보안/신뢰성 개선
- `renderCalendarTable`의 템플릿 `innerHTML` 제거(DOM API 전환)
- `security-preflight-check` 경고 0건 상태 달성
- 자동 동기화 실패 시 지수 백오프 재시도(최대 3회) 추가

4. 암호화 기능 도입
- 일반 계정: 로그인 비밀번호 기반 데이터 암호화(AES-GCM + PBKDF2)
- 익명 계정: 암호화 미적용 정책 유지
- 암호화 잠금 해제 모달 도입(`prompt` 제거)

5. 인증 모델 전환
- 사용자 경험 기준: 아이디+비밀번호 가입/로그인
- 내부 구현: Supabase 호환을 위한 `아이디 -> synthetic email` 매핑
- 익명 로그인 회귀 이슈 수정 완료

---

## 1. 문서 목적 / 운영 원칙

이 문서는 아래 문서/로그를 최신 코드 기준으로 통합한 **유일 기준본**이다.

- 인수인계 문서(`PROJECT_HANDOFF_*`)
- 실행 계획(`PROJECT_EXECUTION_PLAN_*`)
- QA 시나리오/실행 로그(`QA_*`)
- 운영 문서(`DEPLOY.md`, `SUPABASE.md`)
- 오류 메시지 표준안(`ERROR_MESSAGE_STANDARD.md`)
- 리체크 보고서(`RECHECK_REPORT_*`)

원칙:

1. 본 파일 1개를 기준 문서로 유지한다.
2. UI/기능/운영/리스크 변경 시 본 파일을 즉시 갱신한다.
3. 다음 세션은 본 문서 확인 후 바로 작업에 들어간다.

---

## 2. 현재 제품 상태 (최신)

### 2.1 인증 / 계정

- 아이디+비밀번호 회원가입/로그인 지원
- 익명 로그인 지원
- 익명 계정 -> 일반 계정 전환 지원
- 탈퇴:
  - 일반 계정: 재로그인 검증 + 확인 게이트
  - 익명 계정: 로그아웃 시 자동 탈퇴(계정/원격/로컬 데이터 정리)

인증 구현 메모:

- Supabase 호환을 위해 내부적으로 `아이디 -> synthetic email` 매핑 사용
- synthetic domain: `id.writingeditor.local`
- 기존 이메일 입력도 호환 경로로 유지(입력값에 `@` 포함 시 이메일로 처리)

### 2.2 데이터 암호화

- 일반 계정:
  - 로컬(`localStorage`) + 원격(`editor_states.state_json`) 상태 암호화 저장
  - 키: 로그인 비밀번호 기반 유도
  - 알고리즘: `AES-GCM-256`
  - KDF: `PBKDF2-SHA-256`
- 익명 계정:
  - 암호화 미적용(기존 평문 경로 유지)
- 잠금 해제 UX:
  - 전용 모달(`encryption-unlock-dialog`)로 비밀번호 입력
  - 로그아웃 시 메모리 키 폐기

### 2.3 동기화 / 저장

- 로컬 상태 + Supabase `editor_states` 원격 동기화
- 수동 동기화 버튼(`지금 동기화`) + 자동 동기화
- 계정 전환 시 stale 로컬 업로드 방지
- 자동 동기화 실패 시 지수 백오프 재시도(최대 3회)
- 일반 로그아웃 직전 강제 동기화 시도, 실패 시 강행 여부 확인
- push 전 세션 신선도 확인(`ensureFreshAuthSession`)
- 원격 `updated_at` 기반 충돌 감지 후 덮어쓰기 확인

### 2.4 에디터 / 히스토리

- `historyEntries` 전역 히스토리(최대 10개)
- snapshot 기반 전체 상태 복원
- 히스토리 검색 기능 제거(요구사항 반영)

### 2.5 분할 레이아웃

- 단일 / 좌우 / 상하 분할 지원
- 좌우/상하 분할에서 경계선 드래그 비율 조절
  - 상태: `splitRatioByMode.vertical/horizontal`
  - 비율 범위: 20~80%
  - 모바일(`<=900px`)에서는 비활성

### 2.6 뽀모도로 / 달성 기록

- 집중/휴식 타이머 + 집중시간/횟수 누적
- 집중/휴식 분 직접 설정(1~180)
- 뽀모도로 패널 레이아웃/가독성 개선(설정줄/표시줄 정렬)
- 달력/표 보기 토글, 목표 고정 지원

### 2.7 모바일 / 내보내기

- 모바일 미니모드(`<=900px`) + 문서/달력 드로어 토글
- TXT/PDF 내보내기 지원
- iOS Safari 공유시트 fallback, TXT BOM 처리 보강 완료

### 2.8 UI/테마

- 회색+그린 톤으로 전체 테마 통일
- 툴바/중앙 에디터 잔여 블루 톤 제거
- 익명 로그인 사용자 표시: `익명로그인`

---

## 3. 보안 / 신뢰성 상태

### 3.1 완료된 보강

- PDF 내보내기 XSS 하드닝 (`document.write` 제거)
- CSP 적용
- 템플릿 `innerHTML` 제거(`renderCalendarTable` DOM API 전환)
- 숫자 입력 스핀 버튼 제거

### 3.2 자동 점검

- 스크립트: `scripts/security-preflight-check.js`
- 현재 상태:
  - CSP: OK
  - 동적 `document.write`: OK
  - 템플릿 `innerHTML`: OK

실행:

```bash
node .\scripts\security-preflight-check.js
```

---

## 4. 테스트 / 검증 기준

테스트 파일:

- `tests/crypto-utils.test.js`
- `tests/error-utils.test.js`
- `tests/state-utils.test.js`

검증 명령:

```bash
node .\tests\crypto-utils.test.js
node .\tests\error-utils.test.js
node .\tests\state-utils.test.js
node .\scripts\security-preflight-check.js
```

---

## 5. Supabase 운영 기준

1. 앱은 저장된 설정 또는 배포 주입 설정(`__WE_SUPABASE_URL__`, `__WE_SUPABASE_ANON__`)을 우선 사용한다.
2. 주입값이 없으면 코드 기본값으로 fallback한다.
3. 보안은 RLS 정책으로 통제한다.
4. 탈퇴 RPC 함수: `delete_my_account_rpc_v3` (인자 없음)

필수 SQL(요약):

```sql
create table if not exists public.editor_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.editor_states enable row level security;
```

정책 기준:

- `select/insert/update own state`는 `auth.uid() = user_id`

---

## 6. 최근 작업 타임라인 (최신순)

1. `de5aa22` 아이디 우선 인증 플로우 도입(Supabase 호환 매핑)
2. `8a33daf` Supabase 설정 하드닝 이후 익명 로그인 회귀 수정
3. `be65f9f` 암호화 흐름/동기화 재시도/운영 문서 보강
4. `474bb77` 일반 계정 로그인 비밀번호 기반 데이터 암호화 도입
5. `44a05ad` 툴바 잔여 블루 제거 + 익명 사용자 라벨 개선
6. `3ecf981` 톤다운 회색+그린 테마 2안 적용
7. `be6b69a` 회색+그린 테마 적용
8. `92ba760` 문서 구조 정리 + 뽀모도로 패널 UI 개선
9. `faf6032` 통합 기준 문서 최신화
10. `16120fa` 뽀모도로 행 레이아웃/숫자 포맷 개선

---

## 7. 다음 세션 즉시 실행 가이드

### 7.1 시작 전 30초 체크

1. `docs/PROJECT_UNIFIED.md` 최신 내용 확인
2. 강력 새로고침(캐시 이슈 방지)
3. 아래 검증 명령 실행

```bash
node .\tests\crypto-utils.test.js
node .\tests\error-utils.test.js
node .\tests\state-utils.test.js
node .\scripts\security-preflight-check.js
```

### 7.2 우선순위 백로그

1. 아이디 인증 UX 보강
- 아이디 정책 안내/중복/예약어 정책 명확화
- 계정 전환/탈퇴 문구 일관성 강화

2. 암호화 UX 고도화
- 비밀번호 변경 직후 재암호화/복구 플로우 구체화
- 잠금 상태 오류 메시지 세분화

3. 동기화 충돌 UX 개선
- confirm 기반 분기 -> 명시적 선택 모달

4. 모바일 실단말 회귀
- iPhone Safari, Android Chrome 시나리오 주기 점검

### 7.3 현재 리스크

- 일반 계정은 복호화에 로그인 비밀번호가 필요(분실 시 접근 불가)
- `localStorage` 중심 구조 특성상 XSS 발생 시 민감도 상승
- 아이디 매핑 도메인(`id.writingeditor.local`) 운영 정책 문서화 추가 필요

---

## 8. 참고 문서

- 작업 이력 인덱스: `docs/WORKLOG_INDEX.md`
- 암호화 운영: `docs/ENCRYPTION_RUNBOOK.md`
- 동기화 회귀: `docs/SYNC_REGRESSION_CHECKLIST.md`
- 진행 요약: `docs/PROGRESS_SUMMARY_2026-02-16.md`
- 프로젝트 개요: `README.md`

---

이 문서는 2026-02-16 기준 **현재 코드 상태와 운영 기준**을 반영한 최신 공식 기준본이다.
