# WritingEditor

단일 페이지 기반 글쓰기 에디터 프로젝트입니다.

## 프로젝트 구조

- `index.html`: 앱 엔트리
- `app.js`: 핵심 로직
- `styles.css`: 스타일
- `error-utils.js`: 오류 처리 유틸
- `state-utils.js`: 상태 처리 유틸
- `tests/`: 유닛 테스트
- `scripts/`: 점검/자동화 스크립트
- `docs/PROJECT_UNIFIED.md`: 단일 기준 운영 문서

## 시작 전 체크

1. `docs/PROJECT_UNIFIED.md`를 먼저 확인
2. 아래 검증 실행

```bash
node .\tests\crypto-utils.test.js
node .\tests\error-utils.test.js
node .\tests\state-utils.test.js
node .\scripts\security-preflight-check.js
```

## 현재 우선순위

1. 암호화 잠금 해제 UX 고도화(비밀번호 변경/잠금 만료 플로우)
2. 동기화 충돌 UX 개선(confirm -> 명시적 선택 UI)
3. 모바일 실단말 회귀(iOS Safari, Android Chrome)
4. 런북/회귀 체크리스트 주기 점검
