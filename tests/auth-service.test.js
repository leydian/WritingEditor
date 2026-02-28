const assert = require('assert');
const path = require('path');

const authService = require(path.join(__dirname, '..', 'auth-service.js'));

function testIsJwtExpiredError() {
  assert.strictEqual(authService.isJwtExpiredError({ message: 'JWT expired' }), true);
  assert.strictEqual(authService.isJwtExpiredError({ message: 'network error' }), false);
}

async function testEnsureFreshAuthSessionNoRefresh() {
  const supabase = {
    auth: {
      async getSession() {
        return {
          data: {
            session: {
              expires_at: Math.floor((Date.now() + 5 * 60 * 1000) / 1000),
              user: { id: 'u1' },
            },
          },
          error: null,
        };
      },
      async refreshSession() {
        throw new Error('refresh should not be called');
      },
    },
  };
  const result = await authService.ensureFreshAuthSession(supabase);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.user.id, 'u1');
}

async function testEnsureFreshAuthSessionWithRefresh() {
  let refreshed = false;
  const supabase = {
    auth: {
      async getSession() {
        return {
          data: {
            session: {
              expires_at: Math.floor((Date.now() + 5 * 1000) / 1000),
              user: { id: 'u1' },
            },
          },
          error: null,
        };
      },
      async refreshSession() {
        refreshed = true;
        return {
          data: {
            session: {
              expires_at: Math.floor((Date.now() + 10 * 60 * 1000) / 1000),
              user: { id: 'u2' },
            },
          },
          error: null,
        };
      },
    },
  };
  const result = await authService.ensureFreshAuthSession(supabase);
  assert.strictEqual(refreshed, true);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.user.id, 'u2');
}

async function testDeleteHelpers() {
  let deletedUserId = '';
  let rpcName = '';
  const supabase = {
    from() {
      return {
        delete() {
          return {
            eq(_col, value) {
              deletedUserId = value;
              return { error: null };
            },
          };
        },
      };
    },
    rpc(name) {
      rpcName = name;
      return { error: null };
    },
  };
  const a = await authService.deleteRemoteStateImmediately(supabase, 'u9');
  const b = await authService.deleteOwnAccountImmediately(supabase, 'rpc_x');
  assert.strictEqual(a.error, null);
  assert.strictEqual(b.error, null);
  assert.strictEqual(deletedUserId, 'u9');
  assert.strictEqual(rpcName, 'rpc_x');
}

async function testExecuteAccountDeletionFlow() {
  let starts = 0;
  let success = 0;
  let remoteErrors = 0;
  let accountErrors = 0;

  const okFlow = await authService.executeAccountDeletionFlow({
    user: { id: 'u1' },
    deleteRemoteState: async () => ({ error: null }),
    deleteOwnAccount: async () => ({ error: null }),
    ensureFreshSession: async () => ({ ok: true, user: { id: 'u1' } }),
    onStart: () => { starts += 1; },
    onSuccess: async () => { success += 1; },
    onRemoteStateDeleteError: () => { remoteErrors += 1; },
    onDeleteAccountError: () => { accountErrors += 1; },
  });
  assert.strictEqual(okFlow, true);
  assert.strictEqual(starts, 1);
  assert.strictEqual(success, 1);
  assert.strictEqual(remoteErrors, 0);
  assert.strictEqual(accountErrors, 0);

  let triedRefresh = false;
  const jwtErr = { message: 'JWT expired' };
  let remoteCallCount = 0;
  const retryFlow = await authService.executeAccountDeletionFlow({
    user: { id: 'u1' },
    deleteRemoteState: async () => {
      remoteCallCount += 1;
      return remoteCallCount === 1 ? { error: jwtErr } : { error: null };
    },
    deleteOwnAccount: async () => ({ error: null }),
    ensureFreshSession: async () => {
      triedRefresh = true;
      return { ok: true, user: { id: 'u1' } };
    },
    onStart: () => {},
    onSuccess: async () => {},
  });
  assert.strictEqual(retryFlow, true);
  assert.strictEqual(triedRefresh, true);
  assert.strictEqual(remoteCallCount, 2);

  let missingCalled = 0;
  const missing = await authService.executeAccountDeletionFlow({
    user: null,
    deleteRemoteState: async () => ({ error: null }),
    deleteOwnAccount: async () => ({ error: null }),
    ensureFreshSession: async () => ({ ok: true, user: { id: 'x' } }),
    onMissingUser: () => { missingCalled += 1; },
  });
  assert.strictEqual(missing, false);
  assert.strictEqual(missingCalled, 1);
}

