# WritingEditor 상세 인수인계 문서 (2026-02-16)

프로젝트 경로: `D:\ckddudth`  
핵심 파일: `index.html`, `styles.css`, `app.js`  
현재 스크립트 버전: `index.html`에서 `app.js?v=59` 로드

## 1. 현재 앱 핵심 상태 요약

1. 인증 방식
- 이메일/비밀번호 로그인 + 회원가입 가능
- 익명 로그인(`익명으로 시작`) 가능
- 익명 로그인 후 상단에 `회원가입` 버튼 표시(익명 계정 전환용)

2. 탈퇴/로그아웃 정책
- 일반 계정:
  - 로그아웃 시 로그인 화면으로 이동
  - 로그인 화면에서 `회원 탈퇴` 버튼 사용 가능(로그아웃 이후에만 표시)
- 익명 계정:
  - 로그아웃 버튼 라벨이 `로그아웃(자동 탈퇴)`로 표시
  - 로그아웃 즉시 자동 회원탈퇴(계정 삭제 + 원격 데이터 삭제 + 로컬 데이터 삭제)

3. 데이터 저장/동기화
- 로컬 상태 키: `we-proto-state-v1`
- Supabase 설정 키: `we-supabase-config-v1`
- 마지막 로그인 사용자 추적 키: `we-last-user-id`
- 레이아웃 키: `we-layout-prefs-v1`
- 사이드바 폭 키: `we-sidebar-width`
- 자동 동기화: 30분
- 수동 동기화: `지금 동기화`

4. 히스토리 시스템
- 전역 히스토리 `historyEntries` 중심
- 최대 10개 보관
- 검색창 있음 (`#history-search`)
- 복원 시 snapshot 기반 전체 상태 복원(히스토리 목록은 유지)

5. Pomodoro/오늘 기록
- 집중 완료 시 `집중 횟수` +1
- 새로 추가: `집중 시간` 표시
- 집중 시간은 `집중 모드에서 실제로 흐른 시간(초)`만 누적
- 오늘 기록 4줄 표시:
  - 공백 포함
  - 공백 제외
  - 집중 횟수
  - 집중 시간(HH:MM:SS)

6. 배포/도메인 진행 상태
- GitHub 리포: `https://github.com/leydian/WritingEditor`
- GitHub Pages 기본 URL: `https://leydian.github.io/WritingEditor/`
- 커스텀 도메인: `창영소글쓰기.xyz` (`xn--bj0bpd595digd6qbu0t.xyz`) 연결 중
- 권한 DNS 조회 결과는 정상(A 4개 + www CNAME 확인됨), GitHub 검증 반영 대기 가능성 높음

## 2. 이번 세션에서 반영된 주요 변경 내역

## 2-1. 회원 탈퇴 기능 구축 및 고도화

적용 파일:
- `index.html`
- `styles.css`
- `app.js`

추가/변경 사항:
1. 강한 경고 문구가 있는 탈퇴 다이얼로그 추가
- 되돌릴 수 없음 안내
- 체크박스 + 확인 문구(`회원탈퇴`) 입력 필수

2. 탈퇴 시 즉시 삭제 흐름 구현
- `editor_states` 삭제
- 계정 삭제 RPC 호출
- 로컬 상태 정리

3. 재로그인 검증 추가
- 일반 계정은 탈퇴 전에 이메일/비밀번호 재확인
- 계정 불일치 시 탈퇴 중단

4. 로그인 화면에서만 탈퇴 버튼 노출
- 앱 내부 상단에서 제거
- 로그아웃 후 로그인 화면에서 표시

5. RPC 함수명 이슈 대응
- 최종 호출 함수명: `delete_my_account_rpc_v3` (인자 없음)

## 2-2. 로컬 데이터 잔존 문제 수정

문제:
- 탈퇴 후 재가입 시 예전 데이터가 남아보이는 현상

원인:
- 이전 로컬 상태가 새 계정으로 업로드될 가능성
- 탈퇴 성공 후 로컬에 default 상태를 재저장하던 흐름

수정:
1. 계정 전환 감지(`we-last-user-id`) 후 stale 로컬 업로드 방지
2. 탈퇴 성공 시 로컬 키 자체 제거
3. 익명 로그아웃 시에는 탈퇴 전에 즉시 로컬 초기화 + 키 삭제

