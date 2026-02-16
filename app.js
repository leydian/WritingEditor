const $ = (id) => document.getElementById(id);

const KEY = 'we-proto-state-v1';
const SB_KEY = 'we-supabase-config-v1';
const LAYOUT_KEY = 'we-layout-prefs-v1';
const LAST_USER_KEY = 'we-last-user-id';
const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000;
const HISTORY_AUTO_SAVE_MS = 10 * 60 * 1000;
const SUPABASE_SDK_URLS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
  'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js',
];
const MOBILE_MINI_BREAKPOINT = 900;
const WITHDRAW_CONFIRM_TEXT = '회원탈퇴';
const EMBEDDED_SUPABASE_URL = 'https://rvrysnatyimuilarxfft.supabase.co';
const EMBEDDED_SUPABASE_ANON = 'sb_publishable_v_aVOb5bAPP3pr1dF7POBQ_qnxCWVho';

function seoulDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

const todayKey = () => {
  const p = seoulDateParts();
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};

let supabase = null;
let supabaseUser = null;
let authSubscription = null;
let timerRef = null;
let activePane = 'a';
let sidebarWidth = 240;
let calendarWidth = 260;
let autoSyncTimer = null;
let lastSyncAt = 0;
let historyAutoTimer = null;
let hydratingRemoteState = false;
let supabaseSdkPromise = null;
let supabaseSdkError = '';
let showWithdrawOnAuthGate = false;
let mobileMiniSidebarOpen = false;
let mobileMiniCalendarOpen = false;
let calendarViewMode = 'calendar';
const dirtyDocIds = new Set();
const layoutPrefs = loadLayoutPrefs();

const state = loadState();

function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (_error) {
    return null;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (_error) {
    return false;
  }
}

function loadLayoutPrefs() {
  try {
    const raw = JSON.parse(safeGetItem(LAYOUT_KEY) || 'null');
    return {
      showSidebar: !(raw && raw.showSidebar === false),
      showCalendar: !(raw && raw.showCalendar === false),
    };
  } catch (_error) {
    return { showSidebar: true, showCalendar: true };
  }
}

function saveLayoutPrefs() {
  safeSetItem(LAYOUT_KEY, JSON.stringify(layoutPrefs));
}

function defaultState() {
  return {
    docs: [{ id: 'd1', name: '새 문서.txt', folderId: null, content: '' }],
    folders: [],
    activeDocA: 'd1',
    activeDocB: null,
    split: 'single',
    goalByDate: {},
    goalLockedByDate: {},
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
  // Drop deprecated state key from older snapshots.
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

function loadState() {
  try {
    const saved = JSON.parse(safeGetItem(KEY) || 'null');
    return normalizeState(saved);
  } catch (_error) {
    return defaultState();
  }
}

function saveState(options = {}) {
  if (!safeSetItem(KEY, JSON.stringify(state))) {
    setAuthStatus('로컬 저장 실패: 브라우저 저장소를 확인하세요.');
    return;
  }
  if (!options.skipRemote) queueRemoteSync();
}

function saveSupabaseConfig(url, anon) {
  try {
    localStorage.setItem(SB_KEY, JSON.stringify({ url, anon }));
    return true;
  } catch (error) {
    const msg = error && error.message ? error.message : '브라우저 저장소 접근 불가';
    setAuthStatus(`로컬 저장 실패: ${msg}`);
    return false;
  }
}

function clearLocalEditorData() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LAST_USER_KEY);
  } catch (_error) {
    // noop
  }
}

function loadSupabaseConfig() {
  try {
    return JSON.parse(safeGetItem(SB_KEY) || 'null');
  } catch (_error) {
    return null;
  }
}

function getEmbeddedSupabaseConfig() {
  if (!EMBEDDED_SUPABASE_URL || !EMBEDDED_SUPABASE_ANON) return null;
  return { url: EMBEDDED_SUPABASE_URL, anon: EMBEDDED_SUPABASE_ANON };
}

function getEffectiveSupabaseConfig() {
  const saved = loadSupabaseConfig();
  if (saved && saved.url && saved.anon) return saved;
  return getEmbeddedSupabaseConfig();
}

function makeError(message, status = 0) {
  return { message, status };
}

function getErrorUtils() {
  if (typeof globalThis !== 'undefined' && globalThis.ErrorUtils) return globalThis.ErrorUtils;
  return null;
}

function resolveErrorMessage(kind, errorLike) {
  const utils = getErrorUtils();
  if (kind === 'sync') {
    if (utils && typeof utils.buildSyncFailureMessage === 'function') return utils.buildSyncFailureMessage(errorLike);
    return '동기화 실패: 서버 저장에 실패했습니다. 잠시 후 다시 시도하세요.';
  }
  if (kind === 'upgrade') {
    if (utils && typeof utils.buildUpgradeFailureMessage === 'function') return utils.buildUpgradeFailureMessage(errorLike);
    return '계정 전환 실패: 서버 요청이 완료되지 않았습니다. 잠시 후 다시 시도하세요.';
  }
  if (kind === 'withdraw') {
    if (utils && typeof utils.buildWithdrawFailureMessage === 'function') return utils.buildWithdrawFailureMessage(errorLike);
    return '회원 탈퇴 실패: 서버 요청이 완료되지 않았습니다. 잠시 후 다시 시도하세요.';
  }
  return '오류가 발생했습니다. 잠시 후 다시 시도하세요.';
}

function showUiError(kind, errorLike, options = {}) {
  const message = resolveErrorMessage(kind, errorLike);
  if (options.logContext) console.error(options.logContext, errorLike);
  if (options.auth !== false) setAuthStatus(message);
  if (options.sync) setSyncStatus(message, options.syncStatus || 'error');
  return message;
}

function isAnonymousUser(user) {
  if (!user || typeof user !== 'object') return false;
  if (user.is_anonymous === true) return true;
  const provider = user.app_metadata && user.app_metadata.provider;
  return provider === 'anonymous';
}

