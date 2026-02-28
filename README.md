# WritingEditor

단일 페이지 기반 글쓰기 에디터 프로젝트입니다.

## 프로젝트 구조

- `index.html`: 앱 엔트리(모바일 하단 액션바/더보기 시트 포함)
- `app.js`: 앱 부트스트랩/조립 로직(서비스/유틸 연결)
- `crypto-utils.js`: 암복호화 유틸(AES-GCM + PBKDF2)
- `styles.css`: 스타일
- `styles/`: 디자인 토큰/레이아웃/컴포넌트/모바일 분리 스타일 계층
- `error-utils.js`: 오류 처리 유틸
- `state-utils.js`: 상태 처리 유틸
- `auth-service.js`: 인증 세션/탈퇴 서비스 유틸
- `auth-config-service.js`: Supabase 설정/초기화 서비스 유틸
- `sync-utils.js`: 동기화 계산/충돌 판정 유틸
- `ui-bindings.js`: UI 이벤트 바인딩 모듈
- `dialog-service.js`: 공통 대화상자(확인/입력/알림/선택) 서비스 모듈
- `tree-service.js`: 문서/폴더 트리 조작(생성/이동/삭제/이름변경) 서비스 모듈
- `history-service.js`: 히스토리 스냅샷/자동저장/변경량 계산 서비스 모듈
- `timer-service.js`: 뽀모도로 타이머/분 설정/표시 렌더링 서비스 모듈
- `session-flow-service.js`: 로그인/로그아웃/탈퇴/재인증 오케스트레이션 서비스 모듈
- `tests/`: 유닛 테스트
- `scripts/`: 점검/자동화 스크립트
- `docs/PROJECT_UNIFIED.md`: 단일 기준 운영 문서
- `docs/ENCRYPTION_RUNBOOK.md`: 암호화 운영/장애 대응
- `docs/SYNC_REGRESSION_CHECKLIST.md`: 동기화 회귀 체크리스트

## 인증 모델

- 사용자 경험: `아이디 + 비밀번호`
- 내부 구현: Supabase 호환을 위해 `아이디 -> synthetic email(@id.writingeditor.local)` 매핑 사용
- 익명 로그인: 지원(암호화 미적용 정책)

## 테마

- 라이트/다크 테마 동시 지원
- 툴바의 테마 버튼(🌙/☀) 또는 모바일 `더보기 > 테마 전환`으로 즉시 변경
- 선택한 테마는 `localStorage`(`we-theme-v1`)에 저장되어 재접속 시 유지

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
node .\tests\dialog-service.test.js
node .\tests\tree-service.test.js
node .\tests\history-service.test.js
node .\tests\timer-service.test.js
node .\tests\session-flow-service.test.js
node .\scripts\security-preflight-check.js
```

## 현재 우선순위

1. `app.js` 2차 분해(문서트리/히스토리/타이머/인증 조립 경계 분리)
2. 통합 흐름 테스트 보강(인증-암호화-동기화-로그아웃)
3. 암호화 잠금 해제/재암호화 UX 고도화
4. 모바일 실단말 회귀(iOS Safari, Android Chrome) 및 하단 액션바 UX 튜닝
