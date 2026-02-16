# WritingEditor 통합 프로젝트 문서 (단일 기준본)

작성일: 2026-02-16  
기준 경로: `C:\dlatl\WritingEditor`  
기준 브랜치: `main`  
원격 저장소: `https://github.com/leydian/WritingEditor`  
현재 앱 스크립트 버전: `index.html` -> `app.js?v=62`

## 1. 문서 통합 범위

이 문서는 아래 문서들의 내용을 최신 코드 기준으로 통합한 단일 기준본이다.

- 인수인계 문서(`PROJECT_HANDOFF_*`)
- 실행 계획(`PROJECT_EXECUTION_PLAN_*`)
- QA 시나리오/실행 로그(`QA_*`)
- 운영 문서(`DEPLOY.md`, `SUPABASE.md`)
- 오류 메시지 표준안(`ERROR_MESSAGE_STANDARD.md`)
- 리체크 보고서(`RECHECK_REPORT_*`)

본 리포지토리의 프로젝트 기준 문서는 이 파일 1개만 유지한다.

## 2. 현재 제품 상태 요약

1. 인증
- 이메일/비밀번호 로그인, 회원가입 지원
- 익명 로그인 지원
- 익명 계정 -> 이메일 계정 전환 지원

2. 탈퇴/로그아웃
- 일반 계정 탈퇴: 재로그인 검증 후 진행
- 익명 계정 로그아웃: 자동 탈퇴(계정/원격/로컬 데이터 정리)
- 탈퇴 확인 게이트: 체크박스 + 확인문구 입력

3. 동기화/저장
- 로컬 상태 저장 + Supabase 원격 동기화
- 자동 동기화 + 수동 동기화 버튼(`지금 동기화`)
- 계정 전환 시 stale 로컬 업로드 방지 로직 반영

4. 히스토리
- `historyEntries` 기반 전역 히스토리(최대 10개)
- 복원 시 snapshot 기반 전체 상태 복원
- 히스토리 검색 기능 제거(요구사항 반영)

5. 포모도로/달력
- 집중/휴식 타이머 + 집중시간 누적
- 달력 달성 표시 + 월간 표 보기 제공(달력/표 토글)
- 오늘 목표 고정 기능 제공
- 목표 기준 선택: 체크박스로 공백 포함/공백 제외 기준 전환

6. 레이아웃/모바일
- 모바일 미니모드(`<=900px`) 동작
- 모바일에서 문서/달력 드로어 토글
- 왼쪽 사이드바 드래그 폭 조절 + 오른쪽 달력 패널 드래그 폭 조절
- 데스크톱 edge bar 복구 흐름 유지

7. 내보내기
- TXT/PDF 내보내기 지원
- 모바일 호환 보강(iOS Blob 다운로드 fallback, PDF popup/print fallback)

## 3. 최근 작업 타임라인(요약)

최신 커밋 기준 주요 변경(최신순):

1. `5e2805b` 오늘 목표 고정 시 입력칸 숨김 + 목표 기준 선택(공백 포함/제외)
2. `5bd4c24` 모바일 내보내기(TXT/PDF) 호환 보강
3. `60a216c` 오른쪽 패널 리사이즈, 달력 표 보기, 히스토리 검색 제거, 트리 문구 정리
4. `5ae6763` 오류 처리 통합(`showUiError`) + `error-utils` 테스트 추가
5. `3f0e897` QA/운영 문서 체계화 + 오류 메시지 표준화
6. `895798d` 탈퇴 흐름 JWT 만료 보완
7. 그 이전: 모바일 미니모드/툴바/드로어 UX 일련 개선

## 4. 현재 UI 정책(확정본)

1. 문서 트리
- 루트 버튼 라벨: `+ 문서 생성`, `+ 폴더 생성`

2. 달력 달성 영역
- `오늘 목표 글자 수` 입력
- `공백 제외로 목표 체크` 체크박스
  - 체크 해제: 공백 포함 기준
  - 체크: 공백 제외 기준
- `오늘 목표 고정` 버튼
  - 고정 시 목표 입력칸 숨김
  - 고정 시 체크박스 비활성화
- 보기 토글
  - `달력 보기`
  - `표 보기`

3. 히스토리
- 검색 입력 없음
- 목록 + 복원만 제공

## 5. 핵심 기술 메모

1. 상태 키
- `we-proto-state-v1` (앱 상태)
- `we-layout-prefs-v1` (레이아웃)
- `we-sidebar-width` (좌측 폭)
- `we-calendar-width` (우측 폭)
- `we-last-user-id` (사용자 추적)

2. 주요 상태 필드
- `historyEntries`
- `goalByDate`
- `goalLockedByDate`
- `goalMetricByDate` (`withSpaces`/`noSpaces`)
- `focusSecondsByDate`

3. 오류 처리
- 공통 유틸: `error-utils.js`
- UI 오류 통합 함수: `showUiError(...)`

4. 테스트
- `tests/error-utils.test.js` (메시지 매핑/오류 유틸 최소 단위 테스트)

## 6. Supabase 운영 기준

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

`select/insert/update own state` 정책은 `auth.uid() = user_id` 기준으로 유지한다.

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

## 7. 배포/도메인 운영 기준

1. GitHub Pages
- Source: branch deploy
- Branch: `main`
- Folder: `/(root)`

2. 기본 URL
- `https://leydian.github.io/WritingEditor/`

3. 커스텀 도메인
- 한글: `창영소글쓰기.xyz`
- punycode: `xn--bj0bpd595digd6qbu0t.xyz`

4. DNS 기준
- `@` A: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- `www` CNAME: `leydian.github.io`

## 8. QA 진행 현황

최신 수동 QA 결과(사용자 확인):

1. A-1 이메일 회원가입: 성공
2. A-2 이메일 로그인: 성공
3. A-3 익명 시작: 성공
4. A-4 익명 -> 이메일 전환: 성공
5. W-1 일반 계정 탈퇴: 성공
6. W-2 익명 자동탈퇴: 성공
7. R-1 히스토리: 성공
8. R-2 동기화: 성공
9. R-3 모바일 미니모드: 성공

요약: 성공 9 / 실패 0 / 보류 0

## 9. 알려진 리스크와 다음 우선순위

1. 최소 테스트는 오류 유틸 중심이며, 상태/타이머/히스토리 핵심 로직 자동테스트 확장이 필요하다.
2. 모바일 내보내기는 브라우저별 정책 차이가 있어 실제 단말 회귀 확인을 계속 유지해야 한다.
3. 도메인/Pages/Supabase Redirect URL 정합성은 운영 변경 시 재검증이 필요하다.

다음 우선순위:

1. 상태 정규화/히스토리/타이머 단위 테스트 확대
2. 내보내기 기능(특히 모바일) 디바이스 매트릭스 테스트
3. 운영 체크리스트 자동화(배포 전 점검 스크립트)

---

이 문서는 2026-02-16 기준 전체 진행 내역과 현재 코드 상태를 단일 문서로 통합한 공식 기준본이다.
