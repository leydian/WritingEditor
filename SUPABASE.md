# SUPABASE 운영 문서

기준 일자: 2026-02-16  
기준 코드: `app.js?v=59`

## 1. 개요

이 프로젝트는 Supabase Auth + `editor_states` 테이블을 사용해 사용자별 편집 상태를 저장한다.

## 2. 프런트 설정

`app.js` 내장 상수:

- `EMBEDDED_SUPABASE_URL`
- `EMBEDDED_SUPABASE_ANON`

현재 값은 코드에 포함되어 있으며, 프런트 앱 특성상 완전 비공개는 불가능하다.  
보안은 반드시 RLS 정책으로 통제한다.

## 3. 필수 테이블/정책

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

중복 정책 에러가 나오면 기존 정책을 삭제 후 재생성하거나 생성문을 건너뛴다.

## 4. 회원탈퇴 RPC

앱에서 호출하는 함수명: `delete_my_account_rpc_v3` (인자 없음)

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

## 5. 검증 SQL

```sql
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname='delete_my_account_rpc_v3';
```

정상 기대값:

- 1행 반환
- `args` 빈 값

## 6. 앱 동작 연관 포인트

`app.js` 기준:

- 업서트: `supabase.from('editor_states').upsert(...)`
- 로드: `supabase.from('editor_states').select(...).eq('user_id', ...)`
- 원격 상태 삭제: `deleteRemoteStateImmediately()`
- 탈퇴 RPC 호출: `deleteOwnAccountImmediately()`

## 7. 운영 체크리스트

1. Auth 설정에서 이메일/익명 로그인 정책이 의도대로 켜져 있는지 확인
2. RLS 활성화 및 정책 누락 여부 확인
3. RPC 함수 존재/실행 권한 확인
4. 탈퇴 후 `editor_states`/`auth.users` 정리 여부 테스트
5. 도메인 확정 후 Auth Redirect URL/Site URL 동기화
