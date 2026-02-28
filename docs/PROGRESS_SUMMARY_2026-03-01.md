# 진행현황 상세 요약 (2026-03-01)

기준 저장소: `https://github.com/leydian/WritingEditor`  
기준 브랜치: `main`  
반영 범위: 대화상자 UX 표준화 + 동기화 충돌 UX 개선 + 인증 메시지 표준화 + 조립층 분해 1/2/3/4차 + Focus Studio UI 재구성 1차 + 모바일 UI 전면 리팩터 + UI 전면 개편 및 PDF 내보내기 개선 + **WritingEditor UI 전면 재설계(에디터 퍼스트/오버레이 패널)**

## 1. 이번 작업 목표

1. 브라우저 기본 대화상자(`confirm/prompt/alert`) 의존 제거
2. 동기화 충돌 상황에서 사용자가 의도를 명확히 선택할 수 있는 UI 제공
3. 인증/재인증 오류 메시지를 코드 기반으로 일관화
4. UI 디자인 시스템 현대화 및 툴바 시각적 부하 감소
5. PDF 내보내기 시 인쇄창 없이 즉시 다운로드 구현

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
  - `styles/mobile.css`로 모바일 레이아웃 규칙 통합
  - `styles/legacy.css`에서 모바일 미디어쿼리/모바일 애니메이션 블록 제거
  - 터치 타깃 하한(44px) 및 safe-area 하단 여백 반영

- 결과:
  - 360~430px 폭에서 상단 툴바 과밀 이슈 완화
  - 모바일 주 기능 접근 경로 단순화(한 손 조작 중심)
  - 모바일 스타일 충돌 리스크 축소(단일 소스화)

### 2.11 UI 전면 개편 (Modern Academic Style)