async function testResolveWithdrawTargetUser() {
  const resolveIdentifier = (raw) => {
    if (raw === 'bad') return { ok: false, message: 'bad id' };
    return { ok: true, email: `${raw}@id.writingeditor.local` };
  };

  const missingCreds = await authService.resolveWithdrawTargetUser({
    supabase: {},
    supabaseUser: { id: 'u1' },
    requiresCredentialReauth: true,
    inputEmail: '',
    inputPassword: '',
    resolveIdentifier,
  });
  assert.strictEqual(missingCreds.ok, false);
  assert.strictEqual(missingCreds.code, 'missing_credentials');

  const invalidId = await authService.resolveWithdrawTargetUser({
    supabase: {},
    supabaseUser: { id: 'u1' },
    requiresCredentialReauth: true,
    inputEmail: 'bad',
    inputPassword: 'x',
    resolveIdentifier,
  });
  assert.strictEqual(invalidId.ok, false);
  assert.strictEqual(invalidId.code, 'invalid_identifier');

  const reauthFailed = await authService.resolveWithdrawTargetUser({
    supabase: {
      auth: {
        async signInWithPassword() {
          return { error: { message: 'Invalid login credentials' } };
        },
      },
    },
    supabaseUser: { id: 'u1' },
    requiresCredentialReauth: true,
    inputEmail: 'tester',
    inputPassword: 'wrong',
    resolveIdentifier,
  });
  assert.strictEqual(reauthFailed.ok, false);
  assert.strictEqual(reauthFailed.code, 'reauth_failed');
  assert.strictEqual(reauthFailed.reason, 'INVALID_CREDENTIALS');

  let signedOut = false;
  const mismatchSupabase = {
    auth: {
      async signInWithPassword() { return { error: null }; },
      async getSession() {
        return { data: { session: { user: { id: 'u1', email: 'other@id.writingeditor.local' } } }, error: null };
      },
      async signOut() { signedOut = true; return { error: null }; },
    },
  };
  const mismatch = await authService.resolveWithdrawTargetUser({
    supabase: mismatchSupabase,
    supabaseUser: { id: 'u1' },
    requiresCredentialReauth: true,
    inputEmail: 'tester',
    inputPassword: 'pw',
    resolveIdentifier,
    ensureFreshSessionFn: async () => ({ ok: true, user: { id: 'u1' } }),
  });
  assert.strictEqual(mismatch.ok, false);
  assert.strictEqual(mismatch.code, 'account_mismatch');
  assert.strictEqual(signedOut, true);

  const okSupabase = {
    auth: {
      async signInWithPassword() { return { error: null }; },
      async getSession() {
        return { data: { session: { user: { id: 'u1', email: 'tester@id.writingeditor.local' } } }, error: null };
      },
      async signOut() { return { error: null }; },
    },
  };
  const ok = await authService.resolveWithdrawTargetUser({
    supabase: okSupabase,
    supabaseUser: { id: 'u1' },
    requiresCredentialReauth: true,
    inputEmail: 'tester',
    inputPassword: 'pw',
    resolveIdentifier,
    ensureFreshSessionFn: async () => ({ ok: true, user: { id: 'u1' } }),
  });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.user.id, 'u1');

  const anonExpired = await authService.resolveWithdrawTargetUser({
    supabase: {},
    supabaseUser: null,
    requiresCredentialReauth: false,
  });
  assert.strictEqual(anonExpired.ok, false);
  assert.strictEqual(anonExpired.code, 'anonymous_session_expired');
}

async function testSignUpAndLoginWithIdentifier() {
  const resolveIdentifier = (raw) => {
    if (raw === 'bad') return { ok: false, message: 'bad id' };
    return { ok: true, email: `${raw}@id.writingeditor.local`, username: raw };
  };
  const supabase = {
    auth: {
      async signUp(payload) {
        if (payload.email.startsWith('fail')) return { error: { message: 'signup failed' } };
        return { error: null };
      },
      async signInWithPassword({ email }) {
        if (email.startsWith('fail')) return { error: { message: 'login failed' } };
        return { error: null };
      },
    },
  };

  const badSignup = await authService.signUpWithIdentifier({
    supabase,
    idRaw: 'bad',
    password: 'pw',
    resolveIdentifier,
  });
  assert.strictEqual(badSignup.ok, false);
  assert.strictEqual(badSignup.code, 'invalid_identifier');

  const okSignup = await authService.signUpWithIdentifier({
    supabase,
    idRaw: 'tester',
    password: 'pw',
    resolveIdentifier,
  });
  assert.strictEqual(okSignup.ok, true);

  const failSignup = await authService.signUpWithIdentifier({
    supabase,
    idRaw: 'fail-user',
    password: 'pw',
    resolveIdentifier,
  });
  assert.strictEqual(failSignup.ok, false);
  assert.strictEqual(failSignup.code, 'signup_error');
  assert.strictEqual(failSignup.reason, 'UNKNOWN');

  const duplicateSignup = await authService.signUpWithIdentifier({
    supabase: {
      auth: {
        async signUp() {
          return { error: { message: 'User already registered' } };
        },
      },
    },
    idRaw: 'tester',
    password: 'pw',
    resolveIdentifier,
  });
  assert.strictEqual(duplicateSignup.ok, false);
  assert.strictEqual(duplicateSignup.reason, 'IDENTIFIER_TAKEN');

  const badLogin = await authService.loginWithIdentifier({
    supabase,
    idRaw: 'bad',
    password: 'pw',
    resolveIdentifier,
  });
  assert.strictEqual(badLogin.ok, false);
  assert.strictEqual(badLogin.code, 'invalid_identifier');

  const okLogin = await authService.loginWithIdentifier({
    supabase,
    idRaw: 'tester',
    password: 'pw',
    resolveIdentifier,
  });
  assert.strictEqual(okLogin.ok, true);

  const failLogin = await authService.loginWithIdentifier({
    supabase,
    idRaw: 'fail-user',
    password: 'pw',
    resolveIdentifier,
  });
  assert.strictEqual(failLogin.ok, false);
  assert.strictEqual(failLogin.code, 'login_error');
  assert.strictEqual(failLogin.reason, 'UNKNOWN');

  const badCredentialLogin = await authService.loginWithIdentifier({
    supabase: {
      auth: {
        async signInWithPassword() {
          return { error: { message: 'Invalid login credentials' } };
        },
      },
    },
    idRaw: 'tester',
    password: 'pw',
    resolveIdentifier,
  });
  assert.strictEqual(badCredentialLogin.ok, false);
  assert.strictEqual(badCredentialLogin.reason, 'INVALID_CREDENTIALS');
}

