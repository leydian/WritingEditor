(function initUiBindings(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.UiBindings = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function bindUiEvents(deps) {
    const {
      $,
      MOBILE_MINI_BREAKPOINT,
      layoutPrefs,
      saveLayoutPrefs,
      applyAppLayout,
      getMobileMiniState,
      setMobileMiniState,
      setActivePane,
      updateEditorPane,
      isTodayGoalLocked,
      todayKey,
      state,
      saveState,
      updateProgress,
      getGoalMetric,
      updateGoalLockUI,
      setCalendarViewMode,
      getCalendarViewMode,
      shiftCalendarMonth,
      closeHistoryDialog,
      openHistoryDialog,
      ensureTimerInterval,
      renderTimer,
      applyPomodoroMinutesFromInputs,
      handleManualSync,
      exportTxt,
      exportPdf,
      authLogout,
      openUpgradeDialog,
      closeUpgradeDialog,
      upgradeAnonymousAccount,
      openWithdrawDialog,
      closeWithdrawDialog,
      updateWithdrawConfirmState,
      authWithdraw,
      settleEncryptionUnlockResolver,
      closeEncryptionUnlockDialog,
      openCommandPalette,
      closeCommandPalette,
      renderCommandPalette,
      getFilteredCommands,
      runCommandFromPalette,
      getCommandPaletteSelection,
      setCommandPaletteSelection,
      switchSplit,
    } = deps;

    const commandPaletteBtn = $('command-palette-btn');
    const commandPaletteDialog = $('command-palette-dialog');
    const commandPaletteInput = $('command-palette-input');
    const commandPaletteCloseBtn = $('command-palette-close-btn');
    const toggleTreeBtn = $('toggle-tree-btn');
    const toggleCalendarBtn = $('toggle-calendar-btn');
    const showTreeBar = $('show-tree-bar');
    const showCalendarBar = $('show-calendar-bar');
    const sidebarToolbarBtn = $('toggle-sidebar-toolbar-btn');
    const calendarToolbarBtn = $('toggle-calendar-toolbar-btn');
    const topCommandBtn = $('top-command-btn');
    const manualSyncBtn = $('manual-sync-btn');
    const historyOpenBtn = $('history-open-btn');
    const splitSingleBtn = $('split-single-btn');
    const splitVerticalBtn = $('split-vertical-btn');
    const splitHorizontalBtn = $('split-horizontal-btn');
    const exportTxtBtn = $('export-txt-btn');
    const exportPdfBtn = $('export-pdf-btn');
    const editorA = $('editor-a');
    const editorB = $('editor-b');
    const goalInput = $('goal-input');
    const goalNoSpacesCheck = $('goal-no-spaces-check');
    const goalLockBtn = $('goal-lock-btn');
    const calendarModeToggleBtn = $('calendar-mode-toggle-btn');
    const calendarPrevMonthBtn = $('calendar-prev-month-btn');
    const calendarNextMonthBtn = $('calendar-next-month-btn');
    const historyCloseBtn = $('history-close');
    const timerToggleBtn = $('timer-toggle');
    const timerSkipBtn = $('timer-skip');
    const pomodoroFocusMinInput = $('pomodoro-focus-min');
    const pomodoroBreakMinInput = $('pomodoro-break-min');
    const pomodoroApplyBtn = $('pomodoro-apply');
    const logoutBtn = $('logout-btn');
    const upgradeAccountBtn = $('upgrade-account-btn');
    const upgradeCancelBtn = $('upgrade-cancel-btn');
    const upgradeConfirmBtn = $('upgrade-confirm-btn');
    const withdrawBtn = $('withdraw-btn');
    const withdrawCancelBtn = $('withdraw-cancel-btn');
    const withdrawConfirmBtn = $('withdraw-confirm-btn');
    const withdrawCheck = $('withdraw-confirm-check');
    const withdrawText = $('withdraw-confirm-text');
    const withdrawEmail = $('withdraw-email');
    const withdrawPassword = $('withdraw-password');
    const encryptionUnlockDialog = $('encryption-unlock-dialog');
    const encryptionUnlockPassword = $('encryption-unlock-password');
    const encryptionUnlockConfirmBtn = $('encryption-unlock-confirm-btn');
    const encryptionUnlockCancelBtn = $('encryption-unlock-cancel-btn');

    if (commandPaletteBtn) commandPaletteBtn.onclick = openCommandPalette;
    if (topCommandBtn) topCommandBtn.onclick = openCommandPalette;
    if (toggleTreeBtn) toggleTreeBtn.onclick = () => {
      if (window.innerWidth <= MOBILE_MINI_BREAKPOINT) {
        const mobile = getMobileMiniState();
        setMobileMiniState({ sidebarOpen: false, calendarOpen: mobile.calendarOpen });
        applyAppLayout();
        return;
      }
      layoutPrefs.showSidebar = !layoutPrefs.showSidebar;
      saveLayoutPrefs();
      applyAppLayout();
    };
    if (toggleCalendarBtn) toggleCalendarBtn.onclick = () => {
      if (window.innerWidth <= MOBILE_MINI_BREAKPOINT) {
        const mobile = getMobileMiniState();
        setMobileMiniState({ sidebarOpen: mobile.sidebarOpen, calendarOpen: false });
        applyAppLayout();
        return;
      }
      layoutPrefs.showCalendar = !layoutPrefs.showCalendar;
      saveLayoutPrefs();
      applyAppLayout();
    };
    if (showTreeBar) showTreeBar.onclick = () => {
      if (window.innerWidth <= MOBILE_MINI_BREAKPOINT) {
        setMobileMiniState({ sidebarOpen: true, calendarOpen: false });
        applyAppLayout();
        return;
      }
      layoutPrefs.showSidebar = true;
      saveLayoutPrefs();
      applyAppLayout();
    };
    if (showCalendarBar) showCalendarBar.onclick = () => {
      if (window.innerWidth <= MOBILE_MINI_BREAKPOINT) {
        setMobileMiniState({ sidebarOpen: false, calendarOpen: true });
        applyAppLayout();
        return;
      }
      layoutPrefs.showCalendar = true;
      saveLayoutPrefs();
      applyAppLayout();
    };
    if (sidebarToolbarBtn) sidebarToolbarBtn.onclick = () => {
      if (window.innerWidth <= MOBILE_MINI_BREAKPOINT) {
        const mobile = getMobileMiniState();
        const nextSidebar = !mobile.sidebarOpen;
        setMobileMiniState({ sidebarOpen: nextSidebar, calendarOpen: nextSidebar ? false : mobile.calendarOpen });
        applyAppLayout();
        return;
      }
      layoutPrefs.showSidebar = !layoutPrefs.showSidebar;
      saveLayoutPrefs();
      applyAppLayout();
    };
    if (calendarToolbarBtn) calendarToolbarBtn.onclick = () => {
      if (window.innerWidth <= MOBILE_MINI_BREAKPOINT) {
        const mobile = getMobileMiniState();
        const nextCalendar = !mobile.calendarOpen;
        setMobileMiniState({ sidebarOpen: nextCalendar ? false : mobile.sidebarOpen, calendarOpen: nextCalendar });
        applyAppLayout();
        return;
      }
      if (window.innerWidth <= 1100) return;
      layoutPrefs.showCalendar = !layoutPrefs.showCalendar;
      saveLayoutPrefs();
      applyAppLayout();
    };

    if (editorA) editorA.addEventListener('focus', () => setActivePane('a'));
    if (editorB) editorB.addEventListener('focus', () => setActivePane('b'));
    if (editorA) editorA.addEventListener('input', (e) => updateEditorPane('a', e.target.value));
    if (editorB) editorB.addEventListener('input', (e) => updateEditorPane('b', e.target.value));

    if (goalInput) goalInput.addEventListener('change', (e) => {
      if (isTodayGoalLocked()) {
        e.target.value = state.goalByDate[todayKey()] || 0;
        return;
      }
      state.goalByDate[todayKey()] = Number(e.target.value || 0);
      saveState();
      updateProgress();
    });
    if (goalNoSpacesCheck) goalNoSpacesCheck.addEventListener('change', (e) => {
      if (isTodayGoalLocked()) {
        e.target.checked = getGoalMetric(todayKey()) === 'noSpaces';
        return;
      }
      state.goalMetricByDate[todayKey()] = e.target.checked ? 'noSpaces' : 'withSpaces';
      saveState();
      updateProgress();
    });
    if (goalLockBtn) goalLockBtn.onclick = () => {
      const key = todayKey();
      const locked = !!state.goalLockedByDate[key];
      state.goalLockedByDate[key] = !locked;
      saveState();
      updateGoalLockUI();
    };
    if (calendarModeToggleBtn) {
      calendarModeToggleBtn.onclick = () => {
        setCalendarViewMode(getCalendarViewMode() === 'calendar' ? 'table' : 'calendar');
      };
    }
    if (calendarPrevMonthBtn) calendarPrevMonthBtn.onclick = () => shiftCalendarMonth(-1);
    if (calendarNextMonthBtn) calendarNextMonthBtn.onclick = () => shiftCalendarMonth(1);

    if (historyCloseBtn) historyCloseBtn.onclick = closeHistoryDialog;
    if (historyOpenBtn) historyOpenBtn.onclick = openHistoryDialog;
    if (manualSyncBtn) manualSyncBtn.onclick = () => {
      void handleManualSync();
    };
    if (splitSingleBtn) splitSingleBtn.onclick = () => switchSplit('single');
    if (splitVerticalBtn) splitVerticalBtn.onclick = () => switchSplit('vertical');
    if (splitHorizontalBtn) splitHorizontalBtn.onclick = () => switchSplit('horizontal');
    if (exportTxtBtn) exportTxtBtn.onclick = exportTxt;
    if (exportPdfBtn) exportPdfBtn.onclick = () => {
      void exportPdf();
    };

    if (timerToggleBtn) timerToggleBtn.onclick = () => {
      state.pomodoro.running = !state.pomodoro.running;
      ensureTimerInterval();
      saveState();
      renderTimer();
    };
    if (timerSkipBtn) timerSkipBtn.onclick = () => {
      state.pomodoro.left = 1;
      state.pomodoro.running = true;
      ensureTimerInterval();
      saveState();
      renderTimer();
    };
    if (pomodoroApplyBtn) pomodoroApplyBtn.onclick = applyPomodoroMinutesFromInputs;
    if (pomodoroFocusMinInput) pomodoroFocusMinInput.addEventListener('change', applyPomodoroMinutesFromInputs);
    if (pomodoroBreakMinInput) pomodoroBreakMinInput.addEventListener('change', applyPomodoroMinutesFromInputs);

    if (logoutBtn) logoutBtn.onclick = authLogout;
    if (upgradeAccountBtn) upgradeAccountBtn.onclick = openUpgradeDialog;
    if (upgradeCancelBtn) upgradeCancelBtn.onclick = closeUpgradeDialog;
    if (upgradeConfirmBtn) upgradeConfirmBtn.onclick = upgradeAnonymousAccount;
    if (withdrawBtn) withdrawBtn.onclick = openWithdrawDialog;
    if (withdrawCancelBtn) withdrawCancelBtn.onclick = closeWithdrawDialog;
    if (withdrawCheck) withdrawCheck.addEventListener('change', updateWithdrawConfirmState);
    if (withdrawText) withdrawText.addEventListener('input', updateWithdrawConfirmState);
    if (withdrawEmail) withdrawEmail.addEventListener('input', updateWithdrawConfirmState);
    if (withdrawPassword) withdrawPassword.addEventListener('input', updateWithdrawConfirmState);
    if (withdrawConfirmBtn) withdrawConfirmBtn.onclick = authWithdraw;
    if (encryptionUnlockConfirmBtn) encryptionUnlockConfirmBtn.onclick = () => {
      const value = encryptionUnlockPassword && encryptionUnlockPassword.value
        ? encryptionUnlockPassword.value
        : '';
      settleEncryptionUnlockResolver(value);
      closeEncryptionUnlockDialog();
    };
    if (encryptionUnlockCancelBtn) encryptionUnlockCancelBtn.onclick = () => {
      closeEncryptionUnlockDialog();
      settleEncryptionUnlockResolver('');
    };
    if (encryptionUnlockPassword) encryptionUnlockPassword.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (encryptionUnlockConfirmBtn) encryptionUnlockConfirmBtn.click();
    });
    if (encryptionUnlockDialog) {
      encryptionUnlockDialog.addEventListener('cancel', () => {
        settleEncryptionUnlockResolver('');
      });
      encryptionUnlockDialog.addEventListener('close', () => {
        settleEncryptionUnlockResolver('');
      });
    }
    document.addEventListener('keydown', (e) => {
      const isCmdK = (e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k';
      if (isCmdK) {
        e.preventDefault();
        openCommandPalette();
        return;
      }
      if (e.altKey && e.key === '1') switchSplit('single');
      if (e.altKey && e.key === '\\') switchSplit('vertical');
      if (e.altKey && e.key === '-') switchSplit('horizontal');
    });
    if (commandPaletteInput) {
      commandPaletteInput.addEventListener('input', () => {
        setCommandPaletteSelection(0);
        renderCommandPalette();
      });
      commandPaletteInput.addEventListener('keydown', (e) => {
        const commands = getFilteredCommands();
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setCommandPaletteSelection(Math.min(commands.length - 1, getCommandPaletteSelection() + 1));
          renderCommandPalette();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setCommandPaletteSelection(Math.max(0, getCommandPaletteSelection() - 1));
          renderCommandPalette();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (commands[getCommandPaletteSelection()]) runCommandFromPalette(commands[getCommandPaletteSelection()].id);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeCommandPalette();
        }
      });
    }
    if (commandPaletteDialog) {
      commandPaletteDialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        closeCommandPalette();
      });
      commandPaletteDialog.addEventListener('click', (e) => {
        if (e.target === commandPaletteDialog) closeCommandPalette();
      });
    }
    if (commandPaletteCloseBtn) commandPaletteCloseBtn.onclick = closeCommandPalette;

    document.addEventListener('click', (e) => {
      if (window.innerWidth > MOBILE_MINI_BREAKPOINT) return;
      const sidebar = $('sidebar');
      const statsPanel = document.querySelector('.stats-panel');
      const showTreeBarBtn = $('show-tree-bar');
      const showCalendarBarBtn = $('show-calendar-bar');
      const sidebarToolbar = $('toggle-sidebar-toolbar-btn');
      const calendarToolbar = $('toggle-calendar-toolbar-btn');
      if (sidebar && sidebar.contains(e.target)) return;
      if (statsPanel && statsPanel.contains(e.target)) return;
      if (showTreeBarBtn && showTreeBarBtn.contains(e.target)) return;
      if (showCalendarBarBtn && showCalendarBarBtn.contains(e.target)) return;
      if (sidebarToolbar && sidebarToolbar.contains(e.target)) return;
      if (calendarToolbar && calendarToolbar.contains(e.target)) return;
      const mobile = getMobileMiniState();
      if (!mobile.sidebarOpen && !mobile.calendarOpen) return;
      setMobileMiniState({ sidebarOpen: false, calendarOpen: false });
      applyAppLayout();
    });
  }

  return { bindUiEvents };
}));
