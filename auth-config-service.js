(function initAuthConfigService(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AuthConfigService = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function resolveConfigForSave(options = {}) {
    const { urlInputValue, anonInputValue, embeddedConfig } = options;
    const url = String(urlInputValue || '').trim() || String((embeddedConfig && embeddedConfig.url) || '').trim();
    const anon = String(anonInputValue || '').trim() || String((embeddedConfig && embeddedConfig.anon) || '').trim();
    if (!url || !anon) {
      return { ok: false, code: 'missing_config' };
    }
    return { ok: true, url, anon };
  }

  async function setupSupabaseRuntime(options = {}) {
    const {
      config,
      persistConfig,
      ensureSdkLoaded,
      sdkCreateClient,
      createCompatClient,
      sdkErrorMessage,
      previousAuthSubscription,
      onSignedIn,
      onSignedOut,
    } = options;

    if (!config || !config.url || !config.anon) {
      return {
        ok: false,
        code: 'missing_config',
        message: 'Supabase 설정이 없습니다. 관리자 설정 주입 또는 설정 저장을 완료하세요.',
      };
    }

    if (typeof persistConfig === 'function') {
      const saved = persistConfig(config.url, config.anon);
      if (saved === false) {
        return {
          ok: false,
          code: 'persist_failed',
          message: 'Supabase 설정 저장에 실패했습니다.',
        };
      }
    }

    const sdkReady = await ensureSdkLoaded();
    let supabase = null;
    let statusMessage = '';
    if (sdkReady && typeof sdkCreateClient === 'function') {
      try {
        supabase = sdkCreateClient(config.url, config.anon);
      } catch (error) {
        const msg = error && error.message ? error.message : '알 수 없는 오류';
        return {
          ok: false,
          code: 'client_create_failed',
          message: `클라이언트 생성 실패: ${msg}`,
        };
      }
    } else {
      supabase = createCompatClient(config.url, config.anon);
      statusMessage = `SDK 차단 감지: 대체 모드 사용 중 (${sdkErrorMessage || 'fetch'})`;
    }

    if (previousAuthSubscription && typeof previousAuthSubscription.unsubscribe === 'function') {
      previousAuthSubscription.unsubscribe();
    }

    let sessionResult = null;
    try {
      sessionResult = await supabase.auth.getSession();
    } catch (error) {
      const msg = error && error.message ? error.message : '알 수 없는 오류';
      return {
        ok: false,
        code: 'session_fetch_failed',
        message: `세션 조회 실패: ${msg}`,
      };
    }

    const { data, error } = sessionResult || {};
    if (error) {
      return {
        ok: false,
        code: 'session_error',
        message: error.message || '세션 조회 실패',
      };
    }

    let authSubscription = null;
    let authHookErrorMessage = '';
    try {
      const { data: authData } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session && session.user) onSignedIn(session.user);
        else onSignedOut();
      });
      authSubscription = authData && authData.subscription ? authData.subscription : null;
    } catch (hookError) {
      const msg = hookError && hookError.message ? hookError.message : '알 수 없는 오류';
      authHookErrorMessage = `인증 이벤트 등록 실패: ${msg}`;
      authSubscription = null;
    }

    if (data && data.session && data.session.user) await onSignedIn(data.session.user);
    else onSignedOut();

    return {
      ok: true,
      code: 'ok',
      supabase,
      authSubscription,
      statusMessage,
      authHookErrorMessage,
    };
  }

  return {
    resolveConfigForSave,
    setupSupabaseRuntime,
  };
}));