function createSupabaseCompatClient(url, anon) {
  const listeners = new Set();
  const sessionKey = `${SB_KEY}:session:${url}`;

  const readSession = () => {
    try {
      return JSON.parse(safeGetItem(sessionKey) || 'null');
    } catch (_error) {
      return null;
    }
  };

  const writeSession = (session) => {
    try {
      if (session) safeSetItem(sessionKey, JSON.stringify(session));
      else localStorage.removeItem(sessionKey);
    } catch (_error) {
      // noop
    }
  };

  const notify = (event, session) => {
    listeners.forEach((fn) => {
      try {
        fn(event, session || null);
      } catch (_error) {
        // noop
      }
    });
  };

  const apiHeaders = (withAuth = true) => {
    const session = readSession();
    const headers = {
      apikey: anon,
      'Content-Type': 'application/json',
    };
    headers.Authorization = withAuth && session && session.access_token
      ? `Bearer ${session.access_token}`
      : `Bearer ${anon}`;
    return headers;
  };

  const auth = {
    async signUp({ email, password }) {
      try {
        const res = await fetch(`${url}/auth/v1/signup`, {
          method: 'POST',
          headers: apiHeaders(false),
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { data: null, error: makeError(data.msg || data.message || `HTTP ${res.status}`, res.status) };
        if (data && data.access_token) {
          const session = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in,
            token_type: data.token_type,
            user: data.user,
          };
          writeSession(session);
          notify('SIGNED_IN', session);
        }
        return { data, error: null };
      } catch (error) {
        return { data: null, error: makeError(error && error.message ? error.message : '회원가입 요청 실패') };
      }
    },
    async signInWithPassword({ email, password }) {
      try {
        const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: apiHeaders(false),
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { data: null, error: makeError(data.error_description || data.msg || data.message || `HTTP ${res.status}`, res.status) };
        const session = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_in: data.expires_in,
          token_type: data.token_type,
          user: data.user,
        };
        writeSession(session);
        notify('SIGNED_IN', session);
        return { data: { user: data.user, session }, error: null };
      } catch (error) {
        return { data: null, error: makeError(error && error.message ? error.message : '로그인 요청 실패') };
      }
    },
    async signInAnonymously() {
      try {
        const res = await fetch(`${url}/auth/v1/signup`, {
          method: 'POST',
          headers: apiHeaders(false),
          body: JSON.stringify({ data: { anonymous: true } }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { data: null, error: makeError(data.msg || data.message || `HTTP ${res.status}`, res.status) };
        if (!data || !data.access_token || !data.user) {
          return { data: null, error: makeError('익명 로그인 응답이 올바르지 않습니다.') };
        }
        const session = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_in: data.expires_in,
          token_type: data.token_type,
          user: data.user,
        };
        writeSession(session);
        notify('SIGNED_IN', session);
        return { data: { user: data.user, session }, error: null };
      } catch (error) {
        return { data: null, error: makeError(error && error.message ? error.message : '익명 로그인 요청 실패') };
      }
    },
    async updateUser(payload = {}) {
      try {
        const res = await fetch(`${url}/auth/v1/user`, {
          method: 'PUT',
          headers: apiHeaders(true),
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { data: null, error: makeError(data.msg || data.message || `HTTP ${res.status}`, res.status) };

        const session = readSession();
        if (session && session.user) {
          const nextSession = {
            ...session,
            user: data && data.user ? data.user : session.user,
          };
          writeSession(nextSession);
          notify('USER_UPDATED', nextSession);
        }
        return { data, error: null };
      } catch (error) {
        return { data: null, error: makeError(error && error.message ? error.message : '사용자 업데이트 실패') };
      }
    },
    async signOut() {
      const session = readSession();
      try {
        if (session && session.access_token) {
          await fetch(`${url}/auth/v1/logout`, {
            method: 'POST',
            headers: apiHeaders(true),
          }).catch(() => null);
        }
      } finally {
        writeSession(null);
        notify('SIGNED_OUT', null);
      }
      return { error: null };
    },
    async getSession() {
      const session = readSession();
      return { data: { session: session || null }, error: null };
    },
    onAuthStateChange(callback) {
      listeners.add(callback);
      return {
        data: {
          subscription: {
            unsubscribe() {
              listeners.delete(callback);
            },
          },
        },
      };
    },
  };

  function from(table) {
    return {
      async upsert(payload, options = {}) {
        const onConflict = options && options.onConflict ? `?on_conflict=${encodeURIComponent(options.onConflict)}` : '';
        try {
          const res = await fetch(`${url}/rest/v1/${table}${onConflict}`, {
            method: 'POST',
            headers: {
              ...apiHeaders(true),
              Prefer: 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return { error: makeError(err.message || `HTTP ${res.status}`, res.status) };
          }
          return { error: null };
        } catch (error) {
          return { error: makeError(error && error.message ? error.message : 'upsert 요청 실패') };
        }
      },
      select(columns) {
        const query = {
          column: null,
          value: null,
        };
        return {
          eq(column, value) {
            query.column = column;
            query.value = value;
            return this;
          },
          async maybeSingle() {
            const params = new URLSearchParams();
            params.set('select', columns);
            if (query.column) params.set(query.column, `eq.${query.value}`);
            try {
              const res = await fetch(`${url}/rest/v1/${table}?${params.toString()}`, {
                method: 'GET',
                headers: {
                  ...apiHeaders(true),
                  Accept: 'application/json',
                },
              });
              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                return { data: null, error: makeError(err.message || `HTTP ${res.status}`, res.status) };
              }
              const data = await res.json().catch(() => []);
              if (!Array.isArray(data) || data.length === 0) return { data: null, error: null };
              return { data: data[0], error: null };
            } catch (error) {
              return { data: null, error: makeError(error && error.message ? error.message : '조회 요청 실패') };
            }
          },
        };
      },
      delete() {
        const query = {
          column: null,
          value: null,
        };
        return {
          eq(column, value) {
            query.column = column;
            query.value = value;
            return this;
          },
          async then(resolve, reject) {
            try {
              const params = new URLSearchParams();
              if (query.column) params.set(query.column, `eq.${query.value}`);
              const queryString = params.toString();
              const res = await fetch(`${url}/rest/v1/${table}${queryString ? `?${queryString}` : ''}`, {
                method: 'DELETE',
                headers: {
                  ...apiHeaders(true),
                  Prefer: 'return=minimal',
                },
              });
              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                resolve({ data: null, error: makeError(err.message || `HTTP ${res.status}`, res.status) });
                return;
              }
              resolve({ data: null, error: null });
            } catch (error) {
              resolve({ data: null, error: makeError(error && error.message ? error.message : '삭제 요청 실패') });
            }
          },
        };
      },
    };
  }

  async function rpc(name, args = {}) {
    try {
      const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: apiHeaders(true),
        body: JSON.stringify(args || {}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { data: null, error: makeError(err.message || `HTTP ${res.status}`, res.status) };
      }
      const data = await res.json().catch(() => null);
      return { data, error: null };
    } catch (error) {
      return { data: null, error: makeError(error && error.message ? error.message : 'RPC 요청 실패') };
    }
  }

  return { auth, from, rpc };
}

function loadScriptOnce(src, marker) {
  return new Promise((resolve) => {
    const existing = document.querySelector(`script[data-sdk="${marker}"]`);
    const finish = (ok) => resolve(ok);
    if (existing) {
      if (window.supabase && window.supabase.createClient) {
        finish(true);
        return;
      }
      existing.addEventListener('load', () => finish(!!(window.supabase && window.supabase.createClient)), { once: true });
      existing.addEventListener('error', () => finish(false), { once: true });
      setTimeout(() => finish(!!(window.supabase && window.supabase.createClient)), 12000);
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.sdk = marker;
    script.addEventListener('load', () => finish(!!(window.supabase && window.supabase.createClient)), { once: true });
    script.addEventListener('error', () => finish(false), { once: true });
    document.head.appendChild(script);
    setTimeout(() => finish(!!(window.supabase && window.supabase.createClient)), 12000);
  });
}

function ensureSupabaseSdkLoaded() {
  if (window.supabase && window.supabase.createClient) return Promise.resolve(true);
  if (supabaseSdkPromise) return supabaseSdkPromise;
  supabaseSdkError = '';

  supabaseSdkPromise = (async () => {
    for (let i = 0; i < SUPABASE_SDK_URLS.length; i += 1) {
      const url = SUPABASE_SDK_URLS[i];
      const ok = await loadScriptOnce(url, `supabase-js-${i}`);
      if (ok && window.supabase && window.supabase.createClient) return true;
      supabaseSdkError = `SDK 로드 실패: ${url}`;
    }
    if (window.supabase && !window.supabase.createClient) {
      supabaseSdkError = 'SDK는 로드됐지만 createClient를 찾지 못했습니다.';
    }
    return false;
  })().finally(() => {
    supabaseSdkPromise = null;
  });

  return supabaseSdkPromise;
}

function getDoc(id) {
  return state.docs.find((d) => d.id === id);
}

function replaceState(nextState) {
  const normalized = normalizeState(nextState);
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, normalized);
  dirtyDocIds.clear();
}

function setSyncStatus(message, statusClass = 'idle') {
  const el = $('sync-status');
  if (!el) return;
  el.textContent = message;
  el.dataset.status = statusClass;
}

function setAuthStatus(message) {
  const el = $('auth-status');
  if (!el) return;
  el.textContent = message;
}

function initAuthGateBindings() {
  const saveBtn = $('auth-save-config');
  const signupBtn = $('auth-signup');
  const loginBtn = $('auth-login');
  const anonLoginBtn = $('auth-anon-login');
  if (!saveBtn || !signupBtn || !loginBtn || !anonLoginBtn) return;

  saveBtn.onclick = async (e) => {
    e.preventDefault();
    await saveAuthConfigAndInit();
  };
  signupBtn.onclick = async (e) => {
    e.preventDefault();
    await authSignUp();
  };
  loginBtn.onclick = async (e) => {
    e.preventDefault();
    await authLogin();
  };
  anonLoginBtn.onclick = async (e) => {
    e.preventDefault();
    await authAnonymousLogin();
  };
}

function ensureAuthGateBindings() {
  // Keep auth actions usable even if full app init fails.
  initAuthGateBindings();
}

function queueRemoteSync() {
  if (!supabase || !supabaseUser || hydratingRemoteState) return;
  if (autoSyncTimer) return;

  const elapsed = Date.now() - lastSyncAt;
  const delay = Math.max(0, AUTO_SYNC_INTERVAL_MS - elapsed);
  if (delay > 0) {
    const minutes = Math.ceil(delay / 60000);
    setSyncStatus(`자동 동기화 예약 (${minutes}분 후)`, 'idle');
  }

  autoSyncTimer = setTimeout(async () => {
    autoSyncTimer = null;
    await pushRemoteState();
  }, delay);
}

async function pushRemoteState() {
  if (!supabase || !supabaseUser || hydratingRemoteState) {
    setSyncStatus('로그인 필요', 'idle');
    return false;
  }
  setSyncStatus('클라우드 동기화 중…', 'pending');
  const payload = {
    user_id: supabaseUser.id,
    state_json: JSON.parse(JSON.stringify(state)),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('editor_states').upsert(payload, { onConflict: 'user_id' });
  if (error) {
    showUiError('sync', error, { auth: false, sync: true, logContext: 'sync upsert failed' });
    return false;
  }
  lastSyncAt = Date.now();
  setSyncStatus(`클라우드 동기화 완료 (${new Date().toLocaleTimeString()})`, 'ok');
  return true;
}

async function pullRemoteState() {
  if (!supabase || !supabaseUser) return;

  setSyncStatus('클라우드 데이터 확인 중…', 'pending');
  const { data, error } = await supabase
    .from('editor_states')
    .select('state_json, updated_at')
    .eq('user_id', supabaseUser.id)
    .maybeSingle();

  if (error) {
    showUiError('sync', error, { auth: false, sync: true, logContext: 'sync pull failed' });
    return;
  }

  if (data && data.state_json) {
    hydratingRemoteState = true;
    replaceState(data.state_json);
    saveState({ skipRemote: true });
    hydratingRemoteState = false;
    renderAll();
    safeSetItem(LAST_USER_KEY, String(supabaseUser.id || ''));
    setSyncStatus(`클라우드 상태 불러옴 (${new Date(data.updated_at).toLocaleString()})`, 'ok');
    return;
  }

  const lastUserId = safeGetItem(LAST_USER_KEY);
  if (lastUserId && supabaseUser.id && lastUserId !== supabaseUser.id) {
    // Prevent stale local data from another account being uploaded to a new account.
    replaceState(defaultState());
    saveState({ skipRemote: true });
    renderAll();
  }
  safeSetItem(LAST_USER_KEY, String(supabaseUser.id || ''));
  await pushRemoteState();
}

async function handleSignedIn(user) {
  supabaseUser = user;
  applyAuthState(user);
  await pullRemoteState();
}

function handleSignedOut() {
  supabaseUser = null;
  dirtyDocIds.clear();
  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
    autoSyncTimer = null;
  }
  lastSyncAt = 0;
  setSyncStatus('로그인 필요', 'idle');
  applyAuthState(null);
}

async function setupSupabase() {
  const config = getEffectiveSupabaseConfig();
  if (!config || !config.url || !config.anon) return false;
  saveSupabaseConfig(config.url, config.anon);
  const sdkReady = await ensureSupabaseSdkLoaded();
  if (sdkReady && window.supabase && window.supabase.createClient) {
    try {
      supabase = window.supabase.createClient(config.url, config.anon);
    } catch (error) {
      const msg = error && error.message ? error.message : '알 수 없는 오류';
      setAuthStatus(`클라이언트 생성 실패: ${msg}`);
      return false;
    }
  } else {
    supabase = createSupabaseCompatClient(config.url, config.anon);
    setAuthStatus(`SDK 차단 감지: 대체 모드 사용 중 (${supabaseSdkError || 'fetch'})`);
  }

  if (authSubscription) {
    authSubscription.unsubscribe();
    authSubscription = null;
  }

  let sessionResult = null;
  try {
    sessionResult = await supabase.auth.getSession();
  } catch (error) {
    const msg = error && error.message ? error.message : '알 수 없는 오류';
    setAuthStatus(`세션 조회 실패: ${msg}`);
    return false;
  }

  const { data, error } = sessionResult;
  if (error) {
    setAuthStatus(error.message);
    return false;
  }

  try {
    const { data: authData } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && session.user) handleSignedIn(session.user);
      else handleSignedOut();
    });
    authSubscription = authData && authData.subscription ? authData.subscription : null;
  } catch (error) {
    const msg = error && error.message ? error.message : '알 수 없는 오류';
    setAuthStatus(`인증 이벤트 등록 실패: ${msg}`);
    authSubscription = null;
  }

  if (data && data.session && data.session.user) await handleSignedIn(data.session.user);
  else handleSignedOut();

  return true;
}

function applyAuthState(user) {
  const gate = $('auth-gate');
  const app = $('app');
  const withdrawBtn = $('withdraw-btn');
  const upgradeBtn = $('upgrade-account-btn');
  const logoutBtn = $('logout-btn');
  if (user) {
    gate.classList.add('hidden');
    app.style.display = 'grid';
    $('user-email').textContent = user.email || '';
    $('auth-status').textContent = '로그인됨';
    if (logoutBtn) {
      const isAnon = isAnonymousUser(user);
      logoutBtn.textContent = isAnon ? '로그아웃(자동 탈퇴)' : '로그아웃';
      logoutBtn.title = isAnon ? '익명 계정은 로그아웃 시 자동으로 회원탈퇴됩니다.' : '로그아웃';
      logoutBtn.setAttribute('aria-label', logoutBtn.textContent);
    }
    if (withdrawBtn) withdrawBtn.classList.add('hidden');
    if (upgradeBtn) upgradeBtn.classList.toggle('hidden', !isAnonymousUser(user));
  } else {
    gate.classList.remove('hidden');
    app.style.display = 'none';
    $('user-email').textContent = '';
    if (logoutBtn) {
      logoutBtn.textContent = '로그아웃';
      logoutBtn.title = '로그아웃';
      logoutBtn.setAttribute('aria-label', '로그아웃');
    }
    if (withdrawBtn) withdrawBtn.classList.toggle('hidden', !showWithdrawOnAuthGate);
    if (upgradeBtn) upgradeBtn.classList.add('hidden');
  }
}

function renderTree() {
  const tree = $('tree');
  if (!tree) return;
  tree.innerHTML = '';

  const attachDrop = (el, folderId) => {
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (!e.dataTransfer) return;
      let payload = null;
      try {
        payload = JSON.parse(e.dataTransfer.getData('application/json') || 'null');
      } catch (_error) {
        payload = null;
      }
      if (!payload) {
        const docId = e.dataTransfer.getData('text/plain');
        if (docId) moveDocToFolder(docId, folderId);
        return;
      }
      if (payload.kind === 'doc') moveDocToFolder(payload.id, folderId);
      if (payload.kind === 'folder') moveFolderToFolder(payload.id, folderId);
    });
  };

  const mk = (
    name,
    cls = '',
    onClick = null,
    actions = [],
    dragMeta = null,
    dropFolderId = undefined,
  ) => {
    const el = document.createElement('div');
    el.className = `tree-item ${cls}`.trim();
    const label = document.createElement('span');
    label.textContent = name;
    el.appendChild(label);
    if (onClick) el.onclick = onClick;
    if (dragMeta) {
      el.draggable = true;
      el.addEventListener('dragstart', (e) => {
        if (!e.dataTransfer) return;
        e.dataTransfer.setData('application/json', JSON.stringify(dragMeta));
        if (dragMeta.kind === 'doc') e.dataTransfer.setData('text/plain', dragMeta.id);
        e.dataTransfer.effectAllowed = 'move';
      });
    }
    if (typeof dropFolderId !== 'undefined') {
      attachDrop(el, dropFolderId);
    }
    actions.forEach((act) => {
      const btn = document.createElement('button');
      btn.className = `tree-act-btn ${act.className || ''}`.trim();
      btn.textContent = act.label;
      btn.onclick = (e) => {
        e.stopPropagation();
        act.onClick();
      };
      el.appendChild(btn);
    });
    return el;
  };

  const renderBranch = (parentFolderId, container) => {
    const folders = state.folders.filter((f) => (f.parentFolderId || null) === parentFolderId);
    const docs = state.docs.filter((d) => (d.folderId || null) === parentFolderId);

    folders.forEach((f) => {
      const folderRow = mk(
        ` 📁 ${f.name}`,
        '',
        null,
        [
          { label: '변경', className: 'tree-rename-btn', onClick: () => renameFolder(f.id) },
          { label: '삭제', className: 'tree-del-btn', onClick: () => deleteFolder(f.id) },
        ],
        { kind: 'folder', id: f.id },
        f.id,
      );
      container.appendChild(folderRow);

      const indent = document.createElement('div');
      indent.className = 'tree-indent';
      indent.appendChild(mk('+ 문서', '', () => createDoc(f.id)));
      indent.appendChild(mk('+ 하위 폴더', '', () => createFolder(f.id)));
      renderBranch(f.id, indent);
      container.appendChild(indent);
    });

    docs.forEach((d) => {
      const mark = state.activeDocA === d.id || state.activeDocB === d.id ? 'active' : '';
      container.appendChild(mk(
        ` ${d.name}`,
        mark,
        () => openInActivePane(d.id),
        [
          { label: '변경', className: 'tree-rename-btn', onClick: () => renameDoc(d.id) },
          { label: '삭제', className: 'tree-del-btn', onClick: () => deleteDoc(d.id) },
        ],
        { kind: 'doc', id: d.id },
      ));
    });
  };

  tree.appendChild(mk(' + 문서 생성', '', () => createDoc(null), [], null, null));
  tree.appendChild(mk(' + 폴더 생성', '', () => createFolder(null), [], null, null));
  renderBranch(null, tree);
}

