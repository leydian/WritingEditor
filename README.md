# WritingEditor

단일 페이지 기반 글쓰기 에디터 프로젝트입니다.

## 프로젝트 구조

- `index.html`: 앱 엔트리
- `app.js`: 핵심 로직(인증/동기화/에디터/암호화 연동)
- `crypto-utils.js`: 암복호화 유틸(AES-GCM + PBKDF2)
- `styles.css`: 스타일
- `error-utils.js`: 오류 처리 유틸
- `state-utils.js`: 상태 처리 유틸
- `auth-service.js`: 인증 세션/탈퇴 서비스 유틸
- `auth-config-service.js`: Supabase 설정/초기화 서비스 유틸
- `sync-utils.js`: 동기화 계산/충돌 판정 유틸
- `ui-bindings.js`: UI 이벤트 바인딩 모듈
- `tests/`: 유닛 테스트
- `scripts/`: 점검/자동화 스크립트
- `docs/PROJECT_UNIFIED.md`: 단일 기준 운영 문서
- `docs/ENCRYPTION_RUNBOOK.md`: 암호화 운영/장애 대응
- `docs/SYNC_REGRESSION_CHECKLIST.md`: 동기화 회귀 체크리스트

## 인증 모델

- 사용자 경험: `아이디 + 비밀번호`
- 내부 구현: Supabase 호환을 위해 `아이디 -> synthetic email(@id.writingeditor.local)` 매핑 사용
- 익명 로그인: 지원(암호화 미적용 정책)

## 시작 전 체크

1. `docs/PROJECT_UNIFIED.md` 확인
2. 아래 검증 실행

```bash
node .\tests\crypto-utils.test.js
node .\tests\error-utils.test.js
node .\tests\state-utils.test.js
node .\tests\auth-service.test.js
node .\tests\auth-config-service.test.js
node .\tests\sync-utils.test.js
node .\tests\ui-bindings.test.js
node .\scripts\security-preflight-check.js
```

## 현재 우선순위

1. 아이디 인증 UX 보강(정책 안내/에러 메시지)
2. 암호화 잠금 해제/재암호화 UX 고도화
3. 동기화 충돌 UX 개선(confirm -> 명시적 선택 UI)
4. 모바일 실단말 회귀(iOS Safari, Android Chrome)
