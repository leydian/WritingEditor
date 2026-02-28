# PART 03. 레이아웃/내비게이션/모바일 토글

작성일: 2026-02-16
최종 갱신: 2026-03-01 (에디터 퍼스트 오버레이 패널 전면 재설계)

## 1) 목표

- 데스크톱/모바일 모두에서 패널 접근성을 유지하면서 UI 복잡도를 줄이는 것.
- (2026-03-01 추가) 에디터가 항상 100% 너비를 사용하는 "에디터 퍼스트" 레이아웃 실현.

## 2) 주요 변경

### 사이드바 재배치
- 명령 팔레트 버튼을 문서 목록 상단으로 이동
- 툴바 기능 일부를 사이드바로 이동/재정렬
- 관련 커밋: `7dd3cd4`, `e6837a4`, `b6fc8f5`

### 버튼 정책 변경
- 요구에 따라 숨김 버튼 제거/복구 반복 반영
- 로그인 화면 노출 이슈 해결: 인증 전 엣지 토글 강제 숨김
- 관련 커밋: `b6fc8f5`, `9a76573`

### 모바일 엣지 토글
- 문서/기록 패널을 모바일에서 엣지 플로팅 버튼으로 열기
- 오른쪽 토글 즉시 닫힘 이슈 수정(클릭-아웃사이드 예외)
- CSS `!important` 충돌 제거로 토글 정상화
- 관련 커밋: `341cf1f`, `aa8f049`, `9a76573`

## 3) 영향 파일

- `index.html` (버튼 위치/구성)
- `styles.css` (모바일 미디어쿼리, edge-bar 스타일)
- `app.js` (layout 상태, 클릭-아웃사이드 예외)

## 4) 회귀 포인트

- 모바일에서 오른쪽 토글이 보이는지
- 토글 클릭 후 패널이 즉시 닫히지 않는지
- 로그인 화면에서 엣지 토글이 노출되지 않는지

---

## 5) 에디터 퍼스트 오버레이 패널 재설계 (2026-03-01)

### 배경

3단 그리드(사이드바|에디터|통계)가 항상 표시되어 에디터 공간이 협소. 특히 1280px 이하에서 심각하게 좁아짐.
오버레이 기반 패널로 전환해 에디터가 항상 전체 너비를 차지하도록 구조 전환.

### 핵심 설계 원칙

1. **에디터 퍼스트**: `.main`이 항상 `width: 100%`, 사이드바/통계는 `position: fixed` 오버레이
2. **transform 기반 토글**: `display: none` 대신 `transform: translateX(±100%)` — 애니메이션 자연스럽고 layout shift 없음
3. **백드롭 dim**: `#panel-backdrop` (z-index: 49)이 패널 열릴 때 에디터를 반투명하게 덮음
4. **isCompact 제한 제거**: 기존 1100px 이하에서 통계 패널 강제 숨김 → 오버레이이므로 너비 무관하게 사용자 선택 존중

### CSS 계층 변경 요약

```
tokens.css  : --fx-header-h(52px), --fx-overlay-w-sidebar(300px), --fx-overlay-w-stats(340px), --fx-backdrop 추가
layout.css  : .app → display:block, .main → 100% 너비 flex column
              .sidebar/.stats-panel → position:fixed 오버레이, transform 슬라이드
              .sidebar.hidden-panel → display:flex !important (legacy 충돌 방지) + transform translateX(-100%)
              #panel-backdrop → opacity 트랜지션
components.css : 버튼 계층(primary/secondary/ghost), 닫기버튼, toolbar-doc-title, 인증 CTA
mobile.css  : 1100px 블록 단순화, 드로어 CSS 애니메이션 제거(transform 트랜지션으로 통합)
```

### HTML 구조 변경

```
toolbar:
  좌측: [☰ toggle-sidebar] [toolbar-doc-title]
  우측: [⌘ top-command] [☁ manual-sync] [분할버튼] [TXT] [PDF] [히스토리] [📊 toggle-calendar]

sidebar:
  #sidebar-close-btn (✕, 우상단) 추가
  #command-palette-btn (사이드바 상단) 제거 → 툴바 ⌘ 버튼으로 통합

stats-panel:
  #panel-close-btn (✕, 우상단) 추가

body 최하단:
  <div id="panel-backdrop"> 추가

auth-card:
  #auth-anon-login → 최상단 auth-cta-primary 버튼
  .auth-divider 구분선
  로그인 폼 → 하단 배치
```

### JS 변경 요약 (`app.js`)

| 함수 | 변경 내용 |
|---|---|
| `applyAppLayout()` | gridTemplateColumns 설정 제거, backdrop.active toggle, isCompact 제거, toolbar-doc-title 업데이트 |
| `updatePanelToggleButtons()` | isCompact 분기 제거, toolbar 버튼 .active 토글 방식으로 전환 |
| `bindEvents()` | #panel-backdrop, #sidebar-close-btn, #panel-close-btn 클릭 핸들러 추가 |
| `bindSidebarResize()` | mousedown early return (오버레이 리사이즈 불필요) |
| `handleUserStateChange()` | `app.style.display = 'grid'` → `'block'` |

### 회귀 포인트 (신규)

- 데스크탑 1280px: 에디터 100% 너비, 사이드바/통계 오버레이 토글
- 1100px 이하: 통계 패널 열기 가능 (기존엔 강제 숨김)
- 900px 이하: 모바일 하단 액션바 동작, 드로어 슬라이드 애니메이션
- 백드롭 클릭 → 모든 오버레이 닫힘
- ✕ 버튼 클릭 → 해당 패널만 닫힘
- 타이머, 달력, 동기화, 히스토리 정상 동작 확인

