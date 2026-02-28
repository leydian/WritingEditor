const assert = require('assert');
const path = require('path');

const sessionFlowService = require(path.join(__dirname, '..', 'session-flow-service.js'));

function createElements() {
  return {
    'auth-email': { value: 'tester' },
    'auth-password': { value: 'pw' },
    'upgrade-dialog': { showModal() {}, close() {} },
    'upgrade-email': { value: '' },
    'upgrade-password': { value: '' },
    'withdraw-dialog': { showModal() {}, close() {} },
    'withdraw-confirm-check': { checked: false },
    'withdraw-confirm-text': { value: '' },
    'withdraw-email': { value: '', classList: { toggle() {} } },
    'withdraw-password': { value: '', classList: { toggle() {} } },
    'withdraw-confirm-btn': { disabled: true },
  };
}

function makeActions(overrides = {}) {
  const els = createElements();
  let pendingAuthPassword = '';
  let showWithdrawOnAuthGate = false;
  const state = {
    authStatus: '',
    syncStatus: '',
    logs: [],
    executeCalled: 0,
    pushed: true,
    signedOut: 0,
  };
  const supabase = {
    auth: {
      async signOut() {
        state.signedOut += 1;
      },
    },
  };
  const authService = {
    async signUpWithIdentifier() {
      return { ok: true };
    },
    async loginWithIdentifier() {
      return { ok: true };
    },
    async anonymousLogin() {
      return { ok: true };
    },
    async upgradeAnonymousAccount() {
      return { ok: true, closeDialog: false };
    },
    async resolveWithdrawTargetUser() {
      return { ok: true, user: { id: 'u1' } };
    },
  };
  const deps = {
    getById: (id) => els[id] || null,
    authService,
    resolveIdentifier: (input) => ({ ok: true, email: `${input}@id.writingeditor.local`, username: input }),
    resolveAuthResultMessage: () => 'mapped',
    isAnonymousUser: (u) => !!(u && u.is_anonymous),
    defaultState: () => ({}),
    replaceState: () => {},
    renderAll: () => {},
    clearLocalEditorData: () => {},
    executeAccountDeletionFlow: async () => { state.executeCalled += 1; },
    flushHistorySnapshots: () => {},
    pushRemoteState: async () => state.pushed,
    setAuthStatus: (msg) => { state.authStatus = msg; },
    setSyncStatus: (msg) => { state.syncStatus = msg; },
    logServiceEvent: (_scope, payload) => { state.logs.push(payload); },
    showUiError: () => {},
    openConfirmDialog: async () => false,
    getSupabase: () => supabase,
    getSupabaseUser: () => ({ id: 'u1', is_anonymous: false }),
    setPendingAuthPassword: (v) => { pendingAuthPassword = v; },
    setShowWithdrawOnAuthGate: (v) => { showWithdrawOnAuthGate = !!v; },
    getShowWithdrawOnAuthGate: () => showWithdrawOnAuthGate,
    getEnsureFreshAuthSession: () => async () => ({ ok: true, user: { id: 'u1' } }),
    closeUpgradeDialog: () => {},
    closeWithdrawDialog: () => {},
    getWithDrawConfirmText: () => '회원탈퇴',
  };
  Object.assign(deps, overrides);
  return {
    actions: sessionFlowService.createSessionFlowActions(deps),
    state,
    els,
    getPendingAuthPassword: () => pendingAuthPassword,
    getShowWithdrawOnAuthGate: () => showWithdrawOnAuthGate,
  };
}

async function testAuthLoginFailureClearsPending() {
  const ctx = makeActions({
    authService: {
      async loginWithIdentifier() {
        return { ok: false, code: 'login_error', reason: 'INVALID_CREDENTIALS' };
      },
    },
  });
  await ctx.actions.authLogin();
  assert.strictEqual(ctx.getPendingAuthPassword(), '');
  assert.strictEqual(ctx.state.authStatus, 'mapped');
}

async function testAuthLogoutCancelOnUnsynced() {
  const ctx = makeActions({
    pushRemoteState: async () => false,
    openConfirmDialog: async () => false,
  });
  await ctx.actions.authLogout();
  assert.strictEqual(ctx.state.authStatus, '로그아웃을 취소했습니다. 동기화 후 다시 시도하세요.');
  assert.strictEqual(ctx.state.signedOut, 0);
}

async function testAuthLogoutProceedOnUnsynced() {
  const ctx = makeActions({
    pushRemoteState: async () => false,
    openConfirmDialog: async () => true,
  });
  await ctx.actions.authLogout();
  assert.strictEqual(ctx.getShowWithdrawOnAuthGate(), true);
  assert.strictEqual(ctx.state.signedOut, 1);
}

function testUpdateWithdrawConfirmState() {
  const ctx = makeActions({
    getSupabaseUser: () => ({ id: 'u1', is_anonymous: false }),
  });
  ctx.els['withdraw-confirm-check'].checked = true;
  ctx.els['withdraw-confirm-text'].value = '회원탈퇴';
  ctx.els['withdraw-email'].value = 'tester';
  ctx.els['withdraw-password'].value = 'pw';
  ctx.actions.updateWithdrawConfirmState();
  assert.strictEqual(ctx.els['withdraw-confirm-btn'].disabled, false);
}

async function testAuthWithdrawSuccess() {
  const ctx = makeActions();
  ctx.els['withdraw-email'].value = 'tester';
  ctx.els['withdraw-password'].value = 'pw';
  await ctx.actions.authWithdraw();
  assert.strictEqual(ctx.state.executeCalled, 1);
}

async function run() {
  await testAuthLoginFailureClearsPending();
  await testAuthLogoutCancelOnUnsynced();
  await testAuthLogoutProceedOnUnsynced();
  testUpdateWithdrawConfirmState();
  await testAuthWithdrawSuccess();
  console.log('session-flow-service tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