function getFolder(folderId) {
  return state.folders.find((f) => f.id === folderId);
}

function getDescendantFolderIds(folderId) {
  const result = [];
  const stack = [folderId];
  while (stack.length > 0) {
    const current = stack.pop();
    const children = state.folders.filter((f) => (f.parentFolderId || null) === current);
    children.forEach((c) => {
      result.push(c.id);
      stack.push(c.id);
    });
  }
  return result;
}

function renameDoc(docId) {
  const doc = getDoc(docId);
  if (!doc) return;
  const name = prompt('문서 이름 변경', doc.name);
  if (!name || !name.trim()) return;
  doc.name = name.trim();
  saveState();
  renderAll();
}

function renameFolder(folderId) {
  const folder = getFolder(folderId);
  if (!folder) return;
  const name = prompt('폴더 이름 변경', folder.name);
  if (!name || !name.trim()) return;
  folder.name = name.trim();
  saveState();
  renderTree();
}

function ensureAtLeastOneDoc() {
  if (state.docs.length > 0) return;
  if (state.folders.length > 0) {
    state.activeDocA = null;
    state.activeDocB = null;
    return;
  }
  const id = `d${Date.now()}`;
  state.docs.push({ id, name: '새 문서.txt', folderId: null, content: '' });
  state.activeDocA = id;
  state.activeDocB = null;
}

