# 진행현황 상세 요약 (2026-03-01)

기준 저장소: `https://github.com/leydian/WritingEditor`  
기준 브랜치: `main`  
반영 범위: 대화상자 UX 표준화 + 동기화 충돌 UX 개선 + 인증 메시지 표준화 + 조립층 분해 1/2/3/4차 + Focus Studio UI 재구성 1차 + 모바일 UI 전면 리팩터

## 1. 이번 작업 목표

1. 브라우저 기본 대화상자(`confirm/prompt/alert`) 의존 제거
2. 동기화 충돌 상황에서 사용자가 의도를 명확히 선택할 수 있는 UI 제공
3. 인증/재인증 오류 메시지를 코드 기반으로 일관화

## 2. 완료 항목

### 2.1 공통 대화상자 계층 도입

- `index.html`에 공통 dialog 추가
  - `confirm-dialog`
  - `input-dialog`
  - `notice-dialog`
  - `choice-dialog`
- `app.js`에 비동기 모달 API 추가
  - `openConfirmDialog`
  - `openInputDialog`
  - `openNoticeDialog`
  - `openChoiceDialog`
- `styles.css`에 공통 dialog 메시지/입력 스타일 추가

### 2.2 기존 상호작용 전환

- 문서/폴더 생성, 이름 변경, 삭제: `prompt/confirm` -> 공통 모달
- 히스토리 안전복원 확인: `confirm` -> 공통 모달
- 로그아웃 전 마지막 동기화 실패 확인: `confirm` -> 공통 모달
- 내보내기 팝업 차단/회원탈퇴 성공·실패/타이머 완료 알림: `alert` -> 공통 모달
- 저장소 전체 기준 `confirm/prompt/alert` 호출 제거 완료

### 2.3 동기화 충돌 UX 개선

- `pushRemoteState` 충돌 분기를 3가지 선택으로 변경
  - 로컬로 덮어쓰기
  - 원격 상태 불러오기
  - 동기화 취소
- 기존 “확인/취소” 2분기보다 의사결정이 명확한 구조로 전환

### 2.4 인증 오류 메시지 표준화

- `auth-service.js`에 오류 reason 분류기 추가
  - `INVALID_CREDENTIALS`
  - `IDENTIFIER_TAKEN`
  - `WEAK_PASSWORD`
  - `INVALID_IDENTIFIER`
  - `NETWORK`
  - `RATE_LIMIT`
  - `SESSION_EXPIRED`
  - `UNKNOWN`
- 회원가입/로그인/탈퇴 재인증에서 reason 코드 기반 사용자 메시지 매핑 적용

### 2.5 조립층 분해 1차 (`dialog-service` 모듈 분리)

- 신규 모듈 `dialog-service.js` 추가
  - `createDialogApi({ getById })` 팩토리 제공
  - API: `confirm`, `input`, `notice`, `choice`
- `app.js`에서 대화상자 내부 상태/이벤트 처리 구현 제거
  - 조립층에서는 `DialogService.createDialogApi`로 생성한 API 호출만 수행
- `index.html` 스크립트 로드 순서에 `dialog-service.js` 추가
- 결과:
  - `app.js` 책임 축소(대화상자 상태 머신 제거)
  - 대화상자 관련 회귀는 독립 테스트로 검증 가능해짐

### 2.6 조립층 분해 2차 (`tree-service` 모듈 분리)

- 신규 모듈 `tree-service.js` 추가
  - `createTreeActions(deps)` 팩토리 제공
  - API: `getFolder`, `getDescendantFolderIds`, `renameDoc`, `renameFolder`, `createDoc`, `createFolder`, `deleteDoc`, `deleteFolder`, `moveDocToFolder`, `moveFolderToFolder`
