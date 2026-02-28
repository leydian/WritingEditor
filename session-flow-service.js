(function initSessionFlowService(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SessionFlowService = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function createSessionFlowActions(deps = {}) {
    const {
      getById,
      authService,
      resolveIdentifier,
      resolveAuthResultMessage,
      isAnonymousUser,
      defaultState,
      replaceState,
      renderAll,
      clearLocalEditorData,
      executeAccountDeletionFlow,
      flushHistorySnapshots,
      pushRemoteState,
      setAuthStatus,
      setSyncStatus,
      logServiceEvent,
      showUiError,
      openConfirmDialog,
      getSupabase,
      getSupabaseUser,
      setPendingAuthPassword,
      setShowWithdrawOnAuthGate,
      getShowWithdrawOnAuthGate,
      getEnsureFreshAuthSession,
      closeUpgradeDialog,
      closeWithdrawDialog,
      getWithDrawConfirmText,
    } = deps;

    function requireSupabaseConfig() {
      const supabase = getSupabase();
      if (!supabase) {
        setAuthStatus('먼저 설정 저장을 눌러 Supabase 연결을 초기화하세요.');
        return null;
      }
      return supabase;
    }

    async function authSignUp() {
      if (!authService || typeof authService.signUpWithIdentifier !== 'function') {
        setAuthStatus('회원가입 기능을 초기화하지 못했습니다. 새로고침 후 다시 시도하세요.');
        return;
      }
      const supabase = requireSupabaseConfig();
      if (!supabase) return;
      const idRaw = getById('auth-email').value.trim();
      const password = getById('auth-password').value;
      const result = await authService.signUpWithIdentifier({
        supabase,
        idRaw,
        password,
        resolveIdentifier,
      });
      if (!result.ok) {
        logServiceEvent('auth.signup.failed', { code: result.code });
        if (result.code === 'invalid_identifier') {
          setAuthStatus(result.message || '아이디 형식을 확인하세요.');
          return;
        }
        if (result.code === 'signup_error') {
          setAuthStatus(resolveAuthResultMessage('signup', result));
          return;
        }
        setAuthStatus('회원가입 기능을 사용할 수 없습니다. 설정을 확인하세요.');
        return;
      }
      setAuthStatus('회원가입 요청 완료. 아이디로 로그인할 수 있습니다.');
    }

    async function authLogin() {
      if (!authService || typeof authService.loginWithIdentifier !== 'function') {
        setAuthStatus('로그인 기능을 초기화하지 못했습니다. 새로고침 후 다시 시도하세요.');
        return;
      }
      const supabase = requireSupabaseConfig();
      if (!supabase) return;
      const idRaw = getById('auth-email').value.trim();
      const password = getById('auth-password').value;
      setPendingAuthPassword(password || '');
      const result = await authService.loginWithIdentifier({
        supabase,
        idRaw,
        password,
        resolveIdentifier,
      });
      if (!result.ok) {
        logServiceEvent('auth.login.failed', { code: result.code });
        setPendingAuthPassword('');
        if (result.code === 'invalid_identifier') {
          setAuthStatus(result.message || '아이디 형식을 확인하세요.');
          return;
        }
        if (result.code === 'login_error') {
          setAuthStatus(resolveAuthResultMessage('login', result));
          return;
        }
        setAuthStatus('로그인 기능을 사용할 수 없습니다. 설정을 확인하세요.');
        return;
      }
      setAuthStatus('로그인 성공');
    }

    async function authAnonymousLogin() {
      if (!authService || typeof authService.anonymousLogin !== 'function') {
        setAuthStatus('익명 로그인 기능을 초기화하지 못했습니다. 새로고침 후 다시 시도하세요.');
        return;
      }
      const supabase = getSupabase();
      setPendingAuthPassword('');
      const result = await authService.anonymousLogin(supabase);
      if (!result.ok) {
        logServiceEvent('auth.anonymous.failed', { code: result.code });
        if (result.code === 'not_initialized') {
          setAuthStatus('익명 로그인 사용 불가: Supabase 연결이 초기화되지 않았습니다.');
          return;
        }
        if (result.code === 'unsupported_anonymous') {
          setAuthStatus('익명 로그인 사용 불가: Supabase Anonymous provider 설정을 확인하세요.');
          return;
        }
        if (result.code === 'login_error') {
          setAuthStatus(`익명 로그인 실패: ${(result.error && result.error.message) || '알 수 없는 오류'}`);
          return;
        }
        setAuthStatus('익명 로그인 실패: 잠시 후 다시 시도하세요.');
        return;
      }
      setAuthStatus('익명 로그인 성공');
    }

    function openUpgradeDialog() {
      const dlg = getById('upgrade-dialog');
      const emailInput = getById('upgrade-email');
      const passwordInput = getById('upgrade-password');
      const supabaseUser = getSupabaseUser();
      if (!dlg || !supabaseUser || !isAnonymousUser(supabaseUser)) return;
      if (emailInput) emailInput.value = '';
      if (passwordInput) passwordInput.value = '';
      if (typeof dlg.showModal === 'function') dlg.showModal();
    }

    function closeUpgradeDialogLocal() {
      const dlg = getById('upgrade-dialog');
      if (!dlg || typeof dlg.close !== 'function') return;
      dlg.close();
    }

    async function upgradeAnonymousAccount() {
      if (!authService || typeof authService.upgradeAnonymousAccount !== 'function') {
        setAuthStatus('계정 전환 기능을 초기화하지 못했습니다. 새로고침 후 다시 시도하세요.');
        return;
      }
      const supabase = getSupabase();
      const supabaseUser = getSupabaseUser();
      const emailInput = getById('upgrade-email');
      const passwordInput = getById('upgrade-password');
      const idRaw = emailInput ? emailInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';
      const result = await authService.upgradeAnonymousAccount({
        supabase,
        supabaseUser,
        isAnonymousUser,
        idRaw,
        password,
        resolveIdentifier,
        onBeforeAutoSignIn: ({ password: nextPassword }) => {
          setPendingAuthPassword(nextPassword || '');
        },
      });
      if (result.closeDialog) closeUpgradeDialogLocal();
      if (result.ok) {
        setAuthStatus('회원가입 완료: 자동 로그인되었습니다.');
        return;
      }
      logServiceEvent('auth.upgrade.failed', { code: result.code });
      setPendingAuthPassword('');
      if (result.code === 'not_eligible') {
        setAuthStatus('익명 로그인 사용자만 회원가입 전환이 가능합니다.');
        return;
      }
      if (result.code === 'missing_inputs') {
        setAuthStatus('아이디와 비밀번호를 입력하세요.');
        return;
      }
      if (result.code === 'invalid_identifier') {
        setAuthStatus(result.message || '아이디 형식을 확인하세요.');
        return;
      }
      if (result.code === 'unsupported_client') {
        setAuthStatus('현재 클라이언트에서 계정 전환을 지원하지 않습니다.');
        return;
      }
      if (result.code === 'update_error') {
        showUiError('upgrade', result.error, { auth: true, sync: false, logContext: 'account upgrade failed' });
        return;
      }
      if (result.code === 'auto_signin_limited') {
        setAuthStatus('회원가입 전환 완료. 인증 정책으로 즉시 로그인이 제한되었습니다.');
        return;
      }
      if (result.code === 'auto_signin_error') {
        showUiError('upgrade', result.error, { auth: true, sync: false, logContext: 'account upgrade auto sign-in failed' });
        return;
      }
      setAuthStatus('계정 전환에 실패했습니다. 잠시 후 다시 시도하세요.');
    }

    async function authLogout() {
      const supabase = getSupabase();
      if (!supabase) {
        setAuthStatus('현재 로그인 세션이 없습니다.');
        return;
      }
      const supabaseUser = getSupabaseUser();
      if (supabaseUser && isAnonymousUser(supabaseUser)) {
        replaceState(defaultState());
        renderAll();
        clearLocalEditorData();
        await executeAccountDeletionFlow(supabaseUser, {
          successMessage: '익명 계정 로그아웃 완료: 자동 회원탈퇴 및 데이터 영구 삭제가 완료되었습니다.',
          showAlert: false,
        });
        return;
      }

      flushHistorySnapshots('manual-sync', { includeFullSync: true, onlyFullSync: true });
      const synced = await pushRemoteState({ reason: 'logout', allowRetry: false });
      if (!synced) {
        const proceed = await openConfirmDialog({
          title: '로그아웃 확인',
          message: '마지막 동기화에 실패했습니다. 지금 로그아웃하면 최근 변경이 다른 기기에 반영되지 않을 수 있습니다. 그래도 로그아웃할까요?',
          confirmText: '로그아웃',
          cancelText: '취소',
          danger: true,
        });
        if (!proceed) {
          setAuthStatus('로그아웃을 취소했습니다. 동기화 후 다시 시도하세요.');
          return;
        }
      }

      setShowWithdrawOnAuthGate(true);
      await supabase.auth.signOut();
    }

    function openWithdrawDialog() {
      const dlg = getById('withdraw-dialog');
      const check = getById('withdraw-confirm-check');
      const textInput = getById('withdraw-confirm-text');
      const emailInput = getById('withdraw-email');
      const passwordInput = getById('withdraw-password');
      const supabaseUser = getSupabaseUser();
      const requiresCredentialReauth = !(supabaseUser && isAnonymousUser(supabaseUser));
      if (!dlg) return;
      if (check) check.checked = false;
      if (textInput) textInput.value = '';
      if (emailInput) {
        emailInput.value = (getById('auth-email') && getById('auth-email').value ? getById('auth-email').value.trim() : '');
        emailInput.classList.toggle('hidden', !requiresCredentialReauth);
      }
      if (passwordInput) {
        passwordInput.value = '';
        passwordInput.classList.toggle('hidden', !requiresCredentialReauth);
      }
      updateWithdrawConfirmState();
      if (typeof dlg.showModal === 'function') dlg.showModal();
    }

    function closeWithdrawDialogLocal() {
      const dlg = getById('withdraw-dialog');
      if (!dlg || typeof dlg.close !== 'function') return;
      dlg.close();
    }

    function updateWithdrawConfirmState() {
      const confirmBtn = getById('withdraw-confirm-btn');
      const check = getById('withdraw-confirm-check');
      const textInput = getById('withdraw-confirm-text');
      const emailInput = getById('withdraw-email');
      const passwordInput = getById('withdraw-password');
      const supabaseUser = getSupabaseUser();
      const requiresCredentialReauth = !(supabaseUser && isAnonymousUser(supabaseUser));
      if (!confirmBtn || !check || !textInput) return;
      const hasCreds = !requiresCredentialReauth
        || !!(emailInput && passwordInput && emailInput.value.trim() && passwordInput.value);
      const ok = check.checked && textInput.value.trim() === getWithDrawConfirmText() && hasCreds;
      confirmBtn.disabled = !ok;
    }

    async function authWithdraw() {
      const supabase = getSupabase();
      if (!supabase) {
        setAuthStatus('먼저 설정 저장을 눌러 Supabase 연결을 초기화하세요.');
        return;
      }
      if (!authService || typeof authService.resolveWithdrawTargetUser !== 'function') {
        setAuthStatus('탈퇴 확인 기능을 초기화하지 못했습니다. 새로고침 후 다시 시도하세요.');
        setSyncStatus('탈퇴 중단: 인증 서비스 초기화 실패', 'error');
        return;
      }
      const supabaseUser = getSupabaseUser();
      const requiresCredentialReauth = !(supabaseUser && isAnonymousUser(supabaseUser));
      const emailInput = getById('withdraw-email');
      const passwordInput = getById('withdraw-password');
      const inputEmail = emailInput ? emailInput.value.trim() : '';
      const inputPassword = passwordInput ? passwordInput.value : '';
      if (requiresCredentialReauth) setAuthStatus('탈퇴 계정 확인을 위해 재로그인 중...');
      const ensureFreshAuthSession = getEnsureFreshAuthSession();
      const verify = await authService.resolveWithdrawTargetUser({
        supabase,
        supabaseUser,
        requiresCredentialReauth,
        inputEmail,
        inputPassword,
        resolveIdentifier,
        ensureFreshSessionFn: () => ensureFreshAuthSession(),
      });
      if (!verify.ok) {
        if (verify.code === 'missing_credentials') {
          setAuthStatus('회원 탈퇴 전, 아이디/비밀번호로 다시 로그인해 계정을 확인하세요.');
          return;
        }
        if (verify.code === 'invalid_identifier') {
          setAuthStatus(verify.message || '아이디 형식을 확인하세요.');
          setSyncStatus('탈퇴 중단: 계정 확인 실패', 'error');
          return;
        }
        if (verify.code === 'reauth_failed') {
          setAuthStatus(resolveAuthResultMessage('withdraw-reauth', verify));
          setSyncStatus('탈퇴 중단: 계정 확인 실패', 'error');
          return;
        }
        if (verify.code === 'user_missing_after_reauth') {
          setAuthStatus('재로그인은 되었지만 사용자 확인에 실패했습니다.');
          setSyncStatus('탈퇴 중단: 사용자 확인 실패', 'error');
          return;
        }
        if (verify.code === 'account_mismatch') {
          setAuthStatus('입력한 아이디와 로그인된 계정이 다릅니다. 회원 탈퇴를 중단했습니다.');
          setSyncStatus('탈퇴 중단: 계정 불일치', 'error');
          return;
        }
        if (verify.code === 'refresh_failed') {
          setAuthStatus(`재로그인 후 세션 갱신 실패: ${verify.message || '알 수 없는 오류'}`);
          setSyncStatus('탈퇴 중단: 세션 갱신 실패', 'error');
          return;
        }
        if (verify.code === 'anonymous_session_expired') {
          setAuthStatus('익명 세션이 만료되어 탈퇴를 진행할 수 없습니다. 다시 시작해 주세요.');
          setSyncStatus('탈퇴 중단: 세션 만료', 'error');
          return;
        }
        setAuthStatus('탈퇴 계정 확인에 실패했습니다. 잠시 후 다시 시도하세요.');
        setSyncStatus('탈퇴 중단: 계정 확인 실패', 'error');
        return;
      }
      await executeAccountDeletionFlow(verify.user, { showAlert: true });
    }

    return {
      authSignUp,
      authLogin,
      authAnonymousLogin,
      openUpgradeDialog,
      closeUpgradeDialog: closeUpgradeDialogLocal,
      upgradeAnonymousAccount,
      authLogout,
      openWithdrawDialog,
      closeWithdrawDialog: closeWithdrawDialogLocal,
      updateWithdrawConfirmState,
      authWithdraw,
      getShowWithdrawOnAuthGate,
    };
  }

  return {
    createSessionFlowActions,
  };
}));
