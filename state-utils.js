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
      stateVersion: 2,
      docs: [{ id: 'd1', name: 'new-doc.txt', folderId: null, content: '' }],
      folders: [],
      activeDocA: 'd1',
      activeDocB: null,
      ui: {
        commandPalette: {
          enabled: true,
          recentCommands: [],
        },
      },
      split: 'single',
      goalByDate: {},
      goalLockedByDate: {},
      goalMetricByDate: {},
      progressByDate: {},
      sessionsByDate: {},
      focusSecondsByDate: {},
      historyEntries: [],
      splitRatioByMode: {
        vertical: 50,
        horizontal: 50,
      },
      pomodoroMinutes: { focus: 25, break: 5 },
      pomodoro: { mode: 'focus', left: 25 * 60, running: false },
    };
  }

  function normalizeState(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;

    const merged = {
      ...base,
      ...raw,
      ui: {
        ...base.ui,
        ...(raw.ui || {}),
        commandPalette: {
          ...base.ui.commandPalette,
          ...((raw.ui && raw.ui.commandPalette) || {}),
        },
      },
      pomodoro: { ...base.pomodoro, ...(raw.pomodoro || {}) },
    };

    if (!Array.isArray(merged.docs)) merged.docs = base.docs;
    if (!Array.isArray(merged.folders)) merged.folders = [];
    if (!Array.isArray(merged.historyEntries)) merged.historyEntries = [];
    merged.stateVersion = 2;

    if (!merged.ui || typeof merged.ui !== 'object') merged.ui = { ...base.ui };
    if (!merged.ui.commandPalette || typeof merged.ui.commandPalette !== 'object') {
      merged.ui.commandPalette = { ...base.ui.commandPalette };
    }
    merged.ui.commandPalette.enabled = merged.ui.commandPalette.enabled !== false;
    if (!Array.isArray(merged.ui.commandPalette.recentCommands)) {
      merged.ui.commandPalette.recentCommands = [];
    } else {
      merged.ui.commandPalette.recentCommands = merged.ui.commandPalette.recentCommands
        .map((x) => String(x || '').trim())
        .filter((x) => x)
        .slice(0, 8);
    }

    if (!merged.goalLockedByDate || typeof merged.goalLockedByDate !== 'object') merged.goalLockedByDate = {};
    if (!merged.goalMetricByDate || typeof merged.goalMetricByDate !== 'object') merged.goalMetricByDate = {};
    if (Object.prototype.hasOwnProperty.call(merged, 'historyByDoc')) delete merged.historyByDoc;
    if (!merged.sessionsByDate || typeof merged.sessionsByDate !== 'object') merged.sessionsByDate = {};
    if (!merged.focusSecondsByDate || typeof merged.focusSecondsByDate !== 'object') merged.focusSecondsByDate = {};
    if (!merged.pomodoroMinutes || typeof merged.pomodoroMinutes !== 'object') {
      merged.pomodoroMinutes = { ...base.pomodoroMinutes };
    }
    const clampMinutes = (value, fallback) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(1, Math.min(180, Math.round(n)));
    };
    merged.pomodoroMinutes.focus = clampMinutes(merged.pomodoroMinutes.focus, 25);
    merged.pomodoroMinutes.break = clampMinutes(merged.pomodoroMinutes.break, 5);
    if (!merged.splitRatioByMode || typeof merged.splitRatioByMode !== 'object') {
      merged.splitRatioByMode = { ...base.splitRatioByMode };
    }
    const clampRatio = (n) => {
      const x = Number(n);
      if (!Number.isFinite(x)) return 50;
      return Math.max(20, Math.min(80, x));
    };
    merged.splitRatioByMode.vertical = clampRatio(merged.splitRatioByMode.vertical);
    merged.splitRatioByMode.horizontal = clampRatio(merged.splitRatioByMode.horizontal);
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
      merged.pomodoro.left = merged.pomodoro.mode === 'focus'
        ? merged.pomodoroMinutes.focus * 60
        : merged.pomodoroMinutes.break * 60;
    }
    merged.pomodoro.running = !!merged.pomodoro.running;

    const toInt = (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return 0;
      return Math.trunc(n);
    };
    merged.historyEntries = merged.historyEntries.map((entry) => {
      const next = entry && typeof entry === 'object' ? { ...entry } : {};
      const srcMeta = next.meta && typeof next.meta === 'object' ? next.meta : {};
      next.meta = {
        charDelta: toInt(srcMeta.charDelta),
        paraDelta: toInt(srcMeta.paraDelta),
      };
      return next;
    });

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
      meta: {
        charDelta: Number.isFinite(Number(meta.charDelta)) ? Math.trunc(Number(meta.charDelta)) : 0,
        paraDelta: Number.isFinite(Number(meta.paraDelta)) ? Math.trunc(Number(meta.paraDelta)) : 0,
      },
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

  function tickPomodoro(pomodoroInput, durationsInput = null) {
    const durations = {
      focus: Math.max(1, Math.min(180, Math.round(Number(durationsInput && durationsInput.focus) || 25))),
      break: Math.max(1, Math.min(180, Math.round(Number(durationsInput && durationsInput.break) || 5))),
    };
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
      p.left = p.mode === 'focus' ? durations.focus * 60 : durations.break * 60;
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