function deleteDoc(docId) {
  const doc = getDoc(docId);
  if (!doc) return;
  if (!confirm(`문서 "${doc.name}"를 삭제할까요?`)) return;
  addHistoryEntry('doc-delete', {
    scope: 'doc',
    docId: doc.id,
    docName: doc.name,
    summary: `문서 삭제: ${doc.name}`,
  }, cloneStateForHistory());

  state.docs = state.docs.filter((d) => d.id !== docId);
  dirtyDocIds.delete(docId);

  if (state.activeDocA === docId) state.activeDocA = null;
  if (state.activeDocB === docId) state.activeDocB = null;
  ensureAtLeastOneDoc();
  if (!state.activeDocA && state.docs[0]) state.activeDocA = state.docs[0].id;
  if (state.activeDocA === state.activeDocB) state.activeDocB = null;

  saveState();
  renderAll();
}

function deleteFolder(folderId) {
  const folder = getFolder(folderId);
  if (!folder) return;
  const folderIds = [folderId, ...getDescendantFolderIds(folderId)];
  const docsInFolders = state.docs.filter((d) => folderIds.includes(d.folderId));
  const msg = `폴더 "${folder.name}" 및 하위 폴더/문서 ${docsInFolders.length}개를 삭제할까요?`;
  if (!confirm(msg)) return;
  addHistoryEntry('folder-delete', {
    scope: 'folder',
    summary: `폴더 삭제: ${folder.name} (문서 ${docsInFolders.length}개 포함)`,
  }, cloneStateForHistory());

  state.folders = state.folders.filter((f) => !folderIds.includes(f.id));
  state.docs = state.docs.filter((d) => !folderIds.includes(d.folderId));
  docsInFolders.forEach((d) => {
    dirtyDocIds.delete(d.id);
  });

  if (state.activeDocA && !getDoc(state.activeDocA)) state.activeDocA = null;
  if (state.activeDocB && !getDoc(state.activeDocB)) state.activeDocB = null;
  ensureAtLeastOneDoc();
  if (!state.activeDocA && state.docs[0]) state.activeDocA = state.docs[0].id;
  if (state.activeDocA === state.activeDocB) state.activeDocB = null;

  saveState();
  renderAll();
}

function moveDocToFolder(docId, folderId) {
  const doc = getDoc(docId);
  if (!doc) return;
  if (doc.folderId === folderId) return;
  doc.folderId = folderId;
  saveState();
  renderTree();
}

function moveFolderToFolder(folderId, targetParentId) {
  const folder = getFolder(folderId);
  if (!folder) return;
  if (folderId === targetParentId) return;
  if (targetParentId && getDescendantFolderIds(folderId).includes(targetParentId)) {
    alert('하위 폴더 안으로는 이동할 수 없습니다.');
    return;
  }
  folder.parentFolderId = targetParentId;
  saveState();
  renderTree();
}

function createDoc(folderId) {
  const name = prompt('문서 이름', '새 문서.txt');
  if (!name) return;
  const id = `d${Date.now()}`;
  state.docs.push({ id, name, folderId, content: '' });
  state.activeDocA = id;
  addHistoryEntry('doc-create', {
    scope: 'doc',
    docId: id,
    docName: name,
    summary: `문서 생성: ${name}`,
  });
  saveState();
  renderAll();
}

function createFolder(parentFolderId = null) {
  const name = prompt('폴더 이름', '새 폴더');
  if (!name) return;
  state.folders.push({ id: `f${Date.now()}`, name, parentFolderId });
  addHistoryEntry('folder-create', {
    scope: 'folder',
    summary: `폴더 생성: ${name}`,
  });
  saveState();
  renderTree();
}

function cloneStateForHistory() {
  const snapshot = JSON.parse(JSON.stringify(state));
  delete snapshot.historyEntries;
  return snapshot;
}

function addHistoryEntry(trigger, meta = {}, snapshotOverride = null) {
  const arr = Array.isArray(state.historyEntries) ? state.historyEntries : [];
  const snapshot = snapshotOverride || cloneStateForHistory();
  arr.unshift({
    id: Date.now() + Math.floor(Math.random() * 1000),
    savedAt: new Date().toISOString(),
    trigger,
    scope: meta.scope || 'doc',
    docId: meta.docId || null,
    docName: meta.docName || null,
    summary: meta.summary || '',
    snapshot,
  });
  state.historyEntries = arr.slice(0, 10);
}

function markDocDirty(docId) {
  if (!docId) return;
  dirtyDocIds.add(docId);
}

function flushHistorySnapshots(trigger, options = {}) {
  const onlyFullSync = !!options.onlyFullSync;
  const ids = [];
  if (!onlyFullSync) {
    dirtyDocIds.forEach((id) => {
      if (getDoc(id)) ids.push(id);
    });
  }

  if (!onlyFullSync && ids.length === 0 && options.includeActiveFallback && state.activeDocA && getDoc(state.activeDocA)) {
    ids.push(state.activeDocA);
  }
  if (ids.length === 0 && !options.includeFullSync) return 0;

  ids.forEach((id) => {
    const doc = getDoc(id);
    if (!doc) return;
    addHistoryEntry(trigger, {
      scope: 'doc',
      docId: doc.id,
      docName: doc.name || id,
      summary: `문서 수정 저장: ${doc.name || id}`,
    });
    dirtyDocIds.delete(id);
  });
  if (options.includeFullSync) {
    addHistoryEntry(trigger, {
      scope: 'full',
      summary: '전체 동기화',
    });
    if (onlyFullSync) dirtyDocIds.clear();
  }
  saveState();
  return ids.length + (options.includeFullSync ? 1 : 0);
}

function ensureHistoryAutoSaveInterval() {
  if (historyAutoTimer) return;
  historyAutoTimer = setInterval(() => {
    flushHistorySnapshots('auto-10m', { includeFullSync: true, onlyFullSync: true });
  }, HISTORY_AUTO_SAVE_MS);
}

function updateEditorPane(pane, value) {
  const docId = pane === 'a' ? state.activeDocA : state.activeDocB;
  const doc = getDoc(docId);
  if (!doc) return;

  doc.content = value;
  markDocDirty(doc.id);
  updateProgress();
  saveState();
}

function manualSavePane(pane) {
  const docId = pane === 'a' ? state.activeDocA : state.activeDocB;
  const doc = getDoc(docId);
  if (!doc) return;

  const editor = pane === 'a' ? $('editor-a') : $('editor-b');
  const value = editor ? editor.value : (doc.content || '');
  doc.content = value;
  addHistoryEntry('manual-save', {
    scope: 'doc',
    docId: doc.id,
    docName: doc.name || doc.id,
    summary: `문서 수동 저장: ${doc.name || doc.id}`,
  });
  dirtyDocIds.delete(doc.id);
  saveState();
  updateProgress();
  setSyncStatus(`문서 수동 저장 완료: ${doc.name}`, 'ok');
}

function openInActivePane(docId) {
  if (state.split === 'single') {
    state.activeDocA = docId;
  } else if (state.activeDocB === docId) {
    state.activeDocA = docId;
    state.activeDocB = null;
  } else if (!state.activeDocA || state.activeDocA === docId) {
    state.activeDocA = docId;
  } else {
    state.activeDocB = docId;
  }
  if (state.activeDocA === state.activeDocB) state.activeDocB = null;
  saveState();
  renderAll();
}

function renderEditors() {
  const a = getDoc(state.activeDocA);
  const b = getDoc(state.activeDocB);

  $('editor-a').value = a && typeof a.content === 'string' ? a.content : '';
  $('editor-b').value = b && typeof b.content === 'string' ? b.content : '';

  const area = $('editor-area');
  area.className = `editor-area ${state.split}`;
  $('pane-b').classList.toggle('hidden', state.split === 'single');

  const renderPaneHead = (paneId, title, pane) => {
    const head = $(paneId).querySelector('.pane-head');
    if (!head) return;
    head.innerHTML = '';

    const label = document.createElement('span');
    label.textContent = title;
    head.appendChild(label);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pane-save-btn';
    btn.textContent = '저장';
    btn.disabled = pane === 'a' ? !a : !b;
    btn.onclick = () => manualSavePane(pane);
    head.appendChild(btn);
  };

  renderPaneHead('pane-a', `왼쪽: ${a && a.name ? a.name : '-'}`, 'a');
  renderPaneHead('pane-b', `오른쪽/아래: ${b && b.name ? b.name : '-'}`, 'b');
}

function updateProgress() {
  const a = getDoc(state.activeDocA);
  const b = getDoc(state.activeDocB);
  const text = [a && a.content ? a.content : '', b && b.content ? b.content : ''].join('');
  const actualWithSpaces = text.length;
  const actualNoSpaces = text.replace(/\s/g, '').length;
  const date = todayKey();
  const target = Number(state.goalByDate[date] || 0);
  const focusSec = Number(state.focusSecondsByDate[date] || 0);

  state.progressByDate[date] = {
    actualChars: actualWithSpaces,
    actualCharsNoSpaces: actualNoSpaces,
    targetChars: target,
    goalAchieved: target > 0 && actualWithSpaces >= target,
  };

  $('progress-pill').textContent = `${actualWithSpaces} / ${target}`;
  $('daily-stats').textContent = `공백 포함: ${actualWithSpaces}\n공백 제외: ${actualNoSpaces}\n집중 횟수: ${state.sessionsByDate[date] || 0}\n집중 시간: ${formatDuration(focusSec)}`;
  renderCalendar();
  renderCalendarTable();
  updateGoalLockUI();
}