## 2-3. Supabase 설정 입력 UI 제거 및 자동 주입

요구:
- URL/Anon Key를 사용자에게 보이지 않게
- 입력 없이 자동 연결

적용:
1. `sb-url`, `sb-anon`, `설정 저장` UI 숨김
2. 내장 설정 상수 도입:
- `EMBEDDED_SUPABASE_URL`
- `EMBEDDED_SUPABASE_ANON`
3. 저장 설정이 없으면 내장 설정 자동 사용

현재 내장값(`app.js`):
- URL: `https://rvrysnatyimuilarxfft.supabase.co`
- Anon: `sb_publishable_v_aVOb5bAPP3pr1dF7POBQ_qnxCWVho`

주의:
- Publishable/Anon 키는 프론트에서 완전 비공개 불가
- RLS/정책으로 보안 통제 필요

## 2-4. 익명 로그인 기반 전환 + 계정 전환 UX

변경:
1. 로그인 화면에 `익명으로 시작` 버튼 추가
2. 앱 상단에 익명 사용자 전용 `회원가입` 버튼 추가
3. 익명 계정을 이메일 계정으로 전환하는 다이얼로그 추가
4. 전환 후 자동 로그인 시도 추가

상세 동작:
1. 익명 로그인 후 `회원가입` 클릭
2. 이메일/비밀번호 입력 -> `auth.updateUser({ email, password })`
3. 성공 후 `signInWithPassword` 자동 시도
4. 인증 필요 정책이면 안내 메시지 분기

## 2-5. Google Drive 백업/복원 기능

상황:
- 한 차례 구현했으나 사용자 요청으로 완전 제거

현재:
- 내보내기 메뉴는 `TXT/PDF`만 존재
- Drive 관련 상수/함수/버튼/이벤트 모두 삭제됨

## 2-6. 로그인 화면 복구

요청:
- 익명만 보이지 않게, 일반 로그인 화면 다시 제공

현재 로그인 게이트:
1. 이메일 입력
2. 비밀번호 입력
3. 회원가입 버튼
4. 로그인 버튼
5. 익명으로 시작 버튼

## 2-7. 오늘 기록에 집중 시간 추가

상태 필드 추가:
- `focusSecondsByDate`

누적 규칙:
- `tickTimer()`에서 `mode === 'focus'`일 때만 1초 증가
- 휴식 시간은 집계하지 않음

표시:
- `집중 시간: HH:MM:SS`

## 3. 현재 UI 구성(핵심 요소)

1. 인증 게이트(`index.html`)
- `#auth-anon-login` 익명 시작
- `#auth-login` 이메일 로그인
- `#auth-signup` 이메일 회원가입
- `#withdraw-btn` 탈퇴 버튼(로그아웃 후 노출)

2. 상단 툴바(`index.html`)
- `#logout-btn`
- `#upgrade-account-btn` (익명 사용자에서만 표시)
- `#sync-now-btn`
- `#export-btn` -> TXT/PDF

3. 다이얼로그
- 히스토리: `#history-dialog`
- 탈퇴: `#withdraw-dialog`
- 익명계정 회원가입 전환: `#upgrade-dialog`

## 4. 현재 핵심 코드 포인트

1. 인증/초기화
- `getEmbeddedSupabaseConfig()`
- `getEffectiveSupabaseConfig()`
- `setupSupabase()`

2. 익명 사용자 처리
- `isAnonymousUser(user)`
- `authAnonymousLogin()`

3. 익명 -> 일반 계정 전환
- `openUpgradeDialog()`
- `upgradeAnonymousAccount()`

4. 탈퇴/자동탈퇴
- `deleteRemoteStateImmediately(userId)`
- `deleteOwnAccountImmediately()` -> `delete_my_account_rpc_v3`
- `executeAccountDeletionFlow(user, options)`
- `authLogout()` 익명 분기
- `authWithdraw()` 일반 탈퇴(재로그인 검증 포함)

5. 오늘 기록 집중시간
- 상태: `focusSecondsByDate`
- 누적: `tickTimer()`
- 표시: `updateProgress()`, `formatDuration()`

## 5. Supabase 필수 SQL 정리

## 5-1. editor_states 테이블/정책