- `app.js`에서 트리 조작 구현을 서비스 위임 방식으로 전환
- `index.html` 스크립트 로드 순서에 `tree-service.js` 추가
- 결과:
  - 문서/폴더 도메인 로직이 조립층에서 분리됨
  - 트리 도메인 회귀를 독립 테스트로 검증 가능해짐

### 2.7 조립층 분해 3차 (`history-service`, `timer-service` 모듈 분리)

- 신규 모듈 `history-service.js` 추가
  - `createHistoryActions(deps)` 팩토리 제공
  - API: `cloneStateForHistory`, `countParagraphs`, `getDocContentFromSnapshot`, `getHistoryDeltaMeta`, `formatSignedDelta`, `addHistoryEntry`, `markDocDirty`, `flushHistorySnapshots`, `ensureHistoryAutoSaveInterval`
- 신규 모듈 `timer-service.js` 추가
  - `createTimerActions(deps)` 팩토리 제공
  - API: `tickTimer`, `ensureTimerInterval`, `resetTimerInterval`, `renderTimer`, `getPomodoroMinutes`, `applyPomodoroMinutesFromInputs`
- `app.js`에서 히스토리/타이머 구현을 서비스 위임 방식으로 전환
- `index.html` 스크립트 로드 순서에 `history-service.js`, `timer-service.js` 추가
- 결과:
  - `app.js`의 도메인별 책임이 추가로 축소됨
  - 히스토리/타이머 회귀를 독립 테스트로 검증 가능해짐

### 2.8 조립층 분해 4차 (`session-flow-service` 모듈 분리)

- 신규 모듈 `session-flow-service.js` 추가
  - `createSessionFlowActions(deps)` 팩토리 제공
  - API: `authSignUp`, `authLogin`, `authAnonymousLogin`, `openUpgradeDialog`, `closeUpgradeDialog`, `upgradeAnonymousAccount`, `authLogout`, `openWithdrawDialog`, `closeWithdrawDialog`, `updateWithdrawConfirmState`, `authWithdraw`
- `app.js`의 인증/세션 함수는 서비스 위임 우선으로 변경
- `index.html` 스크립트 로드 순서에 `session-flow-service.js` 추가
- 결과:
  - 인증 오케스트레이션이 조립층에서 분리됨
  - 인증 플로우 회귀를 독립 테스트로 검증 가능해짐

### 2.9 Focus Studio UI 재구성 1차

- `styles.css`를 진입점으로 유지하고 `styles/` 계층 분리
  - `tokens.css`, `base.css`, `layout.css`, `components.css`, `mobile.css`, `legacy.css`
- 메인 에디터 상단에 Focus Toolbar 추가
  - 문서 목록/기록 패널 토글
  - 수동 동기화, 히스토리 열기
  - 분할 전환(단일/좌우/상하)
  - TXT/PDF 내보내기
- `ui-bindings.js`에서 툴바 신규 버튼 이벤트 연결
- 결과:
  - 에디터 중심 조작 흐름 강화
  - 기존 기능 로직 유지한 상태로 UI 전면 재정렬

### 2.10 모바일 UI 전면 리팩터

- `index.html`에 모바일 전용 탐색 레이어 추가
  - 하단 고정 액션바: `mobile-action-bar`
  - 더보기 시트: `mobile-more-dialog`
- `ui-bindings.js`에 모바일 버튼 이벤트 연결 추가
  - 문서/기록 패널 토글
  - 수동 동기화
  - 명령 팔레트
  - 더보기(히스토리/분할/TXT/PDF)
- `app.js` 레이아웃 반영
  - 모바일에서 엣지바(`show-tree-bar`, `show-calendar-bar`) 비노출
  - 모바일 액션바 표시 상태를 `applyAppLayout`에서 제어
  - 문서/기록 버튼 활성 상태/라벨을 `updatePanelToggleButtons`에서 동기화