function formatDuration(totalSeconds) {
  const sec = Math.max(0, Number(totalSeconds) || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function isTodayGoalLocked() {
  return !!state.goalLockedByDate[todayKey()];
}

function updateGoalLockUI() {
  const lockBtn = $('goal-lock-btn');
  const goalInput = $('goal-input');
  if (!lockBtn || !goalInput) return;
  const locked = isTodayGoalLocked();
  goalInput.disabled = locked;
  lockBtn.textContent = locked ? '오늘 목표 고정 해제' : '오늘 목표 고정';
  lockBtn.title = locked ? '오늘 목표 글자수 고정을 해제합니다.' : '오늘 목표 글자수를 고정합니다.';
}

function renderCalendar() {
  const box = $('calendar');
  box.innerHTML = '';

  const now = seoulDateParts();
  const y = now.year;
  const m = now.month;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();

  for (let d = 1; d <= last; d += 1) {
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const rec = state.progressByDate[key];
    const target = Number((rec && rec.targetChars) || state.goalByDate[key] || 0);
    const actualWithSpaces = Number((rec && rec.actualChars) || 0);
    const actualNoSpaces = Number((rec && rec.actualCharsNoSpaces) || 0);
    const el = document.createElement('div');
    el.className = `day ${rec && rec.goalAchieved ? 'hit' : ''}`;
    el.textContent = d;
    el.title = `${key}\n목표 글자수: ${target}\n실제 달성(공백 포함): ${actualWithSpaces}\n실제 달성(공백 제외): ${actualNoSpaces}`;
    box.appendChild(el);
  }
}

function renderCalendarTable() {
  const table = $('calendar-table');
  if (!table) return;
  table.innerHTML = '';

  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>날짜</th><th>목표</th><th>공백 포함</th><th>공백 제외</th><th>달성</th></tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const now = seoulDateParts();
  const y = now.year;
  const m = now.month;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();

  for (let d = 1; d <= last; d += 1) {
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const rec = state.progressByDate[key];
    const target = Number((rec && rec.targetChars) || state.goalByDate[key] || 0);
    const actualWithSpaces = Number((rec && rec.actualChars) || 0);
    const actualNoSpaces = Number((rec && rec.actualCharsNoSpaces) || 0);
    const achieved = target > 0 && actualWithSpaces >= target;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${key}</td><td>${target}</td><td>${actualWithSpaces}</td><td>${actualNoSpaces}</td><td>${achieved ? '달성' : '-'}</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
}

function setCalendarViewMode(mode) {
  calendarViewMode = mode === 'table' ? 'table' : 'calendar';
  const calendar = $('calendar');
  const tableWrap = $('calendar-table-wrap');
  const calendarBtn = $('calendar-view-btn');
  const tableBtn = $('calendar-table-view-btn');
  if (calendar) calendar.classList.toggle('hidden', calendarViewMode !== 'calendar');
  if (tableWrap) tableWrap.classList.toggle('hidden', calendarViewMode !== 'table');
  if (calendarBtn) calendarBtn.classList.toggle('active', calendarViewMode === 'calendar');
  if (tableBtn) tableBtn.classList.toggle('active', calendarViewMode === 'table');
}

function switchSplit(mode) {
  state.split = mode;
  if (mode !== 'single' && !state.activeDocB) {
    const another = state.docs.find((d) => d.id !== state.activeDocA);
    if (another) state.activeDocB = another.id;
  }
  saveState();
  renderEditors();
  updateProgress();
}

function exportTxt() {
  const d = getDoc(state.activeDocA);
  if (!d) return;
  const blob = new Blob([d.content], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, `${d.name.replace(/\.[^/.]+$/, '')}_${todayKey()}.txt`);
}

function exportPdf() {
  const d = getDoc(state.activeDocA);
  if (!d) return;

  const w = window.open('', '_blank');
  if (!w) {
    alert('내보내기 창을 열 수 없습니다. 브라우저 팝업 차단을 해제한 뒤 다시 시도하세요.');
    return;
  }

  w.document.write(`<html><head><title>${d.name}</title></head><body><h1>${d.name}</h1><pre style="white-space:pre-wrap;font-family:sans-serif;">${d.content.replace(/</g, '&lt;')}</pre></body></html>`);
  w.document.close();
  // Mobile browsers often block or ignore immediate print; keep manual print as fallback.
  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch (_error) {
      // noop
    }
  }, 50);
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ua = (navigator.userAgent || '').toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);

  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.target = '_blank';
  document.body.appendChild(a);

  // iOS Safari may ignore download attribute for blob URLs. Open a new tab fallback.
  if (isIOS) {
    window.open(url, '_blank');
  } else {
    a.click();
  }

  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function renderHistory() {
  const list = $('history-list');
  if (!list) return;
  list.innerHTML = '';
  const entries = state.historyEntries || [];
  const triggerLabel = {
    'auto-10m': '자동저장(10분)',
    'manual-sync': '수동동기화',
    'manual-save': '수동저장',
    'doc-create': '문서생성',
    'doc-delete': '문서삭제',
    'folder-create': '폴더생성',
    'folder-delete': '폴더삭제',
  };

  entries.forEach((h) => {
    const li = document.createElement('li');
    const label = triggerLabel[h.trigger] || h.trigger || '기록';
    let tail = h.summary || '';
    if (h.trigger === 'manual-sync' || h.scope === 'full') tail = '대상: 전체 동기화';
    if (h.trigger === 'manual-save') tail = `대상: ${h.docName || '-'}`;
    li.textContent = `${new Date(h.savedAt).toLocaleString()} · ${label}${tail ? ` · ${tail}` : ''}`;

    const btn = document.createElement('button');
    btn.textContent = '복원';
    btn.onclick = () => {
      if (!confirm('이 버전으로 복원할까요?')) return;
      const keepHistory = Array.isArray(state.historyEntries) ? [...state.historyEntries] : [];
      replaceState(h.snapshot || {});
      state.historyEntries = keepHistory;
      dirtyDocIds.clear();
      saveState();
      renderAll();
      $('history-dialog').close();
    };

    li.appendChild(btn);
    list.appendChild(li);
  });

  if (entries.length === 0) {
    const li = document.createElement('li');
    li.textContent = '히스토리가 없습니다.';
    list.appendChild(li);
  }
}

function tickTimer() {
  if (!state.pomodoro.running) return;

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
    state.pomodoro.left = state.pomodoro.mode === 'focus' ? 25 * 60 : 5 * 60;
    alert(`${completedMode === 'focus' ? '집중' : '휴식'} 완료! 다음: ${state.pomodoro.mode}`);
  }

  saveState();
  renderTimer();
  updateProgress();
}

function ensureTimerInterval() {
  if (timerRef) return;
  timerRef = setInterval(tickTimer, 1000);
}

function renderTimer() {
  const sec = state.pomodoro.left;
  $('timer-label').textContent = state.pomodoro.mode === 'focus' ? '집중' : '휴식';
  $('timer-display').textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  const toggleBtn = $('timer-toggle');
  if (toggleBtn) toggleBtn.textContent = state.pomodoro.running ? '일시정지' : '시작';
}

function renderAll() {
  renderTree();
  renderEditors();
  renderTimer();
  updateProgress();
  $('goal-input').value = state.goalByDate[todayKey()] || '';
  updateGoalLockUI();
  setCalendarViewMode(calendarViewMode);
}

async function handleManualSync() {
  flushHistorySnapshots('manual-sync', { includeFullSync: true, onlyFullSync: true });
  await pushRemoteState();
}

async function authSignUp() {
  if (!supabase) {
    setAuthStatus('먼저 설정 저장을 눌러 Supabase 연결을 초기화하세요.');
    return;
  }
  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;
  const { error } = await supabase.auth.signUp({ email, password });
  setAuthStatus(error ? error.message : '회원가입 요청 완료. 이메일 인증을 확인하세요.');
}

async function authLogin() {
  if (!supabase) {
    setAuthStatus('먼저 설정 저장을 눌러 Supabase 연결을 초기화하세요.');
    return;
  }
  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  setAuthStatus(error ? error.message : '로그인 성공');
}

async function authAnonymousLogin() {
  if (!supabase || !supabase.auth || typeof supabase.auth.signInAnonymously !== 'function') {
    setAuthStatus('익명 로그인 사용 불가: Supabase Anonymous provider 설정을 확인하세요.');
    return;
  }
  const { error } = await supabase.auth.signInAnonymously();
  setAuthStatus(error ? `익명 로그인 실패: ${error.message}` : '익명 로그인 성공');
}

