const assert = require('assert');
const path = require('path');

const historyService = require(path.join(__dirname, '..', 'history-service.js'));

function testAddAndFlushHistory() {
  const state = {
    docs: [
      { id: 'd1', name: 'Doc1', folderId: null, content: 'hello\n\nworld' },
      { id: 'd2', name: 'Doc2', folderId: null, content: 'x' },
    ],
    activeDocA: 'd1',
    historyEntries: [],
  };
  const dirtyDocIds = new Set();
  let saveCount = 0;

  const actions = historyService.createHistoryActions({
    state,
    stateApi: null,
    getDoc: (id) => state.docs.find((d) => d.id === id),
    saveState: () => { saveCount += 1; },
    dirtyDocIds,
    historyAutoSaveMs: 1000,
  });

  actions.markDocDirty('d1');
  const flushed = actions.flushHistorySnapshots('manual-save', { includeFullSync: true });

  assert.strictEqual(flushed, 2);
  assert.strictEqual(saveCount, 1);
  assert.strictEqual(dirtyDocIds.size, 0);
  assert.strictEqual(state.historyEntries.length, 2);
  assert.strictEqual(state.historyEntries[0].scope, 'full');
  assert.strictEqual(state.historyEntries[1].docId, 'd1');
}

function testHelpers() {
  const state = {
    docs: [{ id: 'd1', name: 'Doc1', folderId: null, content: 'a\n\nb' }],
    activeDocA: 'd1',
    historyEntries: [],
  };
  const actions = historyService.createHistoryActions({
    state,
    stateApi: null,
    getDoc: (id) => state.docs.find((d) => d.id === id),
    saveState: () => {},
    dirtyDocIds: new Set(),
  });

  assert.strictEqual(actions.countParagraphs('a\n\nb\n\n'), 2);
  assert.strictEqual(actions.formatSignedDelta(3), '+3');
  assert.strictEqual(actions.formatSignedDelta(-1), '-1');

  const snap = actions.cloneStateForHistory();
  assert.strictEqual(Object.prototype.hasOwnProperty.call(snap, 'historyEntries'), false);
}

function run() {
  testAddAndFlushHistory();
  testHelpers();
  console.log('history-service tests passed');
}

run();
