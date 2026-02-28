(function initTimerService(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.TimerService = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function createTimerActions(deps = {}) {
    const {
      state,
      stateApi,
      todayKey,
      openNoticeDialog,
      saveState,
      updateProgress,
      getById,
    } = deps;

    let timerRef = null;

    function getPomodoroMinutes() {
      const base = state && state.pomodoroMinutes && typeof state.pomodoroMinutes === 'object'
        ? state.pomodoroMinutes
        : { focus: 25, break: 5 };
      const clamp = (value, fallback) => {
        const raw = String(value == null ? '' : value).replace(/[^\d]/g, '').slice(0, 3);
        const n = Number(raw);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(1, Math.min(180, Math.round(n)));
      };
      return {
        focus: clamp(base.focus, 25),
        break: clamp(base.break, 5),
      };
    }

    function renderTimer() {
      const sec = state.pomodoro.left;
      const mins = getPomodoroMinutes();
      const focusInput = getById('pomodoro-focus-min');
      const breakInput = getById('pomodoro-break-min');
      if (focusInput) focusInput.value = String(mins.focus);
      if (breakInput) breakInput.value = String(mins.break);
      getById('timer-label').textContent = state.pomodoro.mode === 'focus' ? '집중' : '휴식';
      getById('timer-display').textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
      const toggleBtn = getById('timer-toggle');
      if (toggleBtn) toggleBtn.textContent = state.pomodoro.running ? '일시정지' : '시작';
    }

    function tickTimer() {
      if (!state.pomodoro.running) return;

      if (stateApi && typeof stateApi.tickPomodoro === 'function') {
        const date = todayKey();
        const tick = stateApi.tickPomodoro(state.pomodoro, getPomodoroMinutes());
        state.pomodoro = tick.pomodoro;
        if (tick.focusDelta) {
          state.focusSecondsByDate[date] = (state.focusSecondsByDate[date] || 0) + tick.focusDelta;
        }
        if (tick.sessionDelta) {
          state.sessionsByDate[date] = (state.sessionsByDate[date] || 0) + tick.sessionDelta;
        }
        if (tick.completedMode) {
          void openNoticeDialog({
            title: '뽀모도로',
            message: `${tick.completedMode === 'focus' ? '집중' : '휴식'} 완료! 다음: ${state.pomodoro.mode}`,
          });
        }
      } else {
        if (state.pomodoro.mode === 'focus') {
          const date = todayKey();
          state.focusSecondsByDate[date] = (state.focusSecondsByDate[date] || 0) + 1;
        }
        state.pomodoro.left -= 1;
        if (state.pomodoro.left <= 0) {
          const completedMode = state.pomodoro.mode;
          const date = todayKey();
          if (completedMode === 'focus') {
            state.sessionsByDate[date] = (state.sessionsByDate[date] || 0) + 1;
          }
          state.pomodoro.mode = state.pomodoro.mode === 'focus' ? 'break' : 'focus';
          const mins = getPomodoroMinutes();
          state.pomodoro.left = state.pomodoro.mode === 'focus' ? mins.focus * 60 : mins.break * 60;
          void openNoticeDialog({
            title: '뽀모도로',
            message: `${completedMode === 'focus' ? '집중' : '휴식'} 완료! 다음: ${state.pomodoro.mode}`,
          });
        }
      }

      saveState();
      renderTimer();
      updateProgress();
    }

    function ensureTimerInterval() {
      if (timerRef) return;
      timerRef = setInterval(tickTimer, 1000);
    }

    function resetTimerInterval() {
      if (!timerRef) return;
      clearInterval(timerRef);
      timerRef = null;
    }

    function applyPomodoroMinutesFromInputs() {
      const focusInput = getById('pomodoro-focus-min');
      const breakInput = getById('pomodoro-break-min');
      if (!focusInput || !breakInput) return;
      const clamp = (value, fallback) => {
        const raw = String(value == null ? '' : value).replace(/[^\d]/g, '').slice(0, 3);
        const n = Number(raw);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(1, Math.min(180, Math.round(n)));
      };
      const focusMin = clamp(focusInput.value, 25);
      const breakMin = clamp(breakInput.value, 5);
      state.pomodoroMinutes = { focus: focusMin, break: breakMin };
      state.pomodoro.running = false;
      state.pomodoro.left = state.pomodoro.mode === 'focus' ? focusMin * 60 : breakMin * 60;
      focusInput.value = String(focusMin);
      breakInput.value = String(breakMin);
      saveState();
      renderTimer();
    }

    return {
      tickTimer,
      ensureTimerInterval,
      resetTimerInterval,
      renderTimer,
      getPomodoroMinutes,
      applyPomodoroMinutesFromInputs,
    };
  }

  return {
    createTimerActions,
  };
}));