function openUpgradeDialog() {
  const dlg = $('upgrade-dialog');
  const emailInput = $('upgrade-email');
  const passwordInput = $('upgrade-password');
  if (!dlg || !supabaseUser || !isAnonymousUser(supabaseUser)) return;
  if (emailInput) emailInput.value = '';
  if (passwordInput) passwordInput.value = '';
  if (typeof dlg.showModal === 'function') dlg.showModal();
}

function closeUpgradeDialog() {
  const dlg = $('upgrade-dialog');
  if (!dlg || typeof dlg.close !== 'function') return;
  dlg.close();
}

async function upgradeAnonymousAccount() {
  if (!supabase || !supabaseUser || !isAnonymousUser(supabaseUser)) {
    setAuthStatus('익명 로그인 사용자만 회원가입 전환이 가능합니다.');
    return;
  }
  const emailInput = $('upgrade-email');
  const passwordInput = $('upgrade-password');
  const email = emailInput ? emailInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value : '';
  if (!email || !password) {
    setAuthStatus('이메일과 비밀번호를 입력하세요.');
    return;
  }
  if (!supabase.auth || typeof supabase.auth.updateUser !== 'function') {
    setAuthStatus('현재 클라이언트에서 계정 전환을 지원하지 않습니다.');
    return;
  }

  const { error } = await supabase.auth.updateUser({ email, password });
  if (error) {
    showUiError('upgrade', error, { auth: true, sync: false, logContext: 'account upgrade failed' });
    return;
  }
  const signInResult = await supabase.auth.signInWithPassword({ email, password });
  closeUpgradeDialog();
  if (!signInResult || !signInResult.error) {
    setAuthStatus('회원가입 완료: 자동 로그인되었습니다.');
    return;
  }

  const msg = String(signInResult.error.message || '');
  if (msg.toLowerCase().includes('confirm') || msg.toLowerCase().includes('verified')) {
    setAuthStatus('회원가입 전환 완료. 이메일 인증 후 자동 로그인됩니다.');
    return;
  }
  showUiError('upgrade', signInResult.error, { auth: true, sync: false, logContext: 'account upgrade auto sign-in failed' });
}

async function authLogout() {
  if (!supabase) {
    setAuthStatus('현재 로그인 세션이 없습니다.');
    return;
  }
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
  showWithdrawOnAuthGate = true;
  await supabase.auth.signOut();
}

function openWithdrawDialog() {
  const dlg = $('withdraw-dialog');
  const check = $('withdraw-confirm-check');
  const textInput = $('withdraw-confirm-text');
  const emailInput = $('withdraw-email');
  const passwordInput = $('withdraw-password');
  const requiresCredentialReauth = !(supabaseUser && isAnonymousUser(supabaseUser));
  if (!dlg) return;
  if (check) check.checked = false;
  if (textInput) textInput.value = '';
  if (emailInput) {
    emailInput.value = ($('auth-email') && $('auth-email').value ? $('auth-email').value.trim() : '');
    emailInput.classList.toggle('hidden', !requiresCredentialReauth);
  }
  if (passwordInput) {
    passwordInput.value = '';
    passwordInput.classList.toggle('hidden', !requiresCredentialReauth);
  }
  updateWithdrawConfirmState();
  if (typeof dlg.showModal === 'function') dlg.showModal();
}

function closeWithdrawDialog() {
  const dlg = $('withdraw-dialog');
  if (!dlg || typeof dlg.close !== 'function') return;
  dlg.close();
}

function updateWithdrawConfirmState() {
  const confirmBtn = $('withdraw-confirm-btn');
  const check = $('withdraw-confirm-check');
  const textInput = $('withdraw-confirm-text');
  const emailInput = $('withdraw-email');
  const passwordInput = $('withdraw-password');
  const requiresCredentialReauth = !(supabaseUser && isAnonymousUser(supabaseUser));
  if (!confirmBtn || !check || !textInput) return;
  const hasCreds = !requiresCredentialReauth
    || !!(emailInput && passwordInput && emailInput.value.trim() && passwordInput.value);
  const ok = check.checked && textInput.value.trim() === WITHDRAW_CONFIRM_TEXT && hasCreds;
  confirmBtn.disabled = !ok;
}

async function deleteRemoteStateImmediately(userId) {
  if (!supabase || !userId) return { error: { message: '삭제 대상 사용자 정보가 없습니다.' } };
  return supabase.from('editor_states').delete().eq('user_id', userId);
}

async function deleteOwnAccountImmediately() {
  if (!supabase || typeof supabase.rpc !== 'function') {
    return { error: { message: '계정 삭제 RPC를 사용할 수 없습니다.' } };
  }
  return supabase.rpc('delete_my_account_rpc_v3');
}

function isJwtExpiredError(errorLike) {
  const msg = String((errorLike && errorLike.message) || errorLike || '').toLowerCase();
  return msg.includes('jwt') && msg.includes('expired');
}

async function ensureFreshAuthSession() {
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

async function executeAccountDeletionFlow(user, options = {}) {
  if (!user || !user.id) {
    setAuthStatus('삭제 대상 사용자 확인에 실패했습니다.');
    setSyncStatus('탈퇴 중단: 사용자 확인 실패', 'error');
    return false;
  }

  setAuthStatus('회원 탈퇴 처리 중... 절대 창을 닫지 마세요.');
  setSyncStatus('회원 탈퇴 처리 중…', 'pending');

  let deletedState = await deleteRemoteStateImmediately(user.id);
  if (deletedState && deletedState.error && isJwtExpiredError(deletedState.error)) {
    const fresh = await ensureFreshAuthSession();
    if (fresh.ok) {
      deletedState = await deleteRemoteStateImmediately(user.id);
    }
  }
  if (deletedState && deletedState.error) {
    showUiError('withdraw', deletedState.error, {
      auth: true,
      sync: true,
      logContext: 'withdraw deleteRemoteState failed',
    });
    return false;
  }

  let deletedAccount = await deleteOwnAccountImmediately();
  if (deletedAccount && deletedAccount.error && isJwtExpiredError(deletedAccount.error)) {
    const fresh = await ensureFreshAuthSession();
    if (fresh.ok) {
      deletedAccount = await deleteOwnAccountImmediately();
    }
  }
  if (deletedAccount && deletedAccount.error) {
    showUiError('withdraw', deletedAccount.error, {
      auth: true,
      sync: true,
      logContext: 'withdraw delete account rpc failed',
    });
    if ((deletedAccount.error.message || '').includes('delete_my_account')) {
      alert('회원 탈퇴 실패: 서버 설정이 완료되지 않았습니다. 관리자에게 문의하세요.');
    }
    return false;
  }

  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
    autoSyncTimer = null;
  }
  lastSyncAt = 0;
  dirtyDocIds.clear();
  replaceState(defaultState());
  renderAll();
  clearLocalEditorData();
  showWithdrawOnAuthGate = false;
  closeWithdrawDialog();
  closeUpgradeDialog();
  await supabase.auth.signOut();
  setAuthStatus(options.successMessage || '회원 탈퇴 완료: 계정 및 클라우드 데이터가 영구 삭제되었습니다.');
  setSyncStatus('회원 탈퇴 완료', 'ok');
  if (options.showAlert) {
    alert('회원 탈퇴가 완료되었습니다. 계정과 데이터는 영구 삭제되었으며 복구할 수 없습니다.');
  }
  return true;
}

async function authWithdraw() {
  if (!supabase) {
    setAuthStatus('먼저 설정 저장을 눌러 Supabase 연결을 초기화하세요.');
    return;
  }
  const requiresCredentialReauth = !(supabaseUser && isAnonymousUser(supabaseUser));
  const emailInput = $('withdraw-email');
  const passwordInput = $('withdraw-password');
  const inputEmail = emailInput ? emailInput.value.trim() : '';
  const inputPassword = passwordInput ? passwordInput.value : '';
  if (requiresCredentialReauth && (!inputEmail || !inputPassword)) {
    setAuthStatus('회원 탈퇴 전, 이메일/비밀번호로 다시 로그인해 계정을 확인하세요.');
    return;
  }

  let confirmedUser = supabaseUser;
  if (requiresCredentialReauth) {
    setAuthStatus('탈퇴 계정 확인을 위해 재로그인 중...');
    const signInResult = await supabase.auth.signInWithPassword({ email: inputEmail, password: inputPassword });
    if (signInResult && signInResult.error) {
      showUiError('withdraw', signInResult.error, { auth: true, sync: false, logContext: 'withdraw re-auth failed' });
      setSyncStatus('탈퇴 중단: 계정 확인 실패', 'error');
      return;
    }

    const sessionResult = await supabase.auth.getSession();
    confirmedUser = sessionResult && sessionResult.data && sessionResult.data.session
      ? sessionResult.data.session.user
      : null;
    if (!confirmedUser || !confirmedUser.id) {
      setAuthStatus('재로그인은 되었지만 사용자 확인에 실패했습니다.');
      setSyncStatus('탈퇴 중단: 사용자 확인 실패', 'error');
      return;
    }
    const confirmedEmail = String(confirmedUser.email || '').trim().toLowerCase();
    if (confirmedEmail && confirmedEmail !== inputEmail.toLowerCase()) {
      await supabase.auth.signOut();
      setAuthStatus('입력한 이메일과 로그인된 계정이 다릅니다. 회원 탈퇴를 중단했습니다.');
      setSyncStatus('탈퇴 중단: 계정 불일치', 'error');
      return;
    }
    const fresh = await ensureFreshAuthSession();
    if (!fresh.ok) {
      setAuthStatus(`재로그인 후 세션 갱신 실패: ${fresh.message}`);
      setSyncStatus('탈퇴 중단: 세션 갱신 실패', 'error');
      return;
    }
    confirmedUser = fresh.user;
  } else if (!confirmedUser || !confirmedUser.id) {
    setAuthStatus('익명 세션이 만료되어 탈퇴를 진행할 수 없습니다. 다시 시작해 주세요.');
    setSyncStatus('탈퇴 중단: 세션 만료', 'error');
    return;
  }
  await executeAccountDeletionFlow(confirmedUser, { showAlert: true });
}

