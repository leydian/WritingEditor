const assert = require('assert');
const path = require('path');

const stateUtils = require(path.join(__dirname, '..', 'state-utils.js'));

function testNormalizeState() {
  const normalized = stateUtils.normalizeState({
    docs: [],
    folders: [],
    split: 'weird',
    historyByDoc: { legacy: true },
    splitRatioByMode: { vertical: 5, horizontal: 95 },
    pomodoro: { mode: 'bad', left: 0, running: 'yes' },
  });

  assert.strictEqual(Array.isArray(normalized.docs), true);
  assert.strictEqual(normalized.docs.length, 1);
  assert.strictEqual(normalized.activeDocA, 'd1');
  assert.strictEqual(normalized.split, 'single');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(normalized, 'historyByDoc'), false);
  assert.strictEqual(normalized.pomodoro.mode, 'focus');
  assert.strictEqual(normalized.pomodoro.left, 1500);
  assert.strictEqual(normalized.pomodoro.running, true);
  assert.strictEqual(normalized.splitRatioByMode.vertical, 20);
  assert.strictEqual(normalized.splitRatioByMode.horizontal, 80);
}

function testHistoryHelpers() {
  const snapshot = stateUtils.cloneStateForHistory({
    docs: [{ id: 'd1' }],
    historyEntries: [{ id: 1 }],
  });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(snapshot, 'historyEntries'), false);

  const entry = stateUtils.createHistoryEntry(
    'doc-edit',
    { docId: 'd1', docName: '문서', summary: '저장', scope: 'doc' },
    { docs: [{ id: 'd1' }] },
    { now: new Date('2026-02-16T00:00:00.000Z'), nowMs: 1000, randomInt: 7 }
  );
  assert.strictEqual(entry.id, 1007);
  assert.strictEqual(entry.savedAt, '2026-02-16T00:00:00.000Z');
  assert.strictEqual(entry.docId, 'd1');

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

  const focusDone = stateUtils.tickPomodoro({ mode: 'focus', left: 1, running: true });
  assert.strictEqual(focusDone.focusDelta, 1);
  assert.strictEqual(focusDone.sessionDelta, 1);
  assert.strictEqual(focusDone.completedMode, 'focus');
  assert.strictEqual(focusDone.pomodoro.mode, 'break');
  assert.strictEqual(focusDone.pomodoro.left, 300);

  const breakDone = stateUtils.tickPomodoro({ mode: 'break', left: 1, running: true });
  assert.strictEqual(breakDone.focusDelta, 0);
  assert.strictEqual(breakDone.sessionDelta, 0);
  assert.strictEqual(breakDone.completedMode, 'break');
  assert.strictEqual(breakDone.pomodoro.mode, 'focus');
  assert.strictEqual(breakDone.pomodoro.left, 1500);
}

function run() {
  testNormalizeState();
  testHistoryHelpers();
  testGoalAndDuration();
  testTickPomodoro();
  console.log('state-utils tests passed');
}

run();
