(function initDialogService(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DialogService = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function createDialogApi(options = {}) {
    const getById = typeof options.getById === 'function'
      ? options.getById
      : () => null;

    let confirmDialogResolver = null;
    let inputDialogResolver = null;
    let noticeDialogResolver = null;
    let choiceDialogResolver = null;

    function closeDialogSafe(dialog) {
      if (!dialog || typeof dialog.close !== 'function') return;
      if (dialog.open) dialog.close();
    }

    function settleDialogResolver(kind, value) {
      if (kind === 'confirm' && confirmDialogResolver) {
        const resolve = confirmDialogResolver;
        confirmDialogResolver = null;
        resolve(!!value);
        return;
      }
      if (kind === 'input' && inputDialogResolver) {
        const resolve = inputDialogResolver;
        inputDialogResolver = null;
        resolve(value);
        return;
      }
      if (kind === 'notice' && noticeDialogResolver) {
        const resolve = noticeDialogResolver;
        noticeDialogResolver = null;
        resolve();
        return;
      }
      if (kind === 'choice' && choiceDialogResolver) {
        const resolve = choiceDialogResolver;
        choiceDialogResolver = null;
        resolve(value || 'cancel');
      }
    }

    async function confirm(options = {}) {
      const dialog = getById('confirm-dialog');
      const title = getById('confirm-dialog-title');
      const message = getById('confirm-dialog-message');
      const cancelBtn = getById('confirm-dialog-cancel-btn');
      const confirmBtn = getById('confirm-dialog-confirm-btn');
      if (!dialog || !cancelBtn || !confirmBtn || typeof dialog.showModal !== 'function') {
        return false;
      }
      if (title) title.textContent = options.title || '확인';
      if (message) message.textContent = options.message || '';
      cancelBtn.textContent = options.cancelText || '취소';
      confirmBtn.textContent = options.confirmText || '확인';
      confirmBtn.classList.toggle('danger-btn', !!options.danger);
      cancelBtn.onclick = () => {
        settleDialogResolver('confirm', false);
        closeDialogSafe(dialog);
      };
      confirmBtn.onclick = () => {
        settleDialogResolver('confirm', true);
        closeDialogSafe(dialog);
      };
      dialog.oncancel = () => {
        settleDialogResolver('confirm', false);
      };
      if (dialog.open) dialog.close();
      dialog.showModal();
      return new Promise((resolve) => {
        confirmDialogResolver = resolve;
      });
    }

    async function input(options = {}) {
      const dialog = getById('input-dialog');
      const title = getById('input-dialog-title');
      const message = getById('input-dialog-message');
      const inputEl = getById('input-dialog-value');
      const cancelBtn = getById('input-dialog-cancel-btn');
      const confirmBtn = getById('input-dialog-confirm-btn');
      if (!dialog || !inputEl || !cancelBtn || !confirmBtn || typeof dialog.showModal !== 'function') {
        return null;
      }
      if (title) title.textContent = options.title || '입력';
      if (message) message.textContent = options.message || '';
      inputEl.value = options.defaultValue || '';
      inputEl.placeholder = options.placeholder || '';
      cancelBtn.textContent = options.cancelText || '취소';
      confirmBtn.textContent = options.confirmText || '확인';
      cancelBtn.onclick = () => {
        settleDialogResolver('input', null);
        closeDialogSafe(dialog);
      };
      confirmBtn.onclick = () => {
        settleDialogResolver('input', inputEl.value);
        closeDialogSafe(dialog);
      };
      dialog.oncancel = () => {
        settleDialogResolver('input', null);
      };
      if (dialog.open) dialog.close();
      dialog.showModal();
      setTimeout(() => {
        inputEl.focus();
        inputEl.select();
      }, 0);
      return new Promise((resolve) => {
        inputDialogResolver = resolve;
      });
    }

    async function notice(options = {}) {
      const dialog = getById('notice-dialog');
      const title = getById('notice-dialog-title');
      const message = getById('notice-dialog-message');
      const closeBtn = getById('notice-dialog-close-btn');
      if (!dialog || !closeBtn || typeof dialog.showModal !== 'function') return;
      if (title) title.textContent = options.title || '안내';
      if (message) message.textContent = options.message || '';
      closeBtn.textContent = options.closeText || '확인';
      closeBtn.onclick = () => {
        settleDialogResolver('notice');
        closeDialogSafe(dialog);
      };
      dialog.oncancel = () => {
        settleDialogResolver('notice');
      };
      if (dialog.open) dialog.close();
      dialog.showModal();
      return new Promise((resolve) => {
        noticeDialogResolver = resolve;
      });
    }

    async function choice(options = {}) {
      const dialog = getById('choice-dialog');
      const title = getById('choice-dialog-title');
      const message = getById('choice-dialog-message');
      const primaryBtn = getById('choice-dialog-primary-btn');
      const secondaryBtn = getById('choice-dialog-secondary-btn');
      const cancelBtn = getById('choice-dialog-cancel-btn');
      if (
        !dialog
        || !primaryBtn
        || !secondaryBtn
        || !cancelBtn
        || typeof dialog.showModal !== 'function'
      ) {
        return 'cancel';
      }
      const choices = options.choices || {};
      if (title) title.textContent = options.title || '선택';
      if (message) message.textContent = options.message || '';
      primaryBtn.textContent = (choices.primary && choices.primary.label) || '확인';
      secondaryBtn.textContent = (choices.secondary && choices.secondary.label) || '다른 선택';
      cancelBtn.textContent = (choices.cancel && choices.cancel.label) || '취소';
      primaryBtn.onclick = () => {
        settleDialogResolver('choice', (choices.primary && choices.primary.value) || 'primary');
        closeDialogSafe(dialog);
      };
      secondaryBtn.onclick = () => {
        settleDialogResolver('choice', (choices.secondary && choices.secondary.value) || 'secondary');
        closeDialogSafe(dialog);
      };
      cancelBtn.onclick = () => {
        settleDialogResolver('choice', (choices.cancel && choices.cancel.value) || 'cancel');
        closeDialogSafe(dialog);
      };
      dialog.oncancel = () => {
        settleDialogResolver('choice', (choices.cancel && choices.cancel.value) || 'cancel');
      };
      if (dialog.open) dialog.close();
      dialog.showModal();
      return new Promise((resolve) => {
        choiceDialogResolver = resolve;
      });
    }

    return {
      confirm,
      input,
      notice,
      choice,
    };
  }

  return {
    createDialogApi,
  };
}));