async function testUpgradeAnonymousAccount() {
  const resolveIdentifier = (raw) => ({ ok: true, email: `${raw}@id.writingeditor.local`, username: raw });
  const isAnonymousUser = () => true;
  let beforeAutoSignIn = 0;

  const supabase = {
    auth: {
      async updateUser() { return { error: null }; },
      async signInWithPassword() { return { error: null }; },
    },
  };

  const ok = await authService.upgradeAnonymousAccount({
    supabase,
    supabaseUser: { id: 'u1' },
    isAnonymousUser,
    idRaw: 'tester',
    password: 'pw',
    resolveIdentifier,
    onBeforeAutoSignIn: () => { beforeAutoSignIn += 1; },
  });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.code, 'ok');
  assert.strictEqual(beforeAutoSignIn, 1);

  const missing = await authService.upgradeAnonymousAccount({
    supabase,
    supabaseUser: { id: 'u1' },
    isAnonymousUser,
    idRaw: '',
    password: '',
    resolveIdentifier,
  });
  assert.strictEqual(missing.ok, false);
  assert.strictEqual(missing.code, 'missing_inputs');

  const updateFail = await authService.upgradeAnonymousAccount({
    supabase: {
      auth: {
        async updateUser() { return { error: { message: 'update failed' } }; },
        async signInWithPassword() { return { error: null }; },
      },
    },
    supabaseUser: { id: 'u1' },
    isAnonymousUser,
    idRaw: 'tester',
    password: 'pw',
    resolveIdentifier,
  });
  assert.strictEqual(updateFail.ok, false);
  assert.strictEqual(updateFail.code, 'update_error');
  assert.strictEqual(updateFail.reason, 'UNKNOWN');

  const autoSigninLimited = await authService.upgradeAnonymousAccount({
    supabase: {
      auth: {
        async updateUser() { return { error: null }; },
        async signInWithPassword() { return { error: { message: 'Email not confirmed' } }; },
      },
    },
    supabaseUser: { id: 'u1' },
    isAnonymousUser,
    idRaw: 'tester',
    password: 'pw',
    resolveIdentifier,
  });
  assert.strictEqual(autoSigninLimited.ok, false);
  assert.strictEqual(autoSigninLimited.code, 'auto_signin_limited');
}

async function testAnonymousLogin() {
  const notInit = await authService.anonymousLogin(null);
  assert.strictEqual(notInit.ok, false);
  assert.strictEqual(notInit.code, 'not_initialized');

  const unsupported = await authService.anonymousLogin({ auth: {} });
  assert.strictEqual(unsupported.ok, false);
  assert.strictEqual(unsupported.code, 'unsupported_anonymous');

  const failed = await authService.anonymousLogin({
    auth: {
      async signInAnonymously() { return { error: { message: 'failed' } }; },
    },
  });
  assert.strictEqual(failed.ok, false);
  assert.strictEqual(failed.code, 'login_error');
  assert.strictEqual(failed.reason, 'UNKNOWN');

  const ok = await authService.anonymousLogin({
    auth: {
      async signInAnonymously() { return { error: null }; },
    },
  });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.code, 'ok');
}

async function run() {
  testIsJwtExpiredError();
  await testEnsureFreshAuthSessionNoRefresh();
  await testEnsureFreshAuthSessionWithRefresh();
  await testDeleteHelpers();
  await testExecuteAccountDeletionFlow();
  await testResolveWithdrawTargetUser();
  await testSignUpAndLoginWithIdentifier();
  await testUpgradeAnonymousAccount();
  await testAnonymousLogin();
  console.log('auth-service tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