- 스타일 계층 정리
  - `styles.css`에서 `styles/legacy.css` import 제거(모바일/신규 테마 기준 단일화)
  - `styles/mobile.css`로 모바일 레이아웃 규칙 통합
  - `styles/legacy.css`에서 모바일 미디어쿼리/모바일 애니메이션 블록 제거
  - 터치 타깃 하한(44px) 및 safe-area 하단 여백 반영
- PDF 내보내기 경로 개선
  - `window.print` 기반 새 창 출력 방식에서 `html2pdf` 기반 파일 생성 방식으로 전환
  - `index.html`에 `html2pdf.bundle.min.js` 로드 추가
  - 오류 시 공통 안내 모달로 실패 메시지 노출

- 결과:
  - 360~430px 폭에서 상단 툴바 과밀 이슈 완화
  - 모바일 주 기능 접근 경로 단순화(한 손 조작 중심)
  - 모바일 스타일 충돌 리스크 축소(단일 소스화)

### 2.11 파일별 상세 변경 요약

- `index.html`
  - 모바일 하단 액션바/더보기 시트 마크업 추가
  - `html2pdf` 스크립트 로드 추가
  - 캐시 버전 갱신(`styles.css?v=16`, `app.js?v=93`)
- `ui-bindings.js`
  - 모바일 액션바 버튼 이벤트 바인딩 추가
  - 더보기 시트 열기/닫기/외부 클릭 제어 추가
  - 모바일 드로어 닫힘 이벤트와 더보기 시트 간 충돌 방지 처리
- `app.js`
  - 모바일 액션바 상태 반영(`applyAppLayout`, `updatePanelToggleButtons`)
  - 모바일에서 기존 엣지바 트리거 비노출 처리
  - PDF 내보내기 경로를 `html2pdf` 기반으로 교체
- `styles.css`
  - `styles/legacy.css` import 제거
- `styles/mobile.css`
  - 모바일 전용 레이아웃/드로어/하단 액션바/더보기 시트 스타일 통합
- `styles/legacy.css`
  - 모바일 미디어쿼리/모바일 전용 키프레임 제거
- `styles/tokens.css`, `styles/base.css`, `styles/layout.css`, `styles/components.css`
  - Focus Studio 톤앤매너 기반 시각 토큰/레이아웃/컴포넌트 스타일 정비

## 3. 테스트 결과

실행 항목:

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

결과:

- 전 항목 통과
- 보안 프리플라이트 경고 0건 유지

## 4. 산출물(핵심 변경 파일)

- 수정
  - `dialog-service.js`
  - `tree-service.js`
  - `history-service.js`
  - `timer-service.js`
  - `session-flow-service.js`
  - `app.js`
  - `auth-service.js`
  - `index.html`
  - `styles.css`
  - `tests/auth-service.test.js`
  - `tests/dialog-service.test.js`
  - `tests/tree-service.test.js`
  - `tests/history-service.test.js`
  - `tests/timer-service.test.js`
  - `tests/session-flow-service.test.js`
- 문서 갱신
  - `README.md`
  - `docs/PROJECT_UNIFIED.md`
  - `docs/PROGRESS_SUMMARY_2026-03-01.md`(신규)

## 5. 운영 메모

1. 사용자 상호작용이 앱 내부 모달로 일관화되어 UX 톤이 정리됨
2. 충돌 처리에서 “취소” 분기가 명시되어 오동작 가능성이 감소함
3. 인증 메시지는 reason 코드 기반으로 통일되었지만, 서버 원문 에러와의 매핑 보강은 추가 여지 있음
4. 대화상자/트리/히스토리/타이머/세션 플로우 서비스 분리로 `app.js` 조립 중심 구조 전환이 단계적으로 진행됨

## 6. 다음 권장 과제

1. `app.js` 2차 분해(대화상자/트리/히스토리/타이머 도메인 분리)
2. 통합 플로우 테스트(인증-암호화-동기화-로그아웃) 추가
3. 모바일 실단말 회귀 자동화(핵심 시나리오 스모크)
