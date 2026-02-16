# WritingEditor 통합 프로젝트 문서 (단일 기준본)

작성일: 2026-02-16  
최종 갱신: 2026-02-16 (최신 커밋 반영)  
기준 경로: `C:\dlatl\WritingEditor`  
기준 브랜치: `main`  
원격 저장소: `https://github.com/leydian/WritingEditor`  
현재 앱 버전: `index.html` -> `app.js?v=74`  
현재 스타일 버전: `index.html` -> `styles.css?v=2`

## 1. 문서 목적 / 운영 원칙

이 문서는 아래 문서/로그를 최신 코드 기준으로 통합한 **유일 기준본**이다.

- 인수인계 문서(`PROJECT_HANDOFF_*`)
- 실행 계획(`PROJECT_EXECUTION_PLAN_*`)
- QA 시나리오/실행 로그(`QA_*`)
- 운영 문서(`DEPLOY.md`, `SUPABASE.md`)
- 오류 메시지 표준안(`ERROR_MESSAGE_STANDARD.md`)
- 리체크 보고서(`RECHECK_REPORT_*`)

원칙:

1. 본 파일 1개만 유지한다.
2. UI/기능/운영/리스크 변경 시 본 파일을 즉시 갱신한다.
3. 다음 세션은 본 문서 확인 후 바로 작업에 들어간다.

---

## 2. 현재 제품 상태 (최신)

### 2.1 인증 / 계정

- 이메일/비밀번호 회원가입/로그인 지원
- 익명 로그인 지원
- 익명 계정 -> 이메일 계정 전환 지원
- 탈퇴:
  - 일반 계정: 재로그인 검증 + 확인 게이트
  - 익명 계정: 로그아웃 시 자동 탈퇴(계정/원격/로컬 데이터 정리)

### 2.2 동기화 / 저장

- 로컬 상태(`localStorage`) + Supabase `editor_states` 원격 동기화
- 수동 동기화 버튼(`지금 동기화`) + 자동 동기화
- 계정 전환 시 stale 로컬 업로드 방지
- **P0 적용 완료**: 일반 로그아웃 직전 강제 동기화 시도, 실패 시 로그아웃 강행 여부 확인
- **P1 적용 완료**:
  - push 전 세션 신선도 확인(`ensureFreshAuthSession`)
  - 원격 `updated_at` 기반 충돌 감지 후 덮어쓰기 확인
  - fallback(compat client) `refreshSession()` 구현

### 2.3 에디터 / 히스토리

- `historyEntries` 전역 히스토리(최대 10개)
- snapshot 기반 전체 상태 복원
- 히스토리 검색 기능 제거(요구사항 반영)

### 2.4 분할 레이아웃

- 단일 / 좌우 / 상하 분할 지원
- **신규**: 좌우/상하 분할에서 경계선 드래그로 비율 조절
  - 상태: `splitRatioByMode.vertical/horizontal`
  - 비율 범위: 20~80%
  - 모바일(`<=900px`)에서는 비활성

### 2.5 뽀모도로 / 달성 기록

- 집중/휴식 타이머 + 집중시간/횟수 누적
- **신규**: 집중/휴식 분 직접 설정 가능
  - 입력 범위: 1~180
  - 표시 폭: 3자리 중심(가독성 조정)
  - 적용 버튼 + change 이벤트 동기 반영
- 달력/표 보기 토글 지원
- 목표 고정 지원 (`목표 고정` / `목표 고정 해제`)

### 2.6 모바일 / 내보내기

- 모바일 미니모드(`<=900px`) + 문서/달력 드로어 토글
- TXT/PDF 내보내기 지원
- **모바일 내보내기 보강 완료**
  - TXT: UTF-8 BOM 바이트 명시
  - iOS Safari: 공유 시트(`navigator.share` + `File`) 우선, fallback 제공
  - PDF: popup/print fallback

### 2.7 UI 용어/정책 (확정 반영)

- `문서 트리` -> `문서 목록`
- 루트 생성 라벨: `📄 새 문서 생성`, `📁 새 폴더 생성`
- `Pomodoro` -> `뽀모도로`
- `달력 달성` -> `달성 기록`
- `오늘 목표 고정` -> `목표 고정`
- `공백 제외로 목표 체크` -> `공백 제외`
- 숫자 노출(기록/표/진행률): `###,###` 포맷(천 단위 콤마)

---

## 3. 보안/신뢰성 상태

### 3.1 완료된 보강

- PDF 내보내기 XSS 하드닝:
  - `document.write` 동적 문자열 삽입 제거
  - DOM API + `textContent` 사용
- CSP 추가:
  - `default-src 'self'`
  - `script-src 'self' https://cdn.jsdelivr.net https://unpkg.com`
  - `connect-src 'self' https://*.supabase.co`
  - `img-src 'self' data: blob:`
  - `style-src 'self' 'unsafe-inline'`
  - `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `form-action 'self'`
- 숫자 입력 스핀 버튼 제거:
  - `#goal-input`, `#pomodoro-focus-min`, `#pomodoro-break-min`

### 3.2 P2 자동 점검 도구

- `scripts/security-preflight-check.js`
- 점검 항목:
  - CSP 존재 여부
  - 동적 `document.write` 감지
  - 템플릿 기반 `innerHTML` 경고

실행:

```bash
node .\scripts\security-preflight-check.js
```

현재 상태:

- CSP: OK
- 동적 `document.write`: OK
- 템플릿 `innerHTML`: 경고 1건(기능상 즉시 문제는 없으나 DOM API 전환 권장)

