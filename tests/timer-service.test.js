const assert = require('assert');
const path = require('path');

const timerService = require(path.join(__dirname, '..', 'timer-service.js'));

function createElements() {
  return {
    'pomodoro-focus-min': { value: '25' },
    'pomodoro-break-min': { value: '5' },
    'timer-label': { textContent: '' },
    'timer-display': { textContent: '' },
    'timer-toggle': { textContent: '' },
  };
}

function testApplyAndRender() {
  const state = {
    pomodoroMinutes: { focus: 0, break: 999 },
    pomodoro: { mode: 'focus', left: 10, running: false },
    focusSecondsByDate: {},
    sessionsByDate: {},
  };
  const els = createElements();
  let saveCount = 0;
  let progressCount = 0;
  const notices = [];
  const actions = timerService.createTimerActions({
    state,
    stateApi: null,
    todayKey: () => '2026-03-01',
    openNoticeDialog: async (o) => { notices.push(o); },
    saveState: () => { saveCount += 1; },
    updateProgress: () => { progressCount += 1; },
    getById: (id) => els[id] || null,
  });

  const mins = actions.getPomodoroMinutes();
  assert.deepStrictEqual(mins, { focus: 1, break: 180 });

  els['pomodoro-focus-min'].value = '30';
  els['pomodoro-break-min'].value = 'abc';
  actions.applyPomodoroMinutesFromInputs();
  assert.deepStrictEqual(state.pomodoroMinutes, { focus: 30, break: 1 });
  assert.strictEqual(state.pomodoro.left, 30 * 60);
  assert.strictEqual(saveCount, 1);

  state.pomodoro.running = true;
  state.pomodoro.left = 1;
  actions.tickTimer();
  assert.strictEqual(state.pomodoro.mode, 'break');
  assert.strictEqual(state.sessionsByDate['2026-03-01'], 1);
  assert.strictEqual(progressCount, 1);
  assert.strictEqual(notices.length, 1);
}

function testIntervalControls() {
  const state = {
    pomodoroMinutes: { focus: 25, break: 5 },
    pomodoro: { mode: 'focus', left: 1, running: false },
    focusSecondsByDate: {},
    sessionsByDate: {},
  };
  const els = createElements();
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  let setCount = 0;
  let clearedId = null;

  global.setInterval = () => {
    setCount += 1;
    return 123;
  };
  global.clearInterval = (id) => {
    clearedId = id;
  };
  try {
    const actions = timerService.createTimerActions({
      state,
      stateApi: null,
      todayKey: () => '2026-03-01',
      openNoticeDialog: async () => {},
      saveState: () => {},
      updateProgress: () => {},
      getById: (id) => els[id] || null,
    });
    actions.ensureTimerInterval();
    actions.ensureTimerInterval();
    actions.resetTimerInterval();
    assert.strictEqual(setCount, 1);
    assert.strictEqual(clearedId, 123);
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
}

function run() {
  testApplyAndRender();
  testIntervalControls();
  console.log('timer-service tests passed');
}

run();