async function saveAuthConfigAndInit() {
  const urlInput = $('sb-url');
  const anonInput = $('sb-anon');
  const embedded = getEmbeddedSupabaseConfig();
  const url = (urlInput && urlInput.value ? urlInput.value.trim() : '') || (embedded ? embedded.url : '');
  const anon = (anonInput && anonInput.value ? anonInput.value.trim() : '') || (embedded ? embedded.anon : '');
  if (!url || !anon) {
    setAuthStatus('관리자 Supabase 설정이 누락되었습니다.');
    return;
  }

  setAuthStatus('설정 저장 및 연결 확인 중...');
  const saved = saveSupabaseConfig(url, anon);
  if (!saved) return;

  try {
    const ok = await setupSupabase();
    if (ok) {
      setAuthStatus('설정 저장 완료');
    } else {
      const current = ($('auth-status') && $('auth-status').textContent
        ? $('auth-status').textContent
        : '').trim();
      if (!current || current === '설정 저장 및 연결 확인 중...') {
        setAuthStatus('Supabase 설정이 올바르지 않습니다.');
      }
    }
  } catch (error) {
    const msg = error && error.message ? error.message : '알 수 없는 오류';
    setAuthStatus(`설정 저장 실패: ${msg}`);
  }
}

function updatePanelToggleButtons() {
  const treeBtn = $('toggle-tree-btn');
  const calendarBtn = $('toggle-calendar-btn');
  const sidebarToolbarBtn = $('toggle-sidebar-toolbar-btn');
  const calendarToolbarBtn = $('toggle-calendar-toolbar-btn');
  const isMobileMini = window.innerWidth <= MOBILE_MINI_BREAKPOINT;
  const isCompact = window.innerWidth <= 1100;
  const showSidebar = isMobileMini ? mobileMiniSidebarOpen : !!layoutPrefs.showSidebar;
  const showCalendar = isMobileMini ? mobileMiniCalendarOpen : (!!layoutPrefs.showCalendar && !isCompact);

  if (treeBtn) {
    if (isMobileMini) {
      treeBtn.textContent = '✕';
      treeBtn.title = '문서트리 닫기';
      treeBtn.setAttribute('aria-label', '문서트리 닫기');
    } else {
      treeBtn.textContent = '◀';
      treeBtn.title = '문서트리 숨기기';
      treeBtn.setAttribute('aria-label', '문서트리 숨기기');
    }
  }
  if (calendarBtn) {
    calendarBtn.textContent = '▶';
    calendarBtn.title = '달력 숨기기';
    calendarBtn.setAttribute('aria-label', '달력 숨기기');
  }
  if (sidebarToolbarBtn) {
    if (isMobileMini) sidebarToolbarBtn.textContent = showSidebar ? '문서목록 닫기' : '문서목록';
    else sidebarToolbarBtn.textContent = showSidebar ? '문서트리 숨기기' : '문서트리 보이기';
  }
  if (calendarToolbarBtn) {
    if (isMobileMini) {
      calendarToolbarBtn.textContent = showCalendar ? '달력 닫기' : '달력';
      calendarToolbarBtn.disabled = false;
      calendarToolbarBtn.title = showCalendar ? '오른쪽 달력 패널 닫기' : '오른쪽 달력 패널 보기';
    } else if (isCompact) {
      calendarToolbarBtn.textContent = '달력(넓은 화면)';
      calendarToolbarBtn.disabled = true;
      calendarToolbarBtn.title = '달력 패널은 넓은 화면에서만 표시됩니다.';
    } else {
      calendarToolbarBtn.textContent = showCalendar ? '달력 숨기기' : '달력 보이기';
      calendarToolbarBtn.disabled = false;
      calendarToolbarBtn.title = showCalendar ? '오른쪽 달력 패널 숨기기' : '오른쪽 달력 패널 보이기';
    }
  }
}

function applyAppLayout() {
  const app = $('app');
  const sidebar = $('sidebar');
  const sidebarResizer = $('sidebar-resizer');
  const calendarResizer = $('calendar-resizer');
  const statsPanel = document.querySelector('.stats-panel');
  const showTreeBar = $('show-tree-bar');
  const showCalendarBar = $('show-calendar-bar');
  if (!app || !sidebar || !sidebarResizer || !calendarResizer || !statsPanel) return;

  const isCompact = window.innerWidth <= 1100;
  const isMobileMini = window.innerWidth <= MOBILE_MINI_BREAKPOINT;
  const showSidebar = isMobileMini ? mobileMiniSidebarOpen : !!layoutPrefs.showSidebar;
  const showCalendar = isMobileMini ? mobileMiniCalendarOpen : (!!layoutPrefs.showCalendar && !isCompact);
  const leftBarSpace = showSidebar ? 0 : 16;
  const rightBarSpace = showCalendar ? 0 : (isCompact ? 0 : 16);

  document.body.classList.toggle('mobile-mini', isMobileMini);
  document.body.classList.toggle('mobile-mini-calendar-open', isMobileMini && showCalendar);
  sidebar.classList.toggle('hidden-panel', !showSidebar);
  sidebarResizer.classList.toggle('hidden-panel', !showSidebar);
  calendarResizer.classList.toggle('hidden-panel', !showCalendar);
  statsPanel.classList.toggle('hidden-panel', !showCalendar);
  if (showTreeBar) {
    showTreeBar.classList.toggle('hidden', isMobileMini || showSidebar);
    showTreeBar.setAttribute('aria-label', isMobileMini ? '문서 목록 열기' : '문서트리 보이기');
    showTreeBar.title = isMobileMini ? '문서 목록 열기' : '문서트리 보이기';
  }
  if (showCalendarBar) showCalendarBar.classList.toggle('hidden', isMobileMini || showCalendar || isCompact);

  if (showSidebar && showCalendar) app.style.gridTemplateColumns = `${sidebarWidth}px 8px 1fr 8px ${calendarWidth}px`;
  else if (showSidebar && !showCalendar) app.style.gridTemplateColumns = `${sidebarWidth}px 8px 1fr`;
  else if (!showSidebar && showCalendar) app.style.gridTemplateColumns = `1fr 8px ${calendarWidth}px`;
  else app.style.gridTemplateColumns = '1fr';
  app.style.paddingLeft = `${leftBarSpace}px`;
  app.style.paddingRight = `${rightBarSpace}px`;

  updatePanelToggleButtons();
}

