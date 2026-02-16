(function initStateUtils(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.StateUtils = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function defaultState() {
    return {
      docs: [{ id: 'd1', name: '새 문서.txt', folderId: null, content: '' }],
      folders: [],
      activeDocA: 'd1',
      activeDocB: null,
      split: 'single',
      goalByDate: {},
      goalLockedByDate: {},
      goalMetricByDate: {},
      progressByDate: {},
      sessionsByDate: {},
      focusSecondsByDate: {},
      historyEntries: [],
      pomodoro: { mode: 'focus', left: 25 * 60, running: false },
    };
  }

  function normalizeState(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;

    const merged = {
      ...base,
      ...raw,
      pomodoro: { ...base.pomodoro, ...(raw.pomodoro || {}) },
    };

    if (!Array.isArray(merged.docs)) merged.docs = base.docs;
    if (!Array.isArray(merged.folders)) merged.folders = [];
    if (!Array.isArray(merged.historyEntries)) merged.historyEntries = [];
    if (!merged.goalLockedByDate || typeof merged.goalLockedByDate !== 'object') merged.goalLockedByDate = {};
    if (!merged.goalMetricByDate || typeof merged.goalMetricByDate !== 'object') merged.goalMetricByDate = {};
    if (Object.prototype.hasOwnProperty.call(merged, 'historyByDoc')) delete merged.historyByDoc;
    if (!merged.sessionsByDate || typeof merged.sessionsByDate !== 'object') merged.sessionsByDate = {};
    if (!merged.focusSecondsByDate || typeof merged.focusSecondsByDate !== 'object') merged.focusSecondsByDate = {};
    merged.folders = merged.folders.map((f) => ({
      ...f,
      parentFolderId: f && typeof f.parentFolderId !== 'undefined' ? f.parentFolderId : null,
    }));
    if (merged.docs.length === 0 && merged.folders.length === 0) {
      merged.docs = base.docs;
      merged.activeDocA = base.activeDocA;
    }
    if (merged.docs.length > 0) {
      if (!merged.activeDocA || !merged.docs.some((d) => d.id === merged.activeDocA)) {
        merged.activeDocA = merged.docs[0].id;
      }
      if (merged.activeDocB && !merged.docs.some((d) => d.id === merged.activeDocB)) {
        merged.activeDocB = null;
      }
    } else {
      merged.activeDocA = null;
      merged.activeDocB = null;
    }
    if (!['single', 'vertical', 'horizontal'].includes(merged.split)) {
      merged.split = 'single';
    }
    if (!merged.pomodoro || typeof merged.pomodoro !== 'object') {
      merged.pomodoro = { ...base.pomodoro };
    }
    if (merged.pomodoro.mode !== 'focus' && merged.pomodoro.mode !== 'break') {
      merged.pomodoro.mode = 'focus';
    }
    if (typeof merged.pomodoro.left !== 'number' || Number.isNaN(merged.pomodoro.left) || merged.pomodoro.left <= 0) {
      merged.pomodoro.left = merged.pomodoro.mode === 'focus' ? 25 * 60 : 5 * 60;
    }
    merged.pomodoro.running = !!merged.pomodoro.running;

    return merged;
  }

  function cloneStateForHistory(state) {
    const snapshot = JSON.parse(JSON.stringify(state || {}));
    delete snapshot.historyEntries;
    return snapshot;
  }

  function createHistoryEntry(trigger, meta = {}, snapshot, options = {}) {
    const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    const randomInt = Number.isFinite(options.randomInt) ? options.randomInt : Math.floor(Math.random() * 1000);
    const now = options.now instanceof Date ? options.now : new Date();

    return {
      id: nowMs + randomInt,
      savedAt: now.toISOString(),
      trigger,
      scope: meta.scope || 'doc',
      docId: meta.docId || null,
      docName: meta.docName || null,
      summary: meta.summary || '',
      snapshot,
    };
  }

  function prependHistoryEntry(historyEntries, entry, limit = 10) {
    const arr = Array.isArray(historyEntries) ? historyEntries.slice() : [];
    arr.unshift(entry);
    return arr.slice(0, limit);
  }

  function getGoalMetric(goalMetricByDate, dateKey) {
    return goalMetricByDate && goalMetricByDate[dateKey] === 'noSpaces' ? 'noSpaces' : 'withSpaces';
  }

  function getActualByGoalMetric(actualWithSpaces, actualNoSpaces, metric) {
    return metric === 'noSpaces' ? actualNoSpaces : actualWithSpaces;
  }

  function formatDuration(totalSeconds) {
    const sec = Math.max(0, Number(totalSeconds) || 0);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function tickPomodoro(pomodoroInput) {
    const p = {
      mode: pomodoroInput && pomodoroInput.mode === 'break' ? 'break' : 'focus',
      left: Number((pomodoroInput && pomodoroInput.left) || 0),
      running: !!(pomodoroInput && pomodoroInput.running),
    };
    if (!p.running) {
      return { pomodoro: p, focusDelta: 0, sessionDelta: 0, completedMode: null };
    }

    let focusDelta = 0;
    let sessionDelta = 0;
    let completedMode = null;

    if (p.mode === 'focus') focusDelta = 1;
    p.left -= 1;

    if (p.left <= 0) {
      completedMode = p.mode;
      if (completedMode === 'focus') sessionDelta = 1;
      p.mode = p.mode === 'focus' ? 'break' : 'focus';
      p.left = p.mode === 'focus' ? 25 * 60 : 5 * 60;
    }

    return { pomodoro: p, focusDelta, sessionDelta, completedMode };
  }

  return {
    defaultState,
    normalizeState,
    cloneStateForHistory,
    createHistoryEntry,
    prependHistoryEntry,
    getGoalMetric,
    getActualByGoalMetric,
    formatDuration,
    tickPomodoro,
  };
}));
