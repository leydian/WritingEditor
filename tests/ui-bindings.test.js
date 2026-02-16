const assert = require('assert');
const path = require('path');

const uiBindings = require(path.join(__dirname, '..', 'ui-bindings.js'));

function makeEl() {
  const listeners = {};
  return {
    value: '',
    checked: false,
    classList: { toggle() {}, add() {}, remove() {} },
    style: {},
    setAttribute() {},
    contains() { return false; },
    addEventListener(type, handler) { listeners[type] = handler; },
    dispatch(type, event) {
      if (listeners[type]) listeners[type](event || {});
    },
    listeners,
    onclick: null,
  };
}

function testBindUiEventsContracts() {
  const elements = {
    'editor-a': makeEl(),
    'logout-btn': makeEl(),
  };
  const get = (id) => elements[id] || null;

  let updatedPane = '';
  let updatedValue = '';
  let logoutCalled = 0;

  const prevWindow = global.window;
  const prevDocument = global.document;
  global.window = { innerWidth: 1200 };
  global.document = {
    addEventListener() {},
    querySelector() { return null; },
  };

  try {
    uiBindings.bindUiEvents({
      $: get,
      MOBILE_MINI_BREAKPOINT: 900,
      layoutPrefs: { showSidebar: true, showCalendar: true },
      saveLayoutPrefs() {},
      applyAppLayout() {},
      getMobileMiniState: () => ({ sidebarOpen: false, calendarOpen: false }),
      setMobileMiniState() {},
      setActivePane() {},
      updateEditorPane: (pane, value) => {
        updatedPane = pane;
        updatedValue = value;
      },
      isTodayGoalLocked: () => false,
      todayKey: () => '2026-02-16',
      state: { goalByDate: {}, goalMetricByDate: {}, goalLockedByDate: {}, pomodoro: {} },
      saveState() {},
      updateProgress() {},
      getGoalMetric: () => 'withSpaces',
      updateGoalLockUI() {},
      setCalendarViewMode() {},
      getCalendarViewMode: () => 'calendar',
      shiftCalendarMonth() {},
      closeHistoryDialog() {},
      ensureTimerInterval() {},
      renderTimer() {},
      applyPomodoroMinutesFromInputs() {},
      authLogout: () => { logoutCalled += 1; },
      openUpgradeDialog() {},
      closeUpgradeDialog() {},
      upgradeAnonymousAccount() {},
      openWithdrawDialog() {},
      closeWithdrawDialog() {},
      updateWithdrawConfirmState() {},
      authWithdraw() {},
      settleEncryptionUnlockResolver() {},
      closeEncryptionUnlockDialog() {},
      openCommandPalette() {},
      closeCommandPalette() {},
      renderCommandPalette() {},
      getFilteredCommands: () => [],
      runCommandFromPalette() {},
      getCommandPaletteSelection: () => 0,
      setCommandPaletteSelection() {},
      switchSplit() {},
    });

    elements['editor-a'].dispatch('input', { target: { value: 'hello' } });
    assert.strictEqual(updatedPane, 'a');
    assert.strictEqual(updatedValue, 'hello');

    assert.strictEqual(typeof elements['logout-btn'].onclick, 'function');
    elements['logout-btn'].onclick();
    assert.strictEqual(logoutCalled, 1);
  } finally {
    global.window = prevWindow;
    global.document = prevDocument;
  }
}

function run() {
  testBindUiEventsContracts();
  console.log('ui-bindings tests passed');
}

run();