---

## 4. 핵심 기술 메모

### 4.1 상태 키

- `we-proto-state-v1` (앱 상태)
- `we-layout-prefs-v1` (레이아웃)
- `we-sidebar-width` (좌측 폭)
- `we-calendar-width` (우측 폭)
- `we-last-user-id` (사용자 추적)

### 4.2 주요 상태 필드

- `historyEntries`
- `goalByDate`
- `goalLockedByDate`
- `goalMetricByDate` (`withSpaces`/`noSpaces`)
- `focusSecondsByDate`
- `splitRatioByMode` (`vertical`/`horizontal`)
- `pomodoroMinutes` (`focus`/`break`)

### 4.3 공통 유틸 / 테스트

- 오류 유틸: `error-utils.js`
- 상태 유틸: `state-utils.js`
- 테스트:
  - `tests/error-utils.test.js`
  - `tests/state-utils.test.js`

실행:

```bash
node .\tests\error-utils.test.js
node .\tests\state-utils.test.js
```

---

## 5. Supabase 운영 기준

1. 앱은 내장 URL/Anon 설정을 사용한다.
2. 보안은 RLS 정책으로 통제한다.
3. 탈퇴 RPC 함수: `delete_my_account_rpc_v3` (인자 없음)

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

탈퇴 RPC(요약):

```sql
create or replace function public.delete_my_account_rpc_v3()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  delete from public.editor_states where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
  return jsonb_build_object('ok', true);
end;
$$;
```

---

## 6. 배포 / 도메인 기준

### 6.1 GitHub Pages

- Source: branch deploy
- Branch: `main`
- Folder: `/(root)`

### 6.2 URL / 도메인

- 기본: `https://leydian.github.io/WritingEditor/`
- 커스텀(한글): `창영소글쓰기.xyz`
- punycode: `xn--bj0bpd595digd6qbu0t.xyz`

### 6.3 DNS

- `@` A:
  - `185.199.108.153`
  - `185.199.109.153`
  - `185.199.110.153`
  - `185.199.111.153`
- `www` CNAME:
  - `leydian.github.io`

---

## 7. 최근 작업 타임라인 (최신순, 중요 커밋)

1. `16120fa` 뽀모도로 설정줄 가로 정렬/간격 조정 + 숫자 천단위 포맷 적용
2. `bcde908` UI 전반 스타일 모던/우아 톤 조정 + 숫자 스핀 버튼 제거
3. `db13839` 뽀모도로 입력폭 균형 조정
4. `8157506` 뽀모도로 입력 clamp(1~180) + 3자리 가독 폭 조정
5. `134d57c` 뽀모도로 집중/휴식 시간 사용자 설정 기능 추가
6. `8172f5c` 동기화 안정화(P0/P1) + 보안 프리플라이트 스크립트(P2)
7. `420af27` UI 용어/라벨/아이콘 정리
8. `98ec7fd` 좌우/상하 분할 드래그 리사이즈
9. `1f1faee` PDF XSS 방어 + CSP 추가
10. `d2210ab` iOS Safari TXT 공유시트 fallback
11. `5d90590` 모바일 TXT 인코딩 fallback 강화
12. `bd805e3` 모바일 TXT 인코딩 수정 + 상태 유틸 테스트 확장

---

## 8. 다음 세션 즉시 실행 가이드

### 8.1 시작 전 30초 체크

1. `PROJECT_UNIFIED_2026-02-16.md` 최신 내용 확인
2. 브라우저 캐시 이슈 시 강력 새로고침
3. 아래 검증 명령 실행

```bash
node .\tests\error-utils.test.js
node .\tests\state-utils.test.js
node .\scripts\security-preflight-check.js
```

### 8.2 우선순위 백로그

1. `renderCalendarTable`의 템플릿 `innerHTML` -> DOM API 전환 (보안 경고 해소)
2. 동기화 충돌 UX 개선:
   - 현재 confirm 기반 -> 명시적 선택 모달(원격 유지/로컬 덮어쓰기)
3. 모바일 단말 회귀:
   - iPhone Safari TXT 저장 플로우
   - Android Chrome TXT/PDF
4. 동기화 회귀 테스트 시나리오 문서화:
   - 다중기기 동시 수정 충돌
   - 로그아웃 직전 동기화 실패 분기

### 8.3 리스크 (현재 잔여)

- 템플릿 `innerHTML` 경고 1건(즉시 취약점은 아니나 정책상 개선 필요)
- `localStorage` 중심 구조 특성상 XSS 발생 시 민감도 상승
- 모바일 브라우저별 다운로드 정책 차이로 실단말 회귀 필요

---

## 9. 현재 QA 스냅샷

- 기존 수동 QA 9건 성공(회원가입/로그인/익명/전환/탈퇴/히스토리/동기화/모바일)
- 최근 변경(동기화 충돌/뽀모도로 설정/UI 리디자인)은 재수동 점검 권장 항목

권장 추가 QA:

1. 동시 로그인 2기기 충돌 감지 confirm 분기
2. 로그아웃 직전 동기화 실패 시 취소/강행 분기
3. 뽀모도로 시간 설정 반영(집중/휴식 전환 시 분값 적용)
4. 숫자 포맷 표기 일관성(진행률/오늘기록/달력툴팁/표)

---

이 문서는 2026-02-16 기준 **현재 코드 상태와 운영 기준**을 반영한 최신 공식 기준본이다.
