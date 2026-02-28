(function initHistoryService(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.HistoryService = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function createHistoryActions(deps = {}) {
    const {
      state,
      stateApi,
      getDoc,
      saveState,
      dirtyDocIds,
      historyAutoSaveMs = 10 * 60 * 1000,
    } = deps;

    let historyAutoTimer = null;

    function cloneStateForHistory() {
      if (stateApi && typeof stateApi.cloneStateForHistory === 'function') {
        return stateApi.cloneStateForHistory(state);
      }
      const snapshot = JSON.parse(JSON.stringify(state));
      delete snapshot.historyEntries;
      return snapshot;
    }

    function countParagraphs(text) {
      return String(text || '')
        .split(/\n\s*\n/g)
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length > 0)
        .length;
    }

    function getDocContentFromSnapshot(snapshot, docId) {
      if (!snapshot || !Array.isArray(snapshot.docs)) return '';
      const target = snapshot.docs.find((doc) => doc && doc.id === docId)
        || snapshot.docs.find((doc) => doc && doc.id === snapshot.activeDocA)
        || snapshot.docs[0];
      return target && typeof target.content === 'string' ? target.content : '';
    }

    function getHistoryDeltaMeta(snapshot, meta = {}) {
      const docId = meta.docId || state.activeDocA || null;
      const baseline = Array.isArray(state.historyEntries) && state.historyEntries[0]
        ? state.historyEntries[0].snapshot
        : null;
      const nowText = getDocContentFromSnapshot(snapshot, docId);
      const beforeText = getDocContentFromSnapshot(baseline, docId);
      return {
        charDelta: nowText.length - beforeText.length,
        paraDelta: countParagraphs(nowText) - countParagraphs(beforeText),
      };
    }

    function formatSignedDelta(value) {
      const n = Number(value) || 0;
      if (n > 0) return `+${n}`;
      return String(n);
    }

    function addHistoryEntry(trigger, meta = {}, snapshotOverride = null) {
      const snapshot = snapshotOverride || cloneStateForHistory();
      const deltaMeta = getHistoryDeltaMeta(snapshot, meta);
      const payloadMeta = { ...meta, ...deltaMeta };
      if (
        stateApi
        && typeof stateApi.createHistoryEntry === 'function'
        && typeof stateApi.prependHistoryEntry === 'function'
      ) {
        const entry = stateApi.createHistoryEntry(trigger, payloadMeta, snapshot);
        state.historyEntries = stateApi.prependHistoryEntry(state.historyEntries, entry, 10);
        return;
      }
      const arr = Array.isArray(state.historyEntries) ? state.historyEntries : [];
      arr.unshift({
        id: Date.now() + Math.floor(Math.random() * 1000),
        savedAt: new Date().toISOString(),
        trigger,
        scope: payloadMeta.scope || 'doc',
        docId: payloadMeta.docId || null,
        docName: payloadMeta.docName || null,
        summary: payloadMeta.summary || '',
        meta: {
          charDelta: payloadMeta.charDelta || 0,
          paraDelta: payloadMeta.paraDelta || 0,
        },
        snapshot,
      });
      state.historyEntries = arr.slice(0, 10);
    }

    function markDocDirty(docId) {
      if (!docId) return;
      dirtyDocIds.add(docId);
    }

    function flushHistorySnapshots(trigger, options = {}) {
      const onlyFullSync = !!options.onlyFullSync;
      const ids = [];
      if (!onlyFullSync) {
        dirtyDocIds.forEach((id) => {
          if (getDoc(id)) ids.push(id);
        });
      }

      if (!onlyFullSync && ids.length === 0 && options.includeActiveFallback && state.activeDocA && getDoc(state.activeDocA)) {
        ids.push(state.activeDocA);
      }
      if (ids.length === 0 && !options.includeFullSync) return 0;

      ids.forEach((id) => {
        const doc = getDoc(id);
        if (!doc) return;
        addHistoryEntry(trigger, {
          scope: 'doc',
          docId: doc.id,
          docName: doc.name || id,
          summary: `문서 수정 저장: ${doc.name || id}`,
        });
        dirtyDocIds.delete(id);
      });
      if (options.includeFullSync) {
        addHistoryEntry(trigger, {
          scope: 'full',
          summary: '전체 동기화',
        });
        if (onlyFullSync) dirtyDocIds.clear();
      }
      saveState();
      return ids.length + (options.includeFullSync ? 1 : 0);
    }

    function ensureHistoryAutoSaveInterval() {
      if (historyAutoTimer) return;
      historyAutoTimer = setInterval(() => {
        flushHistorySnapshots('auto-10m', { includeFullSync: true, onlyFullSync: true });
      }, historyAutoSaveMs);
    }

    return {
      cloneStateForHistory,
      countParagraphs,
      getDocContentFromSnapshot,
      getHistoryDeltaMeta,
      formatSignedDelta,
      addHistoryEntry,
      markDocDirty,
      flushHistorySnapshots,
      ensureHistoryAutoSaveInterval,
    };
  }

  return {
    createHistoryActions,
  };
}));