function bindEvents() {
  initAuthGateBindings();
  const splitVerticalBtn = $('split-vertical');
  const splitHorizontalBtn = $('split-horizontal');
  const splitOffBtn = $('split-off');
  const toggleTreeBtn = $('toggle-tree-btn');
  const toggleCalendarBtn = $('toggle-calendar-btn');
  const showTreeBar = $('show-tree-bar');
  const showCalendarBar = $('show-calendar-bar');
  const sidebarToolbarBtn = $('toggle-sidebar-toolbar-btn');
  const calendarToolbarBtn = $('toggle-calendar-toolbar-btn');
  const editorA = $('editor-a');
  const editorB = $('editor-b');
  const goalInput = $('goal-input');
  const goalLockBtn = $('goal-lock-btn');
  const calendarViewBtn = $('calendar-view-btn');
  const calendarTableViewBtn = $('calendar-table-view-btn');
  const historyBtn = $('history-btn');
  const historyCloseBtn = $('history-close');
  const exportBtn = $('export-btn');
  const exportMenu = $('export-menu');
  const exportTxtBtn = $('export-txt');
  const exportPdfBtn = $('export-pdf');
  const timerToggleBtn = $('timer-toggle');
  const timerSkipBtn = $('timer-skip');
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
  const syncNowBtn = $('sync-now-btn');

  if (splitVerticalBtn) splitVerticalBtn.onclick = () => switchSplit('vertical');
  if (splitHorizontalBtn) splitHorizontalBtn.onclick = () => switchSplit('horizontal');
  if (splitOffBtn) splitOffBtn.onclick = () => switchSplit('single');
  if (toggleTreeBtn) toggleTreeBtn.onclick = () => {
    if (window.innerWidth <= MOBILE_MINI_BREAKPOINT) {
      mobileMiniSidebarOpen = false;
      applyAppLayout();
      return;
    }
    layoutPrefs.showSidebar = !layoutPrefs.showSidebar;
    saveLayoutPrefs();
    applyAppLayout();
  };
  if (toggleCalendarBtn) toggleCalendarBtn.onclick = () => {
    if (window.innerWidth <= MOBILE_MINI_BREAKPOINT) {
      mobileMiniCalendarOpen = false;
      applyAppLayout();
      return;
    }
    layoutPrefs.showCalendar = !layoutPrefs.showCalendar;
    saveLayoutPrefs();
    applyAppLayout();
  };
  if (showTreeBar) showTreeBar.onclick = () => {
    if (window.innerWidth <= MOBILE_MINI_BREAKPOINT) {
      mobileMiniSidebarOpen = true;
      mobileMiniCalendarOpen = false;
      applyAppLayout();
      return;
    }
    layoutPrefs.showSidebar = true;
    saveLayoutPrefs();
    applyAppLayout();
  };
  if (showCalendarBar) showCalendarBar.onclick = () => {
    if (window.innerWidth <= MOBILE_MINI_BREAKPOINT) {
      mobileMiniCalendarOpen = true;
      mobileMiniSidebarOpen = false;
      applyAppLayout();
      return;
    }
    layoutPrefs.showCalendar = true;
    saveLayoutPrefs();
    applyAppLayout();
  };
  if (sidebarToolbarBtn) sidebarToolbarBtn.onclick = () => {
    if (window.innerWidth <= MOBILE_MINI_BREAKPOINT) {
      mobileMiniSidebarOpen = !mobileMiniSidebarOpen;
      if (mobileMiniSidebarOpen) mobileMiniCalendarOpen = false;
      applyAppLayout();
      return;
    }
    layoutPrefs.showSidebar = !layoutPrefs.showSidebar;
    saveLayoutPrefs();
    applyAppLayout();
  };
  if (calendarToolbarBtn) calendarToolbarBtn.onclick = () => {
    if (window.innerWidth <= MOBILE_MINI_BREAKPOINT) {
      mobileMiniCalendarOpen = !mobileMiniCalendarOpen;
      if (mobileMiniCalendarOpen) mobileMiniSidebarOpen = false;
      applyAppLayout();
      return;
    }
    if (window.innerWidth <= 1100) return;
    layoutPrefs.showCalendar = !layoutPrefs.showCalendar;
    saveLayoutPrefs();
    applyAppLayout();
  };

  if (editorA) editorA.addEventListener('focus', () => {
    activePane = 'a';
  });
  if (editorB) editorB.addEventListener('focus', () => {
    activePane = 'b';
  });
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
  if (goalLockBtn) goalLockBtn.onclick = () => {
    const key = todayKey();
    const locked = !!state.goalLockedByDate[key];
    state.goalLockedByDate[key] = !locked;
    saveState();
    updateGoalLockUI();
  };
  if (calendarViewBtn) calendarViewBtn.onclick = () => setCalendarViewMode('calendar');
  if (calendarTableViewBtn) calendarTableViewBtn.onclick = () => setCalendarViewMode('table');

  if (historyBtn) historyBtn.onclick = () => {
    renderHistory();
    const dlg = $('history-dialog');
    if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
  };
  if (historyCloseBtn) historyCloseBtn.onclick = () => {
    const dlg = $('history-dialog');
    if (dlg && typeof dlg.close === 'function') dlg.close();
  };

  const closeExportMenu = () => {
    if (!exportMenu || !exportBtn) return;
    exportMenu.classList.add('hidden');
    exportBtn.setAttribute('aria-expanded', 'false');
  };
  const openExportMenu = () => {
    if (!exportMenu || !exportBtn) return;
    exportMenu.classList.remove('hidden');
    exportBtn.setAttribute('aria-expanded', 'true');
  };

  if (exportBtn && exportMenu) {
    exportBtn.onclick = (e) => {
      e.stopPropagation();
      if (exportMenu.classList.contains('hidden')) openExportMenu();
      else closeExportMenu();
    };
    exportMenu.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', closeExportMenu);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeExportMenu();
    });
  }

  if (exportTxtBtn) exportTxtBtn.onclick = () => {
    exportTxt();
    closeExportMenu();
  };
  if (exportPdfBtn) exportPdfBtn.onclick = () => {
    exportPdf();
    closeExportMenu();
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
  if (syncNowBtn) syncNowBtn.onclick = handleManualSync;
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === '\\') switchSplit('vertical');
    if (e.altKey && e.key === '-') switchSplit('horizontal');
  });

  document.addEventListener('click', (e) => {
    if (window.innerWidth > MOBILE_MINI_BREAKPOINT) return;
    const sidebar = $('sidebar');
    const statsPanel = document.querySelector('.stats-panel');
    const showTreeBarBtn = $('show-tree-bar');
    const sidebarToolbar = $('toggle-sidebar-toolbar-btn');
    const calendarToolbar = $('toggle-calendar-toolbar-btn');
    if (sidebar && sidebar.contains(e.target)) return;
    if (statsPanel && statsPanel.contains(e.target)) return;
    if (showTreeBarBtn && showTreeBarBtn.contains(e.target)) return;
    if (sidebarToolbar && sidebarToolbar.contains(e.target)) return;
    if (calendarToolbar && calendarToolbar.contains(e.target)) return;
    if (!mobileMiniSidebarOpen && !mobileMiniCalendarOpen) return;
    mobileMiniSidebarOpen = false;
    mobileMiniCalendarOpen = false;
    applyAppLayout();
  });
}

function bindSidebarResize() {
  const leftHandle = $('sidebar-resizer');
  const rightHandle = $('calendar-resizer');
  const app = $('app');
  if (!leftHandle || !rightHandle || !app) return;

  let draggingLeft = false;
  let draggingRight = false;
  const saved = Number(safeGetItem('we-sidebar-width') || 240);
  if (!Number.isNaN(saved)) sidebarWidth = Math.max(180, Math.min(520, saved));
  const savedCalendar = Number(safeGetItem('we-calendar-width') || 260);
  if (!Number.isNaN(savedCalendar)) calendarWidth = Math.max(220, Math.min(520, savedCalendar));

  leftHandle.addEventListener('mousedown', (e) => {
    if (!layoutPrefs.showSidebar) return;
    e.preventDefault();
    draggingLeft = true;
    document.body.style.userSelect = 'none';
  });
  rightHandle.addEventListener('mousedown', (e) => {
    const isCompact = window.innerWidth <= 1100;
    if (isCompact || !layoutPrefs.showCalendar) return;
    e.preventDefault();
    draggingRight = true;
    document.body.style.userSelect = 'none';
  });
  window.addEventListener('mousemove', (e) => {
    if (!draggingLeft && !draggingRight) return;
    if (draggingLeft) {
      sidebarWidth = Math.max(180, Math.min(520, e.clientX));
    }
    if (draggingRight) {
      const appRect = app.getBoundingClientRect();
      const next = appRect.right - e.clientX;
      calendarWidth = Math.max(220, Math.min(520, next));
    }
    applyAppLayout();
  });
  window.addEventListener('mouseup', () => {
    if (!draggingLeft && !draggingRight) return;
    draggingLeft = false;
    draggingRight = false;
    document.body.style.userSelect = '';
    safeSetItem('we-sidebar-width', String(sidebarWidth));
    safeSetItem('we-calendar-width', String(calendarWidth));
  });
  window.addEventListener('resize', applyAppLayout);
  applyAppLayout();
}

async function init() {
  try {
    setAuthStatus('로그인/회원가입 또는 익명으로 시작을 선택하세요.');

    const config = getEffectiveSupabaseConfig();
    if ($('sb-url')) $('sb-url').value = config && config.url ? config.url : '';
    if ($('sb-anon')) $('sb-anon').value = config && config.anon ? config.anon : '';

    bindEvents();
    bindSidebarResize();
    ensureHistoryAutoSaveInterval();
    renderAll();

    if (timerRef) clearInterval(timerRef);
    timerRef = null;
    ensureTimerInterval();

    const ok = await setupSupabase();
    if (!ok) {
      handleSignedOut();
      setAuthStatus('서비스 설정 오류: 관리자에게 문의하세요.');
    }
  } catch (error) {
    const msg = error && error.message ? error.message : '알 수 없는 오류';
    setAuthStatus(`초기화 오류: ${msg}`);
  }
}

window.addEventListener('error', (event) => {
  setAuthStatus(`오류: ${event.message}`);
});

window.addEventListener('unhandledrejection', (event) => {
  const msg = event && event.reason && event.reason.message
    ? event.reason.message
    : String((event && event.reason) || '알 수 없는 비동기 오류');
  setAuthStatus(`오류: ${msg}`);
});

let __weBooted = false;
function safeInit() {
  if (__weBooted) return;
  const required = ['auth-status', 'auth-save-config', 'auth-signup', 'auth-login', 'auth-anon-login'];
  const ready = required.every((id) => !!$(id));
  if (!ready) return;
  __weBooted = true;
  ensureAuthGateBindings();
  init();
}

ensureAuthGateBindings();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', safeInit, { once: true });
} else {
  safeInit();
}

