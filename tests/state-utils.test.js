const assert = require('assert');
const path = require('path');

const stateUtils = require(path.join(__dirname, '..', 'state-utils.js'));

function testNormalizeState() {
  const normalized = stateUtils.normalizeState({
    stateVersion: 1,
    docs: [],
    folders: [],
    split: 'weird',
    historyByDoc: { legacy: true },
    splitRatioByMode: { vertical: 5, horizontal: 95 },
    pomodoroMinutes: { focus: 0, break: 999 },
    pomodoro: { mode: 'bad', left: 0, running: 'yes' },
    ui: { commandPalette: { enabled: false, recentCommands: [' a ', '', 'sync'] } },
    editor: { outline: { collapsed: 1, lastActiveHeadingId: 123 } },
    historyEntries: [{ id: 1, meta: { charDelta: '5', paraDelta: 'x' } }],
  });

  assert.strictEqual(normalized.stateVersion, 2);
  assert.strictEqual(Array.isArray(normalized.docs), true);
  assert.strictEqual(normalized.docs.length, 1);
  assert.strictEqual(normalized.activeDocA, 'd1');
  assert.strictEqual(normalized.split, 'single');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(normalized, 'historyByDoc'), false);
  assert.strictEqual(normalized.pomodoro.mode, 'focus');
  assert.strictEqual(normalized.pomodoro.left, 60);
  assert.strictEqual(normalized.pomodoro.running, true);
  assert.strictEqual(normalized.splitRatioByMode.vertical, 20);
  assert.strictEqual(normalized.splitRatioByMode.horizontal, 80);
  assert.strictEqual(normalized.pomodoroMinutes.focus, 1);
  assert.strictEqual(normalized.pomodoroMinutes.break, 180);
  assert.strictEqual(normalized.ui.commandPalette.enabled, false);
  assert.deepStrictEqual(normalized.ui.commandPalette.recentCommands, ['a', 'sync']);
  assert.strictEqual(normalized.editor.outline.collapsed, true);
  assert.strictEqual(normalized.editor.outline.lastActiveHeadingId, '123');
  assert.strictEqual(normalized.historyEntries[0].meta.charDelta, 5);
  assert.strictEqual(normalized.historyEntries[0].meta.paraDelta, 0);
}

function testHistoryHelpers() {
  const snapshot = stateUtils.cloneStateForHistory({
    docs: [{ id: 'd1' }],
    historyEntries: [{ id: 1 }],
  });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(snapshot, 'historyEntries'), false);

  const entry = stateUtils.createHistoryEntry(
    'doc-edit',
    { docId: 'd1', docName: 'doc', summary: 'changed', scope: 'doc', charDelta: 12, paraDelta: -1 },
    { docs: [{ id: 'd1' }] },
    { now: new Date('2026-02-16T00:00:00.000Z'), nowMs: 1000, randomInt: 7 }
  );
  assert.strictEqual(entry.id, 1007);
  assert.strictEqual(entry.savedAt, '2026-02-16T00:00:00.000Z');
  assert.strictEqual(entry.docId, 'd1');
  assert.strictEqual(entry.meta.charDelta, 12);
  assert.strictEqual(entry.meta.paraDelta, -1);

  const capped = Array.from({ length: 12 }).reduce((acc, _, i) => (
    stateUtils.prependHistoryEntry(acc, { id: i }, 10)
  ), []);
  assert.strictEqual(capped.length, 10);
  assert.strictEqual(capped[0].id, 11);
  assert.strictEqual(capped[9].id, 2);
}

function testGoalAndDuration() {
  assert.strictEqual(stateUtils.getGoalMetric({ '2026-02-16': 'noSpaces' }, '2026-02-16'), 'noSpaces');
  assert.strictEqual(stateUtils.getGoalMetric({}, '2026-02-16'), 'withSpaces');
  assert.strictEqual(stateUtils.getActualByGoalMetric(100, 80, 'withSpaces'), 100);
  assert.strictEqual(stateUtils.getActualByGoalMetric(100, 80, 'noSpaces'), 80);
  assert.strictEqual(stateUtils.formatDuration(3661), '01:01:01');
  assert.strictEqual(stateUtils.formatDuration(-10), '00:00:00');
}

function testTickPomodoro() {
  const focusTick = stateUtils.tickPomodoro({ mode: 'focus', left: 10, running: true });
  assert.strictEqual(focusTick.focusDelta, 1);
  assert.strictEqual(focusTick.sessionDelta, 0);
  assert.strictEqual(focusTick.completedMode, null);
  assert.strictEqual(focusTick.pomodoro.left, 9);
  assert.strictEqual(focusTick.pomodoro.mode, 'focus');

  const focusDone = stateUtils.tickPomodoro({ mode: 'focus', left: 1, running: true }, { focus: 30, break: 7 });
  assert.strictEqual(focusDone.focusDelta, 1);
  assert.strictEqual(focusDone.sessionDelta, 1);
  assert.strictEqual(focusDone.completedMode, 'focus');
  assert.strictEqual(focusDone.pomodoro.mode, 'break');
  assert.strictEqual(focusDone.pomodoro.left, 420);

  const breakDone = stateUtils.tickPomodoro({ mode: 'break', left: 1, running: true }, { focus: 30, break: 7 });
  assert.strictEqual(breakDone.focusDelta, 0);
  assert.strictEqual(breakDone.sessionDelta, 0);
  assert.strictEqual(breakDone.completedMode, 'break');
  assert.strictEqual(breakDone.pomodoro.mode, 'focus');
  assert.strictEqual(breakDone.pomodoro.left, 1800);
}

function run() {
  testNormalizeState();
  testHistoryHelpers();
  testGoalAndDuration();
  testTickPomodoro();
  console.log('state-utils tests passed');
}

run();