- **디자인 시스템 현대화** (`styles/tokens.css`, `styles/base.css`)
  - 크림색 배경(#f5f4f0)과 짙은 그린(#2d5a4c) 강조색을 사용한 '학구적 모던' 팔레트 적용
  - 그림자와 그라데이션을 절제하고 여백(Negative Space)을 활용한 플랫 디자인 지향
  - 세리프 서체(`Iowan Old Style`, `Noto Serif KR`) 중심의 가독성 높은 집필 환경 구축
- **툴바 및 사이드바 레이아웃 최적화** (`index.html`, `styles/layout.css`)
  - 툴바 버튼을 논리적 그룹으로 묶고, 레이아웃 전환 버튼을 직관적인 기호로 교체하여 시각적 복잡도 해소
  - 사용자 정보, 동기화 상태, 로그아웃 버튼을 사이드바 하단으로 이동하여 문서 목록에 대한 집중도 강화
  - 에디터 영역의 패딩을 조정하여 '종이' 위에 글을 쓰는 듯한 몰입형 UI 구현
- **레거시 스타일 정리**
  - 불필요한 `styles/legacy.css` 의존성을 제거하고 핵심 스타일을 `components.css`로 통합

### 2.12 PDF 내보내기 기능 개선 (`app.js`, `index.html`)

- **직속 다운로드 구현**: `html2pdf.js` 라이브러리를 도입하여 브라우저 인쇄 대화상자 없이 즉시 PDF 파일 생성 및 다운로드 수행
- **스타일 유지**: 내보내는 PDF 파일 내에서도 앱의 핵심 서체와 레이아웃(A4 기준)이 유지되도록 엔진 옵션 최적화

### 2.13 WritingEditor UI 전면 재설계 — 에디터 퍼스트 & 오버레이 패널

**배경**: 세 패널(사이드바 | 에디터 | 통계)이 항상 visible한 그리드 구조로 에디터 공간이 좁고 정보 과부하 발생.
글쓰기 앱의 핵심인 에디터가 주인공이 되는 "에디터 퍼스트" 레이아웃으로 전면 재설계.

#### 레이아웃 구조 변경

| 항목 | 이전 | 이후 |
|---|---|---|
| `.app` 배치 방식 | `display: flex` (CSS) + JS가 `display: grid` 오버라이드 | `display: block` (CSS + JS) |
| 사이드바/통계 | 그리드 칼럼으로 항상 노출 (너비 조절 가능) | `position: fixed` 오버레이, 슬라이드 트랜지션 |
| 패널 숨김 방식 | `gridTemplateColumns` 칼럼 제거 | `transform: translateX(±100%)` — `display:none` 없음 |
| 툴바 높이 | 가변 (`padding: 8px 12px`) | 고정 `52px` (`--fx-header-h`) |
| 1100px 이하 통계 | 강제 숨김 (isCompact) | 사용자 선택 존중 (오버레이이므로 제한 없음) |

#### 세부 변경 파일

**`styles/tokens.css`**
- `--fx-header-h: 52px` — 슬림 헤더 고정 높이
- `--fx-overlay-w-sidebar: 300px`, `--fx-overlay-w-stats: 340px` — 오버레이 너비
- `--fx-backdrop: rgba(26, 28, 24, 0.35)` — 백드롭 색상

**`styles/layout.css`** (전면 재작성)
- `.app` → `display: block; height: 100vh`
- `.main` → `width: 100%; height: 100vh; flex-direction: column` — 에디터 100% 너비
- `.toolbar` → `height: var(--fx-header-h)` 고정
- `.sidebar` / `.stats-panel` → `position: fixed; z-index: 50; transform: translateX(±100%); transition: 0.22s ease`
- `.sidebar.hidden-panel` / `.stats-panel.hidden-panel` → `display: flex !important` + 이탈 transform (hidden-panel이 display:none 적용하지 않도록 더 높은 명시도로 오버라이드)
- `#panel-backdrop` → `position: fixed; z-index: 49; opacity: 0; transition: opacity 0.22s ease`
- `#panel-backdrop.active` → `opacity: 1; pointer-events: all`
- `.sidebar-resizer`, `.calendar-resizer` → `display: none` (오버레이에서 리사이즈 불필요)

**`styles/components.css`** (주요 업데이트)
- 버튼 계층 도입: `.btn-primary` (accent 배경) / `.btn-secondary` (테두리) / `.btn-ghost` (toolbar 버튼)
- `#toggle-sidebar-toolbar-btn`, `#toggle-calendar-toolbar-btn` → ghost 버튼, `.active` 상태 강조
- `.toolbar-doc-title` → 현재 문서명 표시 (`overflow: ellipsis`)
- `.sidebar-close-btn`, `.panel-close-btn` → 패널 우상단 ✕ 버튼
- 사이드바/통계패널: `overflow-y: auto; padding: 20px` — 풀 높이 스크롤
- 인증 화면: `.auth-cta-primary` (익명 시작 풀너비 강조 버튼), `.auth-divider` (구분선)

**`styles/mobile.css`** (단순화)
- `@media (max-width: 1100px)` 블록: `display:none` 강제 숨김 제거 (오버레이가 이미 처리)
- `@media (max-width: 900px)` 블록: `grid-template-columns` 관련 코드 제거
- 모바일 드로어 CSS 애니메이션 제거 → layout.css의 transform 트랜지션으로 통합
- 모바일 액션바/더보기 다이얼로그 스타일 유지

**`index.html`** (구조 변경)
- 툴바 재구성: 좌측 `[☰][문서명]` / 우측 `[⌘][☁][분할][TXT][PDF][히스토리][📊]`
- 사이드바 내 `#command-palette-btn` 제거 → 툴바 `#top-command-btn`(⌘)으로 통합
- 사이드바에 `#sidebar-close-btn` 추가 (✕)
- 통계패널에 `#panel-close-btn` 추가 (✕)
- `<div id="panel-backdrop">` 추가 (`</body>` 직전)
- 인증 화면 CTA 재구성: 익명 시작 버튼 최상단 + `auth-divider` + 로그인/회원가입 폼 하단
- `styles.css?v=16` → `v=17`, `app.js?v=93` → `v=94`

**`app.js`** (4곳 변경)
- **A. `applyAppLayout()`**: `gridTemplateColumns`/padding 설정 제거, 백드롭 toggle 추가, `isCompact` 기반 `showCalendar` 제한 제거
- **B. `bindSidebarResize()`**: 리사이저 mousedown 핸들러 early return (오버레이이므로 드래그 불필요)
- **C. `bindEvents()`**: `#panel-backdrop`, `#sidebar-close-btn`, `#panel-close-btn` 클릭 핸들러 추가 (mobile-mini 상태 분기 처리 포함)
- **D. `updatePanelToggleButtons()`**: `isCompact` 분기 완전 제거, 툴바 버튼 `.active` 토글 방식으로 전환
- 로그인 시 `app.style.display = 'grid'` → `'block'` 변경
- `applyAppLayout()` 내 `#toolbar-doc-title` 텍스트 업데이트 추가 (`state.activeDocA` 기반)

#### 시각적 효과
- **에디터 100% 너비** → 글쓰기 집중도 향상
- **오버레이 dim** → 패널 열림 시 에디터와의 명확한 시각적 분리
- **슬림 헤더(52px)** → 수직 공간 확보
- **인증 화면 CTA 계층** → 익명 시작이 주 동작으로 명확히 구분

### 2.14 오버레이 패널 위치 버그 및 상하분할 수정

**배경**: 에디터 퍼스트 재설계(2.13) 직후 발견된 4가지 회귀 버그 수정.

#### 버그 목록 및 원인

| # | 증상 | 근본 원인 |
|---|---|---|
| 1 | 뽀모도로 타이머 보이지 않음 | `components.css`의 `.stats-panel { position: relative }`가 `layout.css`의 `position: fixed`를 덮어씀 → 패널이 인라인 블록으로 렌더링 |
| 2 | 일일 달성기록 보이지 않음 | 동일 원인 — 통계 패널 자체가 fixed 오버레이가 아닌 인라인 블록 |
| 3 | 문서목록이 페이지 상단에 표시 | `components.css`의 `.sidebar { position: relative }`가 `layout.css`의 `position: fixed`를 덮어씀 → 사이드바가 `#app` 블록 내 최상단에 흘러내림 |
| 4 | 상하분할 동작 안 함 | `.editor-area`가 `display: flex`였으나 `applyEditorSplitLayout()`이 `gridTemplateRows`를 설정 → flex 컨테이너에는 grid 속성 무효 |

#### 수정 내용

**`styles/components.css`**
- `.sidebar`: `position: relative` 제거 (layout.css의 `position: fixed` 유효화)
- `.stats-panel`: `position: relative` 제거 (동일)
- `position: fixed` 요소는 positioned context를 제공하므로 내부 `position: absolute` 닫기 버튼은 정상 동작 유지

**`styles/layout.css`**
- `.editor-area`: `display: flex; gap: 20px` → `display: grid; grid-template-columns: 1fr; grid-template-rows: 1fr; gap: 0`
  - JS의 `gridTemplateColumns`/`gridTemplateRows` 인라인 설정이 이제 정상 적용
  - 상하분할: `grid-template-rows: ratio% 8px (100-ratio)%` → pane-a/resizer/pane-b 순서로 수직 배치
  - 좌우분할: `grid-template-columns: ratio% 8px (100-ratio)%` → pane-a/resizer/pane-b 순서로 수평 배치
- `.pane`: `flex: 1` 제거 → `min-width: 0; min-height: 0` 추가 (grid 자식 overflow 방지)
- `.editor-split-resizer`: 방향별 스타일 분리
  - `.editor-area.vertical .editor-split-resizer`: `cursor: col-resize; width: 8px`
  - `.editor-area.horizontal .editor-split-resizer`: `cursor: row-resize; height: 8px`

#### CSS 명시도 충돌 교훈

`styles.css`는 `layout.css` → `components.css` 순서로 import한다. `components.css`에 선언된 동명 선택자의 속성은 `layout.css`를 덮어쓴다. 오버레이 패널의 `position` 등 구조적 속성은 반드시 한 파일에만 선언해야 한다.

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

- 전 항목 통과 (PDF 라이브러리 추가 후에도 CSP 규정 준수 확인)
- 보안 프리플라이트 경고 0건 유지

## 4. 산출물(핵심 변경 파일)

- 수정
  - `app.js` (PDF 내보내기 로직 전면 수정)
  - `index.html` (라이브러리 추가 및 툴바/사이드바 구조 개선)
  - `styles.css` (레거시 제거)
  - `styles/tokens.css`, `styles/base.css`, `styles/layout.css`, `styles/components.css`, `styles/mobile.css` (디자인 시스템 전면 개편)
- 문서 갱신
  - `docs/PROGRESS_SUMMARY_2026-03-01.md`

## 5. 운영 메모

1. PDF 내보내기가 인쇄창을 거치지 않으므로 사용자 흐름이 훨씬 매끄러워짐
2. UI 개편으로 인해 주요 버튼의 위치가 변경되었으나(사이드바 하단 등), 더 논리적인 배치를 통해 학습 비용 최소화
3. `legacy.css` 제거로 스타일 시트의 유지보수성이 크게 향상됨

## 6. 다음 권장 과제

1. 다크 모드(Night Mode) 지원을 위한 컬러 토큰 확장
2. PDF 내보내기 시 사용자 정의 여백/폰트 크기 옵션 추가
3. 모바일 하단 액션바의 시각적 피드백 강화
