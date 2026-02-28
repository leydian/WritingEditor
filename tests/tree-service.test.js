const assert = require('assert');
const path = require('path');

const treeService = require(path.join(__dirname, '..', 'tree-service.js'));

async function withMockedNow(nowValue, fn) {
  const originalNow = Date.now;
  Date.now = () => nowValue;
  try {
    return await fn();
  } finally {
    Date.now = originalNow;
  }
}

async function testCreateDoc() {
  const state = {
    docs: [{ id: 'd1', name: 'A', folderId: null, content: '' }],
    folders: [],
    activeDocA: 'd1',
    activeDocB: null,
  };
  const history = [];
  let saved = 0;
  let renderedAll = 0;
  let renderedTree = 0;

  const actions = treeService.createTreeActions({
    state,
    getDoc: (id) => state.docs.find((d) => d.id === id),
    openInputDialog: async () => '새 문서',
    openConfirmDialog: async () => true,
    openNoticeDialog: async () => {},
    addHistoryEntry: (trigger, meta) => history.push({ trigger, meta }),
    cloneStateForHistory: () => ({ snapshot: true }),
    saveState: () => { saved += 1; },
    renderAll: () => { renderedAll += 1; },
    renderTree: () => { renderedTree += 1; },
    dirtyDocIds: new Set(),
  });

  await withMockedNow(1000, async () => {
    await actions.createDoc(null);
  });

  assert.strictEqual(state.docs.length, 2);
  assert.strictEqual(state.docs[1].id, 'd1000');
  assert.strictEqual(state.docs[1].name, '새 문서');
  assert.strictEqual(state.activeDocA, 'd1000');
  assert.strictEqual(history.length, 1);
  assert.strictEqual(history[0].trigger, 'doc-create');
  assert.strictEqual(saved, 1);
  assert.strictEqual(renderedAll, 1);
  assert.strictEqual(renderedTree, 0);
}

async function testDeleteFolderAndEnsureOneDoc() {
  const state = {
    docs: [{ id: 'd1', name: 'A', folderId: 'f1', content: '' }],
    folders: [{ id: 'f1', name: 'Folder', parentFolderId: null }],
    activeDocA: 'd1',
    activeDocB: null,
  };
  let saved = 0;
  let renderedAll = 0;
  const dirtyDocIds = new Set(['d1']);

  const actions = treeService.createTreeActions({
    state,
    getDoc: (id) => state.docs.find((d) => d.id === id),
    openInputDialog: async () => null,
    openConfirmDialog: async () => true,
    openNoticeDialog: async () => {},
    addHistoryEntry: () => {},
    cloneStateForHistory: () => ({ snapshot: true }),
    saveState: () => { saved += 1; },
    renderAll: () => { renderedAll += 1; },
    renderTree: () => {},
    dirtyDocIds,
  });

  await withMockedNow(2000, async () => {
    await actions.deleteFolder('f1');
  });

  assert.strictEqual(state.folders.length, 0);
  assert.strictEqual(state.docs.length, 1);
  assert.strictEqual(state.docs[0].id, 'd2000');
  assert.strictEqual(state.activeDocA, 'd2000');
  assert.strictEqual(dirtyDocIds.has('d1'), false);
  assert.strictEqual(saved, 1);
  assert.strictEqual(renderedAll, 1);
}

async function testMoveFolderToDescendantBlocked() {
  const state = {
    docs: [],
    folders: [
      { id: 'f1', name: 'parent', parentFolderId: null },
      { id: 'f2', name: 'child', parentFolderId: 'f1' },
    ],
    activeDocA: null,
    activeDocB: null,
  };
  let noticeCount = 0;
  let saved = 0;

  const actions = treeService.createTreeActions({
    state,
    getDoc: () => null,
    openInputDialog: async () => null,
    openConfirmDialog: async () => true,
    openNoticeDialog: async () => { noticeCount += 1; },
    addHistoryEntry: () => {},
    cloneStateForHistory: () => ({}),
    saveState: () => { saved += 1; },
    renderAll: () => {},
    renderTree: () => {},
    dirtyDocIds: new Set(),
  });

  await actions.moveFolderToFolder('f1', 'f2');

  assert.strictEqual(noticeCount, 1);
  assert.strictEqual(saved, 0);
  assert.strictEqual(state.folders.find((f) => f.id === 'f1').parentFolderId, null);
}

async function run() {
  await testCreateDoc();
  await testDeleteFolderAndEnsureOneDoc();
  await testMoveFolderToDescendantBlocked();
  console.log('tree-service tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
