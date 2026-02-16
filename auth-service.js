(function initAuthService(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AuthService = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function isJwtExpiredError(errorLike) {
    const msg = String((errorLike && errorLike.message) || errorLike || '').toLowerCase();
    return msg.includes('jwt') && msg.includes('expired');
  }

  async function ensureFreshAuthSession(supabase) {
    if (!supabase || !supabase.auth || typeof supabase.auth.getSession !== 'function') {
      return { ok: false, message: '세션 확인 기능을 사용할 수 없습니다.' };
    }

    const sessionResult = await supabase.auth.getSession();
    if (sessionResult && sessionResult.error) {
      return { ok: false, message: sessionResult.error.message || '세션 확인 실패' };
    }

    let session = sessionResult && sessionResult.data ? sessionResult.data.session : null;
    if (!session) return { ok: false, message: '로그인 세션이 없습니다.' };

    const expiresAtSec = Number(session.expires_at || 0);
    const shouldRefresh = !expiresAtSec || ((expiresAtSec * 1000) - Date.now() < 60 * 1000);
    if (shouldRefresh && typeof supabase.auth.refreshSession === 'function') {
      const refreshResult = await supabase.auth.refreshSession();
      if (refreshResult && refreshResult.error) {
        return { ok: false, message: refreshResult.error.message || '세션 갱신 실패' };
      }
      session = refreshResult && refreshResult.data ? refreshResult.data.session : session;
    }

    const user = session && session.user ? session.user : null;
    if (!user || !user.id) return { ok: false, message: '세션 사용자 확인 실패' };
    return { ok: true, user };
  }

  async function deleteRemoteStateImmediately(supabase, userId) {
    if (!supabase || !userId) return { error: { message: '삭제 대상 사용자 정보가 없습니다.' } };
    return supabase.from('editor_states').delete().eq('user_id', userId);
  }

  async function deleteOwnAccountImmediately(supabase, rpcName = 'delete_my_account_rpc_v3') {
    if (!supabase || typeof supabase.rpc !== 'function') {
      return { error: { message: '계정 삭제 RPC를 사용할 수 없습니다.' } };
    }
    return supabase.rpc(rpcName);
  }

  async function executeAccountDeletionFlow(options) {
    const {
      user,
      deleteRemoteState,
      deleteOwnAccount,
      ensureFreshSession,
      isJwtExpiredErrorFn = isJwtExpiredError,
      onMissingUser,
      onStart,
      onRemoteStateDeleteError,
      onDeleteAccountError,
      onSuccess,
    } = options || {};

    if (!user || !user.id) {
      if (typeof onMissingUser === 'function') onMissingUser();
      return false;
    }

    if (typeof onStart === 'function') onStart();

    let deletedState = await deleteRemoteState(user.id);
    if (deletedState && deletedState.error && isJwtExpiredErrorFn(deletedState.error)) {
      const fresh = await ensureFreshSession();
      if (fresh && fresh.ok) deletedState = await deleteRemoteState(user.id);
    }
    if (deletedState && deletedState.error) {
      if (typeof onRemoteStateDeleteError === 'function') onRemoteStateDeleteError(deletedState.error);
      return false;
    }

    let deletedAccount = await deleteOwnAccount();
    if (deletedAccount && deletedAccount.error && isJwtExpiredErrorFn(deletedAccount.error)) {
      const fresh = await ensureFreshSession();
      if (fresh && fresh.ok) deletedAccount = await deleteOwnAccount();
    }
    if (deletedAccount && deletedAccount.error) {
      if (typeof onDeleteAccountError === 'function') onDeleteAccountError(deletedAccount.error);
      return false;
    }

    if (typeof onSuccess === 'function') await onSuccess();
    return true;
  }

  async function resolveWithdrawTargetUser(options = {}) {
    const {
      supabase,
      supabaseUser,
      requiresCredentialReauth,
      inputEmail,
      inputPassword,
      resolveIdentifier,
      ensureFreshSessionFn = ensureFreshAuthSession,
    } = options;

    let confirmedUser = supabaseUser || null;
    if (requiresCredentialReauth) {
      if (!inputEmail || !inputPassword) {
        return { ok: false, code: 'missing_credentials' };
      }
      if (typeof resolveIdentifier !== 'function') {
        return { ok: false, code: 'invalid_identifier', message: '계정 식별자를 해석할 수 없습니다.' };
      }
      const resolved = resolveIdentifier(inputEmail);
      if (!resolved || !resolved.ok) {
        return { ok: false, code: 'invalid_identifier', message: resolved && resolved.message ? resolved.message : '' };
      }
      const signInResult = await supabase.auth.signInWithPassword({ email: resolved.email, password: inputPassword });
      if (signInResult && signInResult.error) {
        return { ok: false, code: 'reauth_failed', error: signInResult.error };
      }

      const sessionResult = await supabase.auth.getSession();
      confirmedUser = sessionResult && sessionResult.data && sessionResult.data.session
        ? sessionResult.data.session.user
        : null;
      if (!confirmedUser || !confirmedUser.id) {
        return { ok: false, code: 'user_missing_after_reauth' };
      }
      const confirmedEmail = String(confirmedUser.email || '').trim().toLowerCase();
      if (confirmedEmail && confirmedEmail !== resolved.email.toLowerCase()) {
        await supabase.auth.signOut();
        return { ok: false, code: 'account_mismatch' };
      }

      const fresh = await ensureFreshSessionFn(supabase);
      if (!fresh.ok) {
        return { ok: false, code: 'refresh_failed', message: fresh.message };
      }
      confirmedUser = fresh.user;
    } else if (!confirmedUser || !confirmedUser.id) {
      return { ok: false, code: 'anonymous_session_expired' };
    }

    return { ok: true, user: confirmedUser };
  }

  async function signUpWithIdentifier(options = {}) {
    const { supabase, idRaw, password, resolveIdentifier } = options;
    if (!supabase || !supabase.auth || typeof supabase.auth.signUp !== 'function') {
      return { ok: false, code: 'not_initialized' };
    }
    const resolved = resolveIdentifier(String(idRaw || '').trim());
    if (!resolved || !resolved.ok) {
      return { ok: false, code: 'invalid_identifier', message: resolved && resolved.message ? resolved.message : '' };
    }
    const payload = resolved.username
      ? { email: resolved.email, password, options: { data: { username: resolved.username } } }
      : { email: resolved.email, password };
    const { error } = await supabase.auth.signUp(payload);
    if (error) return { ok: false, code: 'signup_error', error };
    return { ok: true, code: 'ok' };
  }

  async function loginWithIdentifier(options = {}) {
    const { supabase, idRaw, password, resolveIdentifier } = options;
    if (!supabase || !supabase.auth || typeof supabase.auth.signInWithPassword !== 'function') {
      return { ok: false, code: 'not_initialized' };
    }
    const resolved = resolveIdentifier(String(idRaw || '').trim());
    if (!resolved || !resolved.ok) {
      return { ok: false, code: 'invalid_identifier', message: resolved && resolved.message ? resolved.message : '' };
    }
    const { error } = await supabase.auth.signInWithPassword({ email: resolved.email, password });
    if (error) return { ok: false, code: 'login_error', error };
    return { ok: true, code: 'ok' };
  }

  async function upgradeAnonymousAccount(options = {}) {
    const {
      supabase,
      supabaseUser,
      isAnonymousUser,
      idRaw,
      password,
      resolveIdentifier,
      onBeforeAutoSignIn,
    } = options;

    if (!supabase || !supabaseUser || typeof isAnonymousUser !== 'function' || !isAnonymousUser(supabaseUser)) {
      return { ok: false, code: 'not_eligible' };
    }
    if (!idRaw || !password) {
      return { ok: false, code: 'missing_inputs' };
    }
    const resolved = resolveIdentifier(String(idRaw || '').trim());
    if (!resolved || !resolved.ok) {
      return { ok: false, code: 'invalid_identifier', message: resolved && resolved.message ? resolved.message : '' };
    }
    if (!supabase.auth || typeof supabase.auth.updateUser !== 'function') {
      return { ok: false, code: 'unsupported_client' };
    }

    const { error } = await supabase.auth.updateUser({
      email: resolved.email,
      password,
      data: resolved.username ? { username: resolved.username } : undefined,
    });
    if (error) return { ok: false, code: 'update_error', error };

    if (typeof onBeforeAutoSignIn === 'function') onBeforeAutoSignIn({ password, resolved });
    const signInResult = await supabase.auth.signInWithPassword({ email: resolved.email, password });
    if (!signInResult || !signInResult.error) return { ok: true, code: 'ok', closeDialog: true };

    const msg = String(signInResult.error.message || '').toLowerCase();
    if (msg.includes('confirm') || msg.includes('verified')) {
      return { ok: false, code: 'auto_signin_limited', closeDialog: true };
    }
    return { ok: false, code: 'auto_signin_error', error: signInResult.error, closeDialog: true };
  }

  async function anonymousLogin(supabase) {
    if (!supabase || !supabase.auth) {
      return { ok: false, code: 'not_initialized' };
    }
    if (typeof supabase.auth.signInAnonymously !== 'function') {
      return { ok: false, code: 'unsupported_anonymous' };
    }
    const { error } = await supabase.auth.signInAnonymously();
    if (error) return { ok: false, code: 'login_error', error };
    return { ok: true, code: 'ok' };
  }

  return {
    isJwtExpiredError,
    ensureFreshAuthSession,
    deleteRemoteStateImmediately,
    deleteOwnAccountImmediately,
    executeAccountDeletionFlow,
    resolveWithdrawTargetUser,
    signUpWithIdentifier,
    loginWithIdentifier,
    upgradeAnonymousAccount,
    anonymousLogin,
  };
}));