```sql
create table if not exists public.editor_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.editor_states enable row level security;

create policy "select own state"
on public.editor_states
for select
to authenticated
using (auth.uid() = user_id);

create policy "insert own state"
on public.editor_states
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "update own state"
on public.editor_states
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

중복 정책 이름 오류가 날 경우:
- 기존 정책이 이미 있다는 뜻
- `drop policy if exists ...` 후 재생성하거나, 해당 생성문 건너뛰기

## 5-2. 회원탈퇴 RPC(현재 코드 기준)

```sql
drop function if exists public.delete_my_account_rpc_v3();

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

grant usage on schema public to authenticated;
grant execute on function public.delete_my_account_rpc_v3() to authenticated;

notify pgrst, 'reload schema';
```

검증 SQL:

```sql
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname='delete_my_account_rpc_v3';
```

정상:
- 1행 출력
- `args` 빈 값(인자 없음)

## 6. GitHub Pages/도메인 작업 이력

1. 배포 대상 리포
- `https://github.com/leydian/WritingEditor`

2. Pages 기본 설정
- Source: Deploy from a branch
- Branch: `main`
- Folder: `/(root)`

3. 커스텀 도메인
- 한글: `창영소글쓰기.xyz`
- punycode: `xn--bj0bpd595digd6qbu0t.xyz`

4. DNS 레코드(호스팅케이알)
- `@` A:
  - `185.199.108.153`
  - `185.199.109.153`
  - `185.199.110.153`
  - `185.199.111.153`
- `www` CNAME:
  - `leydian.github.io`

5. 실제 점검 결과
- `nslookup` 권한 NS 기준 조회에서 A 4개/CNAME 정상 확인됨
- GitHub의 `InvalidDNSError`는 전파/검증 반영 대기일 가능성 높음
- 일반적으로 수분~수시간, 길면 24~48시간 소요 가능

## 7. 현재 알려진 리스크/주의사항

1. `historyByDoc`
- `historyEntries`로 사실상 전환되었지만 `historyByDoc` 잔재 코드가 일부 존재
- 완전 제거 또는 하위호환 정책 확정 필요

2. 내장 Supabase 키
- 프런트에 상수로 박혀 있으므로 사용자에게 완전 비공개는 불가
- RLS 정책 유지 필수

3. 익명 계정 -> 이메일 전환 정책
- Supabase 이메일 인증 설정 여부에 따라 자동로그인 실패 가능
- 현재는 실패 메시지 분기 처리되어 있음

4. 도메인 반영 지연
- 권한 NS 정상이어도 GitHub 검증 지연이 있을 수 있음

## 8. 빠른 점검 체크리스트

1. 앱 실행
```powershell
cd D:\ckddudth
py -m http.server 4173
```

2. 접속/강력 새로고침
- `http://127.0.0.1:4173`
- `Ctrl+F5`

3. 인증 흐름
- 이메일 로그인/회원가입 동작
- 익명 시작 동작
- 익명 로그인 시 상단 `회원가입` 버튼 표시
- 익명 로그아웃 시 자동탈퇴/데이터 삭제

4. 탈퇴 흐름
- 일반 계정 탈퇴 다이얼로그 재로그인 검증
- 체크박스 + 확인문구 입력 게이트
- 탈퇴 후 재로그인 시 이전 데이터 잔존 여부 확인

5. 오늘 기록
- 집중 모드 타이머 실행
- `집중 시간`이 초 단위로 누적되는지 확인
- 휴식 모드 시간은 누적되지 않는지 확인

6. 동기화
- 수동 동기화 버튼
- 히스토리 기록 확인

## 9. 다음 세션 권장 작업

1. `historyByDoc` 정리 마무리
2. 탈퇴 RPC 및 RLS 점검 SQL을 리포 문서화(`DEPLOY.md`/`SUPABASE.md`)
3. GitHub Pages 배포 상태/커스텀 도메인 최종 확인
4. 도메인 확정 후 Supabase `Site URL`/`Redirect URLs` 업데이트
5. 로깅 개선(탈퇴/전환 실패 시 사용자 안내 문구 표준화)

---

이 문서는 현재 로컬 코드(`app.js?v=59`)와 세션 내 실제 수정 이력을 기준으로 작성됨.
