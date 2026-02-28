const $ = (id) => document.getElementById(id);

const KEY = 'we-proto-state-v1';
const SB_KEY = 'we-supabase-config-v1';
const LAYOUT_KEY = 'we-layout-prefs-v1';
const LAST_USER_KEY = 'we-last-user-id';
const ENCRYPTION_MIGRATION_KEY = 'we-encryption-migrated-v1';
const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000;
const AUTO_SYNC_RETRY_BASE_MS = 15 * 1000;
const AUTO_SYNC_RETRY_MAX = 3;
const HISTORY_AUTO_SAVE_MS = 10 * 60 * 1000;
const COMMAND_PALETTE_RECENT_LIMIT = 8;
const SUPABASE_SDK_URLS = [
  'vendor/supabase.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
  'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js',
];
const MOBILE_MINI_BREAKPOINT = 900;
const WITHDRAW_CONFIRM_TEXT = '회원탈퇴';
const USERNAME_EMAIL_DOMAIN = 'id.writingeditor.local';
const DEFAULT_SUPABASE_URL = 'https://rvrysnatyimuilarxfft.supabase.co';
const DEFAULT_SUPABASE_ANON = 'sb_publishable_v_aVOb5bAPP3pr1dF7POBQ_qnxCWVho';
const EMBEDDED_SUPABASE_URL = (typeof globalThis !== 'undefined' && globalThis.__WE_SUPABASE_URL__)
  ? String(globalThis.__WE_SUPABASE_URL__).trim()
  : DEFAULT_SUPABASE_URL;
const EMBEDDED_SUPABASE_ANON = (typeof globalThis !== 'undefined' && globalThis.__WE_SUPABASE_ANON__)
  ? String(globalThis.__WE_SUPABASE_ANON__).trim()
  : DEFAULT_SUPABASE_ANON;
const stateApi = (typeof StateUtils !== 'undefined' && StateUtils) ? StateUtils : null;
const cryptoUtils = (typeof CryptoUtils !== 'undefined' && CryptoUtils) ? CryptoUtils : null;
const syncUtils = (typeof SyncUtils !== 'undefined' && SyncUtils) ? SyncUtils : null;
const authService = (typeof AuthService !== 'undefined' && AuthService) ? AuthService : null;
const authConfigService = (typeof AuthConfigService !== 'undefined' && AuthConfigService) ? AuthConfigService : null;
const uiBindings = (typeof UiBindings !== 'undefined' && UiBindings) ? UiBindings : null;
const dialogService = (typeof DialogService !== 'undefined' && DialogService) ? DialogService : null;
const treeService = (typeof TreeService !== 'undefined' && TreeService) ? TreeService : null;
const historyService = (typeof HistoryService !== 'undefined' && HistoryService) ? HistoryService : null;
const timerService = (typeof TimerService !== 'undefined' && TimerService) ? TimerService : null;
const sessionFlowService = (typeof SessionFlowService !== 'undefined' && SessionFlowService) ? SessionFlowService : null;

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

function ensureCalendarCursor() {
  if (calendarCursor && Number.isFinite(calendarCursor.year) && Number.isFinite(calendarCursor.month)) return;
  const now = seoulDateParts();
  calendarCursor = { year: now.year, month: now.month };
}

function shiftCalendarMonth(delta) {
  ensureCalendarCursor();
  const y = Number(calendarCursor.year);
  const m = Number(calendarCursor.month);
  const next = new Date(Date.UTC(y, (m - 1) + Number(delta || 0), 1));
  calendarCursor = {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
  };
  renderCalendar();
  renderCalendarTable();
}

function formatKstTimeLabel(date = new Date()) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

let supabase = null;
let supabaseUser = null;
let authSubscription = null;
let activePane = 'a';
let sidebarWidth = 240;
let calendarWidth = 260;
let autoSyncTimer = null;
let autoSyncRetryCount = 0;
let lastSyncAt = 0;
let hydratingRemoteState = false;
let lastKnownRemoteUpdatedAt = null;
let supabaseSdkPromise = null;
let supabaseSdkError = '';
let showWithdrawOnAuthGate = false;
let mobileMiniSidebarOpen = false;
let mobileMiniCalendarOpen = false;
let calendarViewMode = 'calendar';
let calendarCursor = null;
let editorSplitDragging = false;
let encryptionPasswordCache = '';
let pendingAuthPassword = '';
let pendingEncryptedLocalState = null;
let localEncryptedWriteSeq = 0;
let encryptionUnlockResolver = null;
let commandPaletteSelection = 0;
const dirtyDocIds = new Set();
const layoutPrefs = loadLayoutPrefs();
const state = loadState();
const dialogApi = (
  dialogService
  && typeof dialogService.createDialogApi === 'function'
)
  ? dialogService.createDialogApi({ getById: $ })
  : null;
const treeActions = (
  treeService
  && typeof treeService.createTreeActions === 'function'
)
  ? treeService.createTreeActions({
    state,
    getDoc,
    openInputDialog,
    openConfirmDialog,
    openNoticeDialog,
    addHistoryEntry,
    cloneStateForHistory,
    saveState,
    renderAll,
    renderTree,
    dirtyDocIds,
  })
  : null;
const historyActions = (
  historyService
  && typeof historyService.createHistoryActions === 'function'
)
  ? historyService.createHistoryActions({
    state,
    stateApi,
    getDoc,
    saveState,
    dirtyDocIds,
    historyAutoSaveMs: HISTORY_AUTO_SAVE_MS,
  })
  : null;
const timerActions = (
  timerService
  && typeof timerService.createTimerActions === 'function'
)
  ? timerService.createTimerActions({
    state,
    stateApi,
    todayKey,
    openNoticeDialog,
    saveState,
    updateProgress,
    getById: $,
  })
  : null;
const sessionFlowActions = (
  sessionFlowService
  && typeof sessionFlowService.createSessionFlowActions === 'function'
)
  ? sessionFlowService.createSessionFlowActions({
    getById: $,
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
    getSupabase: () => supabase,
    getSupabaseUser: () => supabaseUser,
    setPendingAuthPassword: (value) => { pendingAuthPassword = value; },
    setShowWithdrawOnAuthGate: (value) => { showWithdrawOnAuthGate = !!value; },
    getShowWithdrawOnAuthGate: () => showWithdrawOnAuthGate,
    getEnsureFreshAuthSession: () => ensureFreshAuthSession,
    closeUpgradeDialog,
    closeWithdrawDialog,
    getWithDrawConfirmText: () => WITHDRAW_CONFIRM_TEXT,
  })
  : null;

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

function logServiceEvent(scope, payload = {}) {
  try {
    console.info('[service]', scope, payload);
  } catch (_error) {
    // noop
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
  if (stateApi && typeof stateApi.defaultState === 'function') {
    return stateApi.defaultState();
  }
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
  if (stateApi && typeof stateApi.normalizeState === 'function') {
    return stateApi.normalizeState(raw);
  }
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
  if (!Array.isArray(merged.docs) || merged.docs.length === 0) merged.docs = base.docs;
  if (!Array.isArray(merged.folders)) merged.folders = [];
  if (!Array.isArray(merged.historyEntries)) merged.historyEntries = [];
  if (!['single', 'vertical', 'horizontal'].includes(merged.split)) merged.split = 'single';
  merged.activeDocA = (merged.docs.find((d) => d.id === merged.activeDocA) || merged.docs[0]).id;
  if (merged.activeDocB && !merged.docs.some((d) => d.id === merged.activeDocB)) merged.activeDocB = null;
  merged.pomodoro.running = !!(merged.pomodoro && merged.pomodoro.running);
  return merged;
}

function loadState() {
  try {
    const saved = JSON.parse(safeGetItem(KEY) || 'null');
    if (canUseDataEncryption() && cryptoUtils.isEncryptedEnvelope(saved)) {
      pendingEncryptedLocalState = saved;
      return defaultState();
    }
    return normalizeState(saved);
  } catch (_error) {
    return defaultState();
  }
}

function canUseDataEncryption() {
  return !!(
    cryptoUtils
    && typeof cryptoUtils.encryptValue === 'function'
    && typeof cryptoUtils.decryptValue === 'function'
    && typeof cryptoUtils.isEncryptedEnvelope === 'function'
    && globalThis.crypto
    && globalThis.crypto.subtle
  );
}

function encryptionRequiredForUser(user) {
  return !!(user && !isAnonymousUser(user));
}

function shouldEncryptCurrentState() {
  return !!(
    encryptionRequiredForUser(supabaseUser)
    && canUseDataEncryption()
    && encryptionPasswordCache
  );
}

function persistEncryptedLocalState(nextStateSnapshot) {
  if (!shouldEncryptCurrentState()) return;
  const seq = ++localEncryptedWriteSeq;
  cryptoUtils.encryptValue(nextStateSnapshot, encryptionPasswordCache).then((envelope) => {
    if (seq !== localEncryptedWriteSeq) return;
    if (!safeSetItem(KEY, JSON.stringify(envelope))) {
      setAuthStatus('로컬 암호화 저장 실패: 브라우저 저장소를 확인하세요.');
      return;
    }
    if (supabaseUser && supabaseUser.id) markEncryptionMigrated(supabaseUser.id);
  }).catch((error) => {
    const msg = error && error.message ? error.message : '알 수 없는 오류';
    setAuthStatus(`로컬 암호화 저장 실패: ${msg}`);
  });
}

function saveState(options = {}) {
  if (encryptionRequiredForUser(supabaseUser) && canUseDataEncryption() && !encryptionPasswordCache) {
    setAuthStatus('암호화 잠금 해제 필요: 로그인 비밀번호를 다시 입력하세요.');
    return;
  }
  if (shouldEncryptCurrentState()) {
    const snapshot = JSON.parse(JSON.stringify(state));
    persistEncryptedLocalState(snapshot);
  } else if (!safeSetItem(KEY, JSON.stringify(state))) {
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
  pendingEncryptedLocalState = null;
  localEncryptedWriteSeq += 1;
}

function loadSupabaseConfig() {
  try {
    return JSON.parse(safeGetItem(SB_KEY) || 'null');
  } catch (_error) {
    return null;
  }
}

function loadEncryptionMigrationMap() {
  try {
    const raw = JSON.parse(safeGetItem(ENCRYPTION_MIGRATION_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch (_error) {
    return {};
  }
}

function markEncryptionMigrated(userId) {
  if (!userId) return;
  const next = loadEncryptionMigrationMap();
  next[userId] = {
    migratedAt: new Date().toISOString(),
  };
  safeSetItem(ENCRYPTION_MIGRATION_KEY, JSON.stringify(next));
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

function normalizeUsername(raw) {
  return String(raw || '').trim().toLowerCase();
}

function isValidUsername(username) {
  return /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$/.test(username);
}

function usernameToSyntheticEmail(username) {
  return `${username}@${USERNAME_EMAIL_DOMAIN}`;
}

function isSyntheticEmail(email) {
  const v = String(email || '').toLowerCase();
  return v.endsWith(`@${USERNAME_EMAIL_DOMAIN}`);
}

function resolveIdentifier(inputRaw) {
  const input = String(inputRaw || '').trim();
  if (!input) {
    return { ok: false, message: '아이디를 입력하세요.' };
  }
  if (input.includes('@')) {
    return { ok: true, email: input, username: '' };
  }
  const username = normalizeUsername(input);
  if (!isValidUsername(username)) {
    return { ok: false, message: '아이디 형식이 올바르지 않습니다. (영문/숫자, 3~32자, ._- 허용)' };
  }
  return { ok: true, email: usernameToSyntheticEmail(username), username };
}

function resolveDisplayIdentity(user) {
  if (!user || isAnonymousUser(user)) return '익명로그인';
  const fromMeta = user.user_metadata && typeof user.user_metadata.username === 'string'
    ? normalizeUsername(user.user_metadata.username)
    : '';
  if (fromMeta && isValidUsername(fromMeta)) return fromMeta;
  const email = String(user.email || '');
  if (isSyntheticEmail(email)) return email.split('@')[0];
  return email || '일반로그인';
}

async function openConfirmDialog(options = {}) {
  if (dialogApi && typeof dialogApi.confirm === 'function') {
    return dialogApi.confirm(options);
  }
  return false;
}

async function openInputDialog(options = {}) {
  if (dialogApi && typeof dialogApi.input === 'function') {
    return dialogApi.input(options);
  }
  return null;
}

async function openNoticeDialog(options = {}) {
  if (dialogApi && typeof dialogApi.notice === 'function') {
    return dialogApi.notice(options);
  }
}

async function openChoiceDialog(options = {}) {
  if (dialogApi && typeof dialogApi.choice === 'function') {
    return dialogApi.choice(options);
  }
  return 'cancel';
}

function resolveAuthResultMessage(flow, result) {
  const reason = result && result.reason ? result.reason : '';
  if (flow === 'signup') {
    if (reason === 'IDENTIFIER_TAKEN') return '이미 사용 중인 아이디입니다.';
    if (reason === 'WEAK_PASSWORD') return '비밀번호 정책을 확인하세요. (길이/복잡도 부족)';
    if (reason === 'INVALID_IDENTIFIER') return '아이디 형식을 다시 확인하세요.';
    if (reason === 'RATE_LIMIT') return '요청이 너무 많습니다. 잠시 후 다시 시도하세요.';
    if (reason === 'NETWORK') return '네트워크 오류입니다. 연결을 확인한 뒤 다시 시도하세요.';
    return '회원가입에 실패했습니다. 잠시 후 다시 시도하세요.';
  }
  if (flow === 'login') {
    if (reason === 'INVALID_CREDENTIALS') return '아이디 또는 비밀번호가 올바르지 않습니다.';
    if (reason === 'INVALID_IDENTIFIER') return '아이디 형식을 다시 확인하세요.';
    if (reason === 'RATE_LIMIT') return '로그인 시도가 많습니다. 잠시 후 다시 시도하세요.';
    if (reason === 'NETWORK') return '네트워크 오류입니다. 연결을 확인한 뒤 다시 시도하세요.';
    return '로그인에 실패했습니다. 잠시 후 다시 시도하세요.';
  }
  if (flow === 'withdraw-reauth') {
    if (reason === 'INVALID_CREDENTIALS') return '탈퇴 확인 실패: 아이디 또는 비밀번호가 올바르지 않습니다.';
    if (reason === 'NETWORK') return '탈퇴 확인 실패: 네트워크 상태를 확인하고 다시 시도하세요.';
    return '탈퇴 확인 실패: 계정 인증에 실패했습니다.';
  }
  return '요청 처리에 실패했습니다.';
}

function openEncryptionUnlockDialog(message = '데이터 암호 해제를 위해 로그인 비밀번호를 입력하세요.') {
  const dlg = $('encryption-unlock-dialog');
  const copy = $('encryption-unlock-copy');
  const input = $('encryption-unlock-password');
  if (!dlg || !input || typeof dlg.showModal !== 'function') return false;
  if (copy) copy.textContent = message;
  input.value = '';
  if (typeof dlg.showModal === 'function') dlg.showModal();
  setTimeout(() => input.focus(), 0);
  return true;
}

function closeEncryptionUnlockDialog() {
  const dlg = $('encryption-unlock-dialog');
  if (!dlg || typeof dlg.close !== 'function') return;
  dlg.close();
}

function settleEncryptionUnlockResolver(value) {
  if (!encryptionUnlockResolver) return;
  const resolve = encryptionUnlockResolver;
  encryptionUnlockResolver = null;
  resolve(value || '');
}

async function requestEncryptionPassword() {
  const opened = openEncryptionUnlockDialog();
  if (!opened) return '';
  return new Promise((resolve) => {
    encryptionUnlockResolver = resolve;
  });
}

async function ensureEncryptionUnlocked(user) {
  if (!encryptionRequiredForUser(user)) {
    encryptionPasswordCache = '';
    pendingAuthPassword = '';
    return true;
  }
  if (!canUseDataEncryption()) {
    setAuthStatus('이 브라우저는 데이터 암호화를 지원하지 않습니다.');
    return false;
  }
  if (encryptionPasswordCache) return true;

  const candidate = pendingAuthPassword || await requestEncryptionPassword();
  pendingAuthPassword = '';
  if (!candidate) {
    setAuthStatus('암호화 잠금 해제를 취소했습니다.');
    return false;
  }
  encryptionPasswordCache = candidate;
  return true;
}

async function tryHydratePendingEncryptedLocalState() {
  if (!pendingEncryptedLocalState || !encryptionPasswordCache || !canUseDataEncryption()) return;
  try {
    const decrypted = await cryptoUtils.decryptValue(pendingEncryptedLocalState, encryptionPasswordCache);
    replaceState(decrypted);
    pendingEncryptedLocalState = null;
    renderAll();
  } catch (error) {
    const msg = error && error.message ? error.message : '알 수 없는 오류';
    setAuthStatus(`로컬 암호화 데이터 복호화 실패: ${msg}`);
  }
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
            expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 0),
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
          expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 0),
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
          expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 0),
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
    async refreshSession() {
      const session = readSession();
      if (!session || !session.refresh_token) {
        return { data: { session: null }, error: makeError('refresh token이 없습니다.') };
      }
      try {
        const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: apiHeaders(false),
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return { data: { session: null }, error: makeError(data.error_description || data.msg || data.message || `HTTP ${res.status}`, res.status) };
        }
        const next = {
          access_token: data.access_token || session.access_token,
          refresh_token: data.refresh_token || session.refresh_token,
          expires_in: data.expires_in,
          expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 0),
          token_type: data.token_type || session.token_type,
          user: data.user || session.user,
        };
        writeSession(next);
        notify('TOKEN_REFRESHED', next);
        return { data: { session: next }, error: null };
      } catch (error) {
        return { data: { session: null }, error: makeError(error && error.message ? error.message : '세션 갱신 요청 실패') };
      }
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

  const delay = (
    syncUtils
    && typeof syncUtils.computeAutoSyncDelay === 'function'
  )
    ? syncUtils.computeAutoSyncDelay(lastSyncAt, AUTO_SYNC_INTERVAL_MS)
    : Math.max(0, AUTO_SYNC_INTERVAL_MS - (Date.now() - lastSyncAt));
  if (delay > 0) {
    const minutes = Math.ceil(delay / 60000);
    setSyncStatus(`자동 동기화 예약 (${minutes}분 후)`, 'idle');
  }

  autoSyncTimer = setTimeout(async () => {
    autoSyncTimer = null;
    const ok = await pushRemoteState({ reason: 'auto', allowRetry: true });
    if (!ok) scheduleAutoSyncRetry();
  }, delay);
}

function scheduleAutoSyncRetry() {
  if (autoSyncTimer) return;
  if (autoSyncRetryCount >= AUTO_SYNC_RETRY_MAX) {
    setSyncStatus('자동 동기화 재시도 한도 초과: 수동 동기화를 실행하세요.', 'error');
    return;
  }
  autoSyncRetryCount += 1;
  const retryDelay = (
    syncUtils
    && typeof syncUtils.computeRetryDelayMs === 'function'
  )
    ? syncUtils.computeRetryDelayMs(autoSyncRetryCount, AUTO_SYNC_RETRY_BASE_MS)
    : AUTO_SYNC_RETRY_BASE_MS * Math.pow(2, autoSyncRetryCount - 1);
  const sec = Math.round(retryDelay / 1000);
  setSyncStatus(`자동 동기화 재시도 예정 (${sec}초 후, ${autoSyncRetryCount}/${AUTO_SYNC_RETRY_MAX})`, 'pending');
  autoSyncTimer = setTimeout(async () => {
    autoSyncTimer = null;
    const ok = await pushRemoteState({ reason: 'auto-retry', allowRetry: true });
    if (!ok) scheduleAutoSyncRetry();
  }, retryDelay);
}

async function pushRemoteState(options = {}) {
  const allowRetry = options.allowRetry !== false;
  if (!supabase || !supabaseUser || hydratingRemoteState) {
    setSyncStatus('로그인 필요', 'idle');
    return false;
  }
  const fresh = await ensureFreshAuthSession();
  if (!fresh.ok) {
    setSyncStatus(`동기화 중단: 세션 확인 실패 (${fresh.message})`, 'error');
    return false;
  }
  if (fresh.user && fresh.user.id) supabaseUser = fresh.user;

  const { data: remoteMeta, error: remoteMetaError } = await supabase
    .from('editor_states')
    .select('updated_at')
    .eq('user_id', supabaseUser.id)
    .maybeSingle();
  if (remoteMetaError) {
    showUiError('sync', remoteMetaError, { auth: false, sync: true, logContext: 'sync preflight meta read failed' });
    return false;
  }
  const remoteUpdatedAt = remoteMeta && remoteMeta.updated_at ? remoteMeta.updated_at : null;
  const hasConflict = (
    syncUtils
    && typeof syncUtils.hasRemoteConflict === 'function'
  )
    ? syncUtils.hasRemoteConflict(remoteUpdatedAt, lastKnownRemoteUpdatedAt)
    : !!(
      remoteUpdatedAt
      && lastKnownRemoteUpdatedAt
      && new Date(remoteUpdatedAt).getTime() > new Date(lastKnownRemoteUpdatedAt).getTime()
    );
  if (hasConflict) {
    const conflictMsg = `원격 변경 감지: 다른 기기에서 ${new Date(remoteUpdatedAt).toLocaleString()}에 수정되었습니다.`;
    const conflictAction = await openChoiceDialog({
      title: '동기화 충돌 감지',
      message: `${conflictMsg}\n어떤 상태를 유지할지 선택하세요.`,
      choices: {
        primary: { label: '로컬로 덮어쓰기', value: 'overwrite_remote' },
        secondary: { label: '원격 상태 불러오기', value: 'keep_remote' },
        cancel: { label: '동기화 취소', value: 'cancel' },
      },
    });
    if (conflictAction === 'keep_remote') {
      await pullRemoteState();
      setSyncStatus('충돌 감지: 최신 원격 상태를 불러왔습니다.', 'ok');
      return false;
    }
    if (conflictAction !== 'overwrite_remote') {
      setSyncStatus('동기화를 취소했습니다.', 'idle');
      return false;
    }
  }

  setSyncStatus('클라우드 동기화 중…', 'pending');
  let statePayload = JSON.parse(JSON.stringify(state));
  if (encryptionRequiredForUser(supabaseUser)) {
    if (!canUseDataEncryption()) {
      setSyncStatus('동기화 중단: 이 브라우저는 데이터 암호화를 지원하지 않습니다.', 'error');
      return false;
    }
    if (!encryptionPasswordCache) {
      setSyncStatus('동기화 중단: 암호화 잠금 해제가 필요합니다.', 'error');
      return false;
    }
    try {
      statePayload = await cryptoUtils.encryptValue(statePayload, encryptionPasswordCache);
    } catch (error) {
      const msg = error && error.message ? error.message : '알 수 없는 오류';
      setSyncStatus(`동기화 중단: 암호화 실패 (${msg})`, 'error');
      return false;
    }
  }
  const payload = {
    user_id: supabaseUser.id,
    state_json: statePayload,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('editor_states').upsert(payload, { onConflict: 'user_id' });
  if (error) {
    showUiError('sync', error, { auth: false, sync: true, logContext: 'sync upsert failed' });
    if (!allowRetry) autoSyncRetryCount = 0;
    return false;
  }
  lastSyncAt = Date.now();
  autoSyncRetryCount = 0;
  lastKnownRemoteUpdatedAt = payload.updated_at;
  setSyncStatus(`클라우드 동기화 완료\n${formatKstTimeLabel(new Date())}`, 'ok');
  if (supabaseUser && supabaseUser.id && encryptionRequiredForUser(supabaseUser) && shouldEncryptCurrentState()) {
    markEncryptionMigrated(supabaseUser.id);
  }
  return true;
}

async function pullRemoteState() {
  if (!supabase || !supabaseUser) return;
  const fresh = await ensureFreshAuthSession();
  if (!fresh.ok) {
    setSyncStatus(`동기화 중단: 세션 확인 실패 (${fresh.message})`, 'error');
    return;
  }
  if (fresh.user && fresh.user.id) supabaseUser = fresh.user;

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
    let nextState = data.state_json;
    const encrypted = canUseDataEncryption() && cryptoUtils.isEncryptedEnvelope(nextState);
    if (encrypted) {
      if (!encryptionPasswordCache) {
        setSyncStatus('암호화 데이터 잠김: 로그인 비밀번호를 다시 입력하세요.', 'error');
        return;
      }
      try {
        nextState = await cryptoUtils.decryptValue(nextState, encryptionPasswordCache);
      } catch (error) {
        const msg = error && error.message ? error.message : '알 수 없는 오류';
        setSyncStatus(`클라우드 복호화 실패: ${msg}`, 'error');
        return;
      }
    }
    hydratingRemoteState = true;
    replaceState(nextState);
    saveState({ skipRemote: true });
    hydratingRemoteState = false;
    renderAll();
    lastKnownRemoteUpdatedAt = data.updated_at || null;
    safeSetItem(LAST_USER_KEY, String(supabaseUser.id || ''));
    setSyncStatus(`클라우드 상태 불러옴 (${new Date(data.updated_at).toLocaleString()})`, 'ok');
    if (encryptionRequiredForUser(supabaseUser) && !encrypted) {
      setSyncStatus('평문 클라우드 상태 감지: 암호화로 마이그레이션 중…', 'pending');
      await pushRemoteState({ reason: 'migration', allowRetry: false });
    }
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
  await pushRemoteState({ reason: 'pull-empty-seed', allowRetry: false });
}

async function handleSignedIn(user) {
  supabaseUser = user;
  const unlocked = await ensureEncryptionUnlocked(user);
  if (!unlocked) {
    if (supabase && supabase.auth && typeof supabase.auth.signOut === 'function') {
      await supabase.auth.signOut();
    }
    return;
  }
  await tryHydratePendingEncryptedLocalState();
  applyAuthState(user);
  await pullRemoteState();
}

function handleSignedOut() {
  supabaseUser = null;
  encryptionPasswordCache = '';
  pendingAuthPassword = '';
  settleEncryptionUnlockResolver('');
  closeEncryptionUnlockDialog();
  lastKnownRemoteUpdatedAt = null;
  dirtyDocIds.clear();
  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
    autoSyncTimer = null;
  }
  lastSyncAt = 0;
  setSyncStatus('로그인 필요', 'idle');
  applyAuthState(null);
}

async function setupSupabase(options = {}) {
  const config = options.config || getEffectiveSupabaseConfig();
  if (authConfigService && typeof authConfigService.setupSupabaseRuntime === 'function') {
    const result = await authConfigService.setupSupabaseRuntime({
      config,
      persistConfig: saveSupabaseConfig,
      ensureSdkLoaded: ensureSupabaseSdkLoaded,
      getSdkCreateClient: () => (
        window.supabase && window.supabase.createClient
          ? ((url, anon) => window.supabase.createClient(url, anon))
          : null
      ),
      createCompatClient: createSupabaseCompatClient,
      sdkErrorMessage: supabaseSdkError,
      previousAuthSubscription: authSubscription,
      onSignedIn: handleSignedIn,
      onSignedOut: handleSignedOut,
    });
    if (!result.ok) {
      logServiceEvent('auth-config.setup.failed', { code: result.code, message: result.message });
      setAuthStatus(result.message || 'Supabase 초기화 실패');
      return false;
    }
    logServiceEvent('auth-config.setup.ok', { code: result.code, hasStatus: !!result.statusMessage });
    supabase = result.supabase;
    authSubscription = result.authSubscription;
    if (result.statusMessage) setAuthStatus(result.statusMessage);
    if (result.authHookErrorMessage) setAuthStatus(result.authHookErrorMessage);
    return true;
  }
  if (!config || !config.url || !config.anon) {
    setAuthStatus('Supabase 설정이 없습니다. 관리자 설정 주입 또는 설정 저장을 완료하세요.');
    return false;
  }
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
  const showTreeBar = $('show-tree-bar');
  const showCalendarBar = $('show-calendar-bar');
  if (user) {
    gate.classList.add('hidden');
    app.style.display = 'block';
    $('user-email').textContent = resolveDisplayIdentity(user);
    $('auth-status').textContent = '로그인됨';
    if (logoutBtn) {
      const isAnon = isAnonymousUser(user);
      logoutBtn.textContent = isAnon ? '로그아웃(자동 탈퇴)' : '로그아웃';
      logoutBtn.title = isAnon ? '익명 계정은 로그아웃 시 자동으로 회원탈퇴됩니다.' : '로그아웃';
      logoutBtn.setAttribute('aria-label', logoutBtn.textContent);
    }
    if (withdrawBtn) withdrawBtn.classList.add('hidden');
    if (upgradeBtn) upgradeBtn.classList.toggle('hidden', !isAnonymousUser(user));
    applyAppLayout();
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
    if (showTreeBar) showTreeBar.classList.add('hidden');
    if (showCalendarBar) showCalendarBar.classList.add('hidden');
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

  tree.appendChild(mk(' 📄 새 문서 생성', '', () => createDoc(null), [], null, null));
  tree.appendChild(mk(' 📁 새 폴더 생성', '', () => createFolder(null), [], null, null));
  renderBranch(null, tree);
}

function getFolder(folderId) {
  if (treeActions && typeof treeActions.getFolder === 'function') {
    return treeActions.getFolder(folderId);
  }
  return state.folders.find((f) => f.id === folderId);
}

function getDescendantFolderIds(folderId) {
  if (treeActions && typeof treeActions.getDescendantFolderIds === 'function') {
    return treeActions.getDescendantFolderIds(folderId);
  }
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

async function renameDoc(docId) {
  if (treeActions && typeof treeActions.renameDoc === 'function') {
    return treeActions.renameDoc(docId);
  }
  return undefined;
}

async function renameFolder(folderId) {
  if (treeActions && typeof treeActions.renameFolder === 'function') {
    return treeActions.renameFolder(folderId);
  }
  return undefined;
}

function ensureAtLeastOneDoc() {
  if (treeActions && typeof treeActions.ensureAtLeastOneDoc === 'function') {
    treeActions.ensureAtLeastOneDoc();
    return;
  }
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

async function deleteDoc(docId) {
  if (treeActions && typeof treeActions.deleteDoc === 'function') {
    return treeActions.deleteDoc(docId);
  }
  return undefined;
}

async function deleteFolder(folderId) {
  if (treeActions && typeof treeActions.deleteFolder === 'function') {
    return treeActions.deleteFolder(folderId);
  }
  return undefined;
}

function moveDocToFolder(docId, folderId) {
  if (treeActions && typeof treeActions.moveDocToFolder === 'function') {
    treeActions.moveDocToFolder(docId, folderId);
  }
}

async function moveFolderToFolder(folderId, targetParentId) {
  if (treeActions && typeof treeActions.moveFolderToFolder === 'function') {
    return treeActions.moveFolderToFolder(folderId, targetParentId);
  }
  return undefined;
}

async function createDoc(folderId) {
  if (treeActions && typeof treeActions.createDoc === 'function') {
    return treeActions.createDoc(folderId);
  }
  return undefined;
}

async function createFolder(parentFolderId = null) {
  if (treeActions && typeof treeActions.createFolder === 'function') {
    return treeActions.createFolder(parentFolderId);
  }
  return undefined;
}

function cloneStateForHistory() {
  if (historyActions && typeof historyActions.cloneStateForHistory === 'function') {
    return historyActions.cloneStateForHistory();
  }
  if (stateApi && typeof stateApi.cloneStateForHistory === 'function') {
    return stateApi.cloneStateForHistory(state);
  }
  const snapshot = JSON.parse(JSON.stringify(state));
  delete snapshot.historyEntries;
  return snapshot;
}

function countParagraphs(text) {
  if (historyActions && typeof historyActions.countParagraphs === 'function') {
    return historyActions.countParagraphs(text);
  }
  return String(text || '')
    .split(/\n\s*\n/g)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .length;
}

function getDocContentFromSnapshot(snapshot, docId) {
  if (historyActions && typeof historyActions.getDocContentFromSnapshot === 'function') {
    return historyActions.getDocContentFromSnapshot(snapshot, docId);
  }
  if (!snapshot || !Array.isArray(snapshot.docs)) return '';
  const target = snapshot.docs.find((doc) => doc && doc.id === docId)
    || snapshot.docs.find((doc) => doc && doc.id === snapshot.activeDocA)
    || snapshot.docs[0];
  return target && typeof target.content === 'string' ? target.content : '';
}

function getHistoryDeltaMeta(snapshot, meta = {}) {
  if (historyActions && typeof historyActions.getHistoryDeltaMeta === 'function') {
    return historyActions.getHistoryDeltaMeta(snapshot, meta);
  }
  const docId = meta.docId || state.activeDocA || null;
  const baseline = Array.isArray(state.historyEntries) && state.historyEntries[0]
    ? state.historyEntries[0].snapshot
    : null;
  const nowText = getDocContentFromSnapshot(snapshot, docId);
  const beforeText = getDocContentFromSnapshot(baseline, docId);
  return {
    charDelta: nowText.length - beforeText.length,
    paraDelta: countParagraphs(nowText) - countParagraphs(beforeText),
  };
}

function formatSignedDelta(value) {
  if (historyActions && typeof historyActions.formatSignedDelta === 'function') {
    return historyActions.formatSignedDelta(value);
  }
  const n = Number(value) || 0;
  if (n > 0) return `+${n}`;
  return String(n);
}

function addHistoryEntry(trigger, meta = {}, snapshotOverride = null) {
  if (historyActions && typeof historyActions.addHistoryEntry === 'function') {
    historyActions.addHistoryEntry(trigger, meta, snapshotOverride);
    return;
  }
  const snapshot = snapshotOverride || cloneStateForHistory();
  const deltaMeta = getHistoryDeltaMeta(snapshot, meta);
  const payloadMeta = { ...meta, ...deltaMeta };
  if (
    stateApi
    && typeof stateApi.createHistoryEntry === 'function'
    && typeof stateApi.prependHistoryEntry === 'function'
  ) {
    const entry = stateApi.createHistoryEntry(trigger, payloadMeta, snapshot);
    state.historyEntries = stateApi.prependHistoryEntry(state.historyEntries, entry, 10);
    return;
  }
  const arr = Array.isArray(state.historyEntries) ? state.historyEntries : [];
  arr.unshift({
    id: Date.now() + Math.floor(Math.random() * 1000),
    savedAt: new Date().toISOString(),
    trigger,
    scope: payloadMeta.scope || 'doc',
    docId: payloadMeta.docId || null,
    docName: payloadMeta.docName || null,
    summary: payloadMeta.summary || '',
    meta: {
      charDelta: payloadMeta.charDelta || 0,
      paraDelta: payloadMeta.paraDelta || 0,
    },
    snapshot,
  });
  state.historyEntries = arr.slice(0, 10);
}

function markDocDirty(docId) {
  if (historyActions && typeof historyActions.markDocDirty === 'function') {
    historyActions.markDocDirty(docId);
    return;
  }
  if (!docId) return;
  dirtyDocIds.add(docId);
}

function flushHistorySnapshots(trigger, options = {}) {
  if (historyActions && typeof historyActions.flushHistorySnapshots === 'function') {
    return historyActions.flushHistorySnapshots(trigger, options);
  }
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
  if (historyActions && typeof historyActions.ensureHistoryAutoSaveInterval === 'function') {
    historyActions.ensureHistoryAutoSaveInterval();
    return;
  }
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
  const splitResizer = $('editor-split-resizer');
  area.className = `editor-area ${state.split}`;
  const isSingle = state.split === 'single';
  $('pane-b').classList.toggle('hidden', isSingle);
  if (splitResizer) splitResizer.classList.toggle('hidden', isSingle);
  applyEditorSplitLayout();

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

function getSplitRatio(mode = state.split) {
  const byMode = state.splitRatioByMode && typeof state.splitRatioByMode === 'object'
    ? state.splitRatioByMode
    : {};
  const raw = Number(byMode[mode]);
  if (!Number.isFinite(raw)) return 50;
  return Math.max(20, Math.min(80, raw));
}

function setSplitRatio(mode, ratio) {
  if (!state.splitRatioByMode || typeof state.splitRatioByMode !== 'object') {
    state.splitRatioByMode = { vertical: 50, horizontal: 50 };
  }
  state.splitRatioByMode[mode] = Math.max(20, Math.min(80, Number(ratio) || 50));
}

function applyEditorSplitLayout() {
  const area = $('editor-area');
  const splitResizer = $('editor-split-resizer');
  if (!area) return;
  area.style.gridTemplateColumns = '';
  area.style.gridTemplateRows = '';
  const forceSingleByViewport = window.innerWidth <= MOBILE_MINI_BREAKPOINT;
  if (splitResizer) splitResizer.classList.toggle('hidden', state.split === 'single' || forceSingleByViewport);
  if (forceSingleByViewport) {
    area.style.gridTemplateColumns = '1fr';
    area.style.gridTemplateRows = '1fr';
    return;
  }
  if (state.split === 'vertical') {
    const ratio = getSplitRatio('vertical');
    area.style.gridTemplateColumns = `minmax(220px, ${ratio}%) 8px minmax(220px, ${100 - ratio}%)`;
    area.style.gridTemplateRows = '1fr';
  } else if (state.split === 'horizontal') {
    const ratio = getSplitRatio('horizontal');
    area.style.gridTemplateColumns = '1fr';
    area.style.gridTemplateRows = `minmax(180px, ${ratio}%) 8px minmax(180px, ${100 - ratio}%)`;
  } else {
    area.style.gridTemplateColumns = '1fr';
    area.style.gridTemplateRows = '1fr';
  }
}

function bindEditorSplitResize() {
  const splitResizer = $('editor-split-resizer');
  const area = $('editor-area');
  if (!splitResizer || !area) return;

  let draggingMode = null;

  const onPointerMove = (e) => {
    if (!editorSplitDragging || !draggingMode) return;
    const rect = area.getBoundingClientRect();
    if (draggingMode === 'vertical') {
      const ratio = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100;
      setSplitRatio('vertical', ratio);
    } else if (draggingMode === 'horizontal') {
      const ratio = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100;
      setSplitRatio('horizontal', ratio);
    }
    applyEditorSplitLayout();
  };

  const onPointerUp = () => {
    if (!editorSplitDragging) return;
    editorSplitDragging = false;
    draggingMode = null;
    document.body.style.userSelect = '';
    saveState();
  };

  splitResizer.addEventListener('pointerdown', (e) => {
    if (window.innerWidth <= MOBILE_MINI_BREAKPOINT) return;
    if (state.split !== 'vertical' && state.split !== 'horizontal') return;
    e.preventDefault();
    editorSplitDragging = true;
    draggingMode = state.split;
    document.body.style.userSelect = 'none';
    try {
      splitResizer.setPointerCapture(e.pointerId);
    } catch (_error) {
      // noop
    }
  });

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('resize', applyEditorSplitLayout);
}

function updateProgress() {
  const a = getDoc(state.activeDocA);
  const b = getDoc(state.activeDocB);
  const text = [a && a.content ? a.content : '', b && b.content ? b.content : ''].join('');
  const actualWithSpaces = text.length;
  const actualNoSpaces = text.replace(/\s/g, '').length;
  const date = todayKey();
  const target = Number(state.goalByDate[date] || 0);
  const goalMetric = getGoalMetric(date);
  const actualForGoal = getActualByGoalMetric(actualWithSpaces, actualNoSpaces, goalMetric);
  const focusSec = Number(state.focusSecondsByDate[date] || 0);

  state.progressByDate[date] = {
    actualChars: actualWithSpaces,
    actualCharsNoSpaces: actualNoSpaces,
    targetChars: target,
    goalMetric,
    goalAchieved: target > 0 && actualForGoal >= target,
  };

  const metricLabel = goalMetric === 'noSpaces' ? '공백 제외' : '공백 포함';
  $('progress-pill').textContent = `${formatNumber(actualForGoal)} / ${formatNumber(target)} (${metricLabel})`;
  $('daily-stats').textContent = `공백 포함: ${formatNumber(actualWithSpaces)}\n공백 제외: ${formatNumber(actualNoSpaces)}\n집중 횟수: ${formatNumber(state.sessionsByDate[date] || 0)}\n집중 시간: ${formatDuration(focusSec)}`;
  renderCalendar();
  renderCalendarTable();
  updateGoalLockUI();
}

function formatNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('ko-KR').format(Math.round(n));
}

function formatDuration(totalSeconds) {
  if (stateApi && typeof stateApi.formatDuration === 'function') {
    return stateApi.formatDuration(totalSeconds);
  }
  const sec = Math.max(0, Number(totalSeconds) || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function isTodayGoalLocked() {
  return !!state.goalLockedByDate[todayKey()];
}

function getGoalMetric(dateKey = todayKey()) {
  if (stateApi && typeof stateApi.getGoalMetric === 'function') {
    return stateApi.getGoalMetric(state.goalMetricByDate, dateKey);
  }
  return state.goalMetricByDate[dateKey] === 'noSpaces' ? 'noSpaces' : 'withSpaces';
}

function getActualByGoalMetric(actualWithSpaces, actualNoSpaces, metric) {
  if (stateApi && typeof stateApi.getActualByGoalMetric === 'function') {
    return stateApi.getActualByGoalMetric(actualWithSpaces, actualNoSpaces, metric);
  }
  return metric === 'noSpaces' ? actualNoSpaces : actualWithSpaces;
}

function updateGoalLockUI() {
  const lockBtn = $('goal-lock-btn');
  const goalInput = $('goal-input');
  const goalNoSpacesCheck = $('goal-no-spaces-check');
  if (!lockBtn || !goalInput) return;
  const locked = isTodayGoalLocked();
  goalInput.classList.toggle('hidden', locked);
  if (goalNoSpacesCheck) goalNoSpacesCheck.disabled = locked;
  lockBtn.textContent = locked ? '목표 고정 해제' : '목표 고정';
  lockBtn.title = locked ? '오늘 목표 글자수 고정을 해제합니다.' : '오늘 목표 글자수를 고정합니다.';
}

function renderCalendar() {
  const box = $('calendar');
  const period = $('calendar-period');
  if (!box) return;
  box.innerHTML = '';

  ensureCalendarCursor();
  const y = calendarCursor.year;
  const m = calendarCursor.month;
  const today = todayKey();
  if (period) period.textContent = `${y}년 ${m}월`;
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  weekdays.forEach((label, idx) => {
    const wd = document.createElement('div');
    wd.className = `day weekday ${idx === 0 ? 'sun' : ''} ${idx === 6 ? 'sat' : ''}`.trim();
    wd.textContent = label;
    box.appendChild(wd);
  });
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  for (let i = 0; i < firstWeekday; i += 1) {
    const empty = document.createElement('div');
    empty.className = 'day empty';
    empty.setAttribute('aria-hidden', 'true');
    box.appendChild(empty);
  }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();

  for (let d = 1; d <= last; d += 1) {
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const rec = state.progressByDate[key];
    const target = Number((rec && rec.targetChars) || state.goalByDate[key] || 0);
    const goalMetric = (rec && rec.goalMetric) || getGoalMetric(key);
    const actualWithSpaces = Number((rec && rec.actualChars) || 0);
    const actualNoSpaces = Number((rec && rec.actualCharsNoSpaces) || 0);
    const actualForGoal = getActualByGoalMetric(actualWithSpaces, actualNoSpaces, goalMetric);
    const achieved = target > 0 && actualForGoal >= target;
    const el = document.createElement('div');
    const isToday = key === today;
    el.className = `day ${achieved ? 'hit' : ''} ${isToday ? 'today' : ''}`.trim();
    el.textContent = d;
    el.title = `${key}\n기준: ${goalMetric === 'noSpaces' ? '공백 제외' : '공백 포함'}\n목표 글자수: ${formatNumber(target)}\n실제 달성(공백 포함): ${formatNumber(actualWithSpaces)}\n실제 달성(공백 제외): ${formatNumber(actualNoSpaces)}`;
    box.appendChild(el);
  }
  const filled = 7 + firstWeekday + last;
  const trailingEmptyCount = (7 - (filled % 7)) % 7;
  for (let i = 0; i < trailingEmptyCount; i += 1) {
    const empty = document.createElement('div');
    empty.className = 'day empty';
    empty.setAttribute('aria-hidden', 'true');
    box.appendChild(empty);
  }
}

function renderCalendarTable() {
  const table = $('calendar-table');
  if (!table) return;
  table.innerHTML = '';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['날짜', '기준', '목표', '공백 포함', '공백 제외', '달성'].forEach((title) => {
    const th = document.createElement('th');
    th.textContent = title;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  ensureCalendarCursor();
  const y = calendarCursor.year;
  const m = calendarCursor.month;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();

  for (let d = 1; d <= last; d += 1) {
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const rec = state.progressByDate[key];
    const target = Number((rec && rec.targetChars) || state.goalByDate[key] || 0);
    const goalMetric = (rec && rec.goalMetric) || getGoalMetric(key);
    const actualWithSpaces = Number((rec && rec.actualChars) || 0);
    const actualNoSpaces = Number((rec && rec.actualCharsNoSpaces) || 0);
    const actualForGoal = getActualByGoalMetric(actualWithSpaces, actualNoSpaces, goalMetric);
    const achieved = target > 0 && actualForGoal >= target;
    const tr = document.createElement('tr');
    const cells = [
      key,
      goalMetric === 'noSpaces' ? '공백 제외' : '공백 포함',
      formatNumber(target),
      formatNumber(actualWithSpaces),
      formatNumber(actualNoSpaces),
      achieved ? '달성' : '-',
    ];
    cells.forEach((value) => {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
}

function setCalendarViewMode(mode) {
  calendarViewMode = mode === 'table' ? 'table' : 'calendar';
  const calendar = $('calendar');
  const tableWrap = $('calendar-table-wrap');
  const modeToggleBtn = $('calendar-mode-toggle-btn');
  if (calendar) calendar.classList.toggle('hidden', calendarViewMode !== 'calendar');
  if (tableWrap) tableWrap.classList.toggle('hidden', calendarViewMode !== 'table');
  if (modeToggleBtn) {
    modeToggleBtn.textContent = calendarViewMode === 'calendar' ? '표 보기' : '달력 보기';
    modeToggleBtn.setAttribute('aria-label', calendarViewMode === 'calendar' ? '표 보기로 전환' : '달력 보기로 전환');
    modeToggleBtn.classList.toggle('active', true);
  }
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
  updatePanelToggleButtons();
}

function ensureUiSubState() {
  if (!state.ui || typeof state.ui !== 'object') state.ui = {};
  if (!state.ui.commandPalette || typeof state.ui.commandPalette !== 'object') {
    state.ui.commandPalette = { enabled: true, recentCommands: [] };
  }
  if (!Array.isArray(state.ui.commandPalette.recentCommands)) state.ui.commandPalette.recentCommands = [];
}

function openHistoryDialog() {
  renderHistory();
  const dlg = $('history-dialog');
  if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
}

function getCommandPaletteCommands() {
  return [
    { id: 'split-single', label: '레이아웃: 단일', shortcut: 'Alt+1', run: () => switchSplit('single') },
    { id: 'split-vertical', label: '레이아웃: 좌우 분할', shortcut: 'Alt+\\', run: () => switchSplit('vertical') },
    { id: 'split-horizontal', label: '레이아웃: 상하 분할', shortcut: 'Alt+-', run: () => switchSplit('horizontal') },
    { id: 'sync-now', label: '지금 동기화', shortcut: '', run: () => handleManualSync() },
    { id: 'history-open', label: '히스토리 열기', shortcut: '', run: () => openHistoryDialog() },
    { id: 'export-txt', label: 'TXT 내보내기', shortcut: '', run: () => exportTxt() },
    { id: 'export-pdf', label: 'PDF 내보내기', shortcut: '', run: () => exportPdf() },
  ];
}

function trackRecentCommand(commandId) {
  ensureUiSubState();
  const list = state.ui.commandPalette.recentCommands.filter((id) => id !== commandId);
  list.unshift(commandId);
  state.ui.commandPalette.recentCommands = list.slice(0, COMMAND_PALETTE_RECENT_LIMIT);
  saveState();
}

function getFilteredCommands() {
  const input = $('command-palette-input');
  const query = input ? String(input.value || '').trim().toLowerCase() : '';
  const commands = getCommandPaletteCommands();
  ensureUiSubState();
  const recent = new Map(
    state.ui.commandPalette.recentCommands.map((id, idx) => [id, idx])
  );
  const filtered = query
    ? commands.filter((cmd) => cmd.label.toLowerCase().includes(query) || cmd.id.includes(query))
    : commands;
  return filtered.sort((a, b) => {
    const ar = recent.has(a.id) ? recent.get(a.id) : Number.POSITIVE_INFINITY;
    const br = recent.has(b.id) ? recent.get(b.id) : Number.POSITIVE_INFINITY;
    return ar - br;
  });
}

function renderCommandPalette() {
  const list = $('command-palette-list');
  if (!list) return;
  list.innerHTML = '';
  const commands = getFilteredCommands();
  if (commandPaletteSelection >= commands.length) commandPaletteSelection = Math.max(0, commands.length - 1);
  commands.forEach((cmd, idx) => {
    const li = document.createElement('li');
    li.className = `command-item ${idx === commandPaletteSelection ? 'active' : ''}`.trim();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = cmd.label;
    btn.onclick = () => runCommandFromPalette(cmd.id);
    const shortcut = document.createElement('span');
    shortcut.className = 'command-shortcut';
    shortcut.textContent = cmd.shortcut || '';
    li.appendChild(btn);
    li.appendChild(shortcut);
    list.appendChild(li);
  });
  if (commands.length === 0) {
    const li = document.createElement('li');
    li.className = 'command-item';
    li.textContent = '검색 결과가 없습니다.';
    list.appendChild(li);
  }
}

function openCommandPalette() {
  ensureUiSubState();
  if (state.ui.commandPalette.enabled === false) return;
  const dlg = $('command-palette-dialog');
  const input = $('command-palette-input');
  if (!dlg || typeof dlg.showModal !== 'function' || !input) return;
  commandPaletteSelection = 0;
  input.value = '';
  renderCommandPalette();
  dlg.showModal();
  setTimeout(() => input.focus(), 0);
}

function closeCommandPalette() {
  const dlg = $('command-palette-dialog');
  if (!dlg || typeof dlg.close !== 'function') return;
  dlg.close();
}

function runCommandFromPalette(commandId) {
  const command = getCommandPaletteCommands().find((cmd) => cmd.id === commandId);
  if (!command) return;
  command.run();
  trackRecentCommand(commandId);
  closeCommandPalette();
}

function exportTxt() {
  const d = getDoc(state.activeDocA);
  if (!d) return;
  const blob = makeUtf8TxtBlob(d.content || '');
  downloadBlob(blob, `${d.name.replace(/\.[^/.]+$/, '')}_${todayKey()}.txt`);
}

async function exportPdf() {
  const d = getDoc(state.activeDocA);
  if (!d) return;

  const container = document.createElement('div');
  container.style.padding = '40px';
  container.style.color = '#1d201b';
  container.style.fontFamily = '"IBM Plex Sans KR", "Pretendard", "Noto Sans KR", sans-serif';

  const h1 = document.createElement('h1');
  h1.textContent = d.name || '문서';
  h1.style.fontSize = '24pt';
  h1.style.marginBottom = '20px';
  h1.style.borderBottom = '1px solid #d2ccbc';
  h1.style.paddingBottom = '10px';

  const pre = document.createElement('pre');
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.fontFamily = '"Iowan Old Style", "Noto Serif KR", serif';
  pre.style.fontSize = '12pt';
  pre.style.lineHeight = '1.8';
  pre.textContent = String(d.content || '');

  container.appendChild(h1);
  container.appendChild(pre);

  const opt = {
    margin: 15,
    filename: `${(d.name || 'document').replace(/\.[^/.]+$/, '')}_${todayKey()}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    // @ts-ignore
    await html2pdf().set(opt).from(container).save();
  } catch (err) {
    console.error('PDF export failed', err);
    await openNoticeDialog({
      title: 'PDF 내보내기 실패',
      message: 'PDF 생성 중 오류가 발생했습니다. 브라우저가 html2pdf 라이브러리를 차단했거나 예상치 못한 오류입니다.',
    });
  }
}

function makeUtf8TxtBlob(text) {
  const encoder = new TextEncoder();
  const contentBytes = encoder.encode(String(text || ''));
  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const bytes = new Uint8Array(bom.length + contentBytes.length);
  bytes.set(bom, 0);
  bytes.set(contentBytes, bom.length);
  return new Blob([bytes], { type: 'text/plain;charset=utf-8' });
}

function downloadBlob(blob, name) {
  const ua = (navigator.userAgent || '').toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);

  if (isIOS) {
    const filename = name || `export_${todayKey()}.txt`;
    // Prefer native share sheet with a real file so iOS users can save to Files.
    if (navigator.share && navigator.canShare) {
      try {
        const file = new File([blob], filename, { type: blob.type || 'text/plain;charset=utf-8' });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: filename }).catch(() => {});
          return;
        }
      } catch (_error) {
        // fall through
      }
    }
    // Fallback: try normal download click first.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.target = '_self';
    document.body.appendChild(a);
    try {
      a.click();
    } finally {
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.target = '_blank';
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}

function renderHistory() {
  const list = $('history-list');
  const preview = $('history-preview');
  if (!list) return;
  list.innerHTML = '';
  if (preview) preview.textContent = '항목을 선택하면 변경량 미리보기가 표시됩니다.';
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
    const meta = h.meta && typeof h.meta === 'object' ? h.meta : {};
    li.textContent = `${new Date(h.savedAt).toLocaleString()} · ${label}${tail ? ` · ${tail}` : ''} · 글자 ${formatSignedDelta(meta.charDelta)} · 문단 ${formatSignedDelta(meta.paraDelta)}`;

    const previewBtn = document.createElement('button');
    previewBtn.textContent = '미리보기';
    previewBtn.onclick = () => {
      if (!preview) return;
      const docLabel = h.docName || h.docId || '문서';
      preview.textContent = [
        `기록: ${label}`,
        `대상: ${docLabel}`,
        `요약: ${tail || '-'}`,
        `변경량: 글자 ${formatSignedDelta(meta.charDelta)}, 문단 ${formatSignedDelta(meta.paraDelta)}`,
      ].join(' · ');
    };

    const restoreBtn = document.createElement('button');
    restoreBtn.textContent = '안전복원';
    restoreBtn.onclick = async () => {
      const shouldRestore = await openConfirmDialog({
        title: '히스토리 복원 확인',
        message: '현재 상태를 백업한 뒤 이 버전으로 복원할까요?',
        confirmText: '복원',
        cancelText: '취소',
      });
      if (!shouldRestore) return;
      const backupSnapshot = cloneStateForHistory();
      const backupMeta = {
        scope: 'full',
        summary: '안전 복원 전 자동 백업',
        ...getHistoryDeltaMeta(backupSnapshot, { scope: 'full' }),
      };
      const backupEntry = (
        stateApi
        && typeof stateApi.createHistoryEntry === 'function'
      )
        ? stateApi.createHistoryEntry('manual-save', backupMeta, backupSnapshot)
        : {
          id: Date.now() + Math.floor(Math.random() * 1000),
          savedAt: new Date().toISOString(),
          trigger: 'manual-save',
          scope: backupMeta.scope,
          docId: null,
          docName: null,
          summary: backupMeta.summary,
          meta: {
            charDelta: backupMeta.charDelta || 0,
            paraDelta: backupMeta.paraDelta || 0,
          },
          snapshot: backupSnapshot,
        };
      const keepHistory = Array.isArray(state.historyEntries) ? [...state.historyEntries] : [];
      replaceState(h.snapshot || {});
      state.historyEntries = [backupEntry, ...keepHistory].slice(0, 10);
      dirtyDocIds.clear();
      saveState();
      renderAll();
      const dlg = $('history-dialog');
      if (dlg && typeof dlg.close === 'function') dlg.close();
    };

    li.appendChild(previewBtn);
    li.appendChild(restoreBtn);
    list.appendChild(li);
  });

  if (entries.length === 0) {
    const li = document.createElement('li');
    li.textContent = '히스토리가 없습니다.';
    list.appendChild(li);
  }
}

function tickTimer() {
  if (timerActions && typeof timerActions.tickTimer === 'function') {
    timerActions.tickTimer();
    return;
  }
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
  if (timerActions && typeof timerActions.ensureTimerInterval === 'function') {
    timerActions.ensureTimerInterval();
    return;
  }
}

function renderTimer() {
  if (timerActions && typeof timerActions.renderTimer === 'function') {
    timerActions.renderTimer();
    return;
  }
  const sec = state.pomodoro.left;
  const mins = getPomodoroMinutes();
  const focusInput = $('pomodoro-focus-min');
  const breakInput = $('pomodoro-break-min');
  if (focusInput) focusInput.value = String(mins.focus);
  if (breakInput) breakInput.value = String(mins.break);
  $('timer-label').textContent = state.pomodoro.mode === 'focus' ? '집중' : '휴식';
  $('timer-display').textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  const toggleBtn = $('timer-toggle');
  if (toggleBtn) toggleBtn.textContent = state.pomodoro.running ? '일시정지' : '시작';
}

function getPomodoroMinutes() {
  if (timerActions && typeof timerActions.getPomodoroMinutes === 'function') {
    return timerActions.getPomodoroMinutes();
  }
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

function applyPomodoroMinutesFromInputs() {
  if (timerActions && typeof timerActions.applyPomodoroMinutesFromInputs === 'function') {
    timerActions.applyPomodoroMinutesFromInputs();
    return;
  }
  const focusInput = $('pomodoro-focus-min');
  const breakInput = $('pomodoro-break-min');
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

function renderAll() {
  renderTree();
  renderEditors();
  renderTimer();
  updateProgress();
  $('goal-input').value = state.goalByDate[todayKey()] || '';
  if ($('goal-no-spaces-check')) $('goal-no-spaces-check').checked = getGoalMetric(todayKey()) === 'noSpaces';
  updateGoalLockUI();
  setCalendarViewMode(calendarViewMode);
}

async function handleManualSync() {
  flushHistorySnapshots('manual-sync', { includeFullSync: true, onlyFullSync: true });
  autoSyncRetryCount = 0;
  await pushRemoteState({ reason: 'manual', allowRetry: false });
}

async function authSignUp() {
  if (sessionFlowActions && typeof sessionFlowActions.authSignUp === 'function') {
    return sessionFlowActions.authSignUp();
  }
  if (!authService || typeof authService.signUpWithIdentifier !== 'function') {
    setAuthStatus('회원가입 기능을 초기화하지 못했습니다. 새로고침 후 다시 시도하세요.');
    return;
  }
  if (!supabase) {
    setAuthStatus('먼저 설정 저장을 눌러 Supabase 연결을 초기화하세요.');
    return;
  }
  const idRaw = $('auth-email').value.trim();
  const password = $('auth-password').value;
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
  if (sessionFlowActions && typeof sessionFlowActions.authLogin === 'function') {
    return sessionFlowActions.authLogin();
  }
  if (!authService || typeof authService.loginWithIdentifier !== 'function') {
    setAuthStatus('로그인 기능을 초기화하지 못했습니다. 새로고침 후 다시 시도하세요.');
    return;
  }
  if (!supabase) {
    setAuthStatus('먼저 설정 저장을 눌러 Supabase 연결을 초기화하세요.');
    return;
  }
  const idRaw = $('auth-email').value.trim();
  const password = $('auth-password').value;
  pendingAuthPassword = password || '';
  const result = await authService.loginWithIdentifier({
    supabase,
    idRaw,
    password,
    resolveIdentifier,
  });
  if (!result.ok) {
    logServiceEvent('auth.login.failed', { code: result.code });
    pendingAuthPassword = '';
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
  if (sessionFlowActions && typeof sessionFlowActions.authAnonymousLogin === 'function') {
    return sessionFlowActions.authAnonymousLogin();
  }
  if (!authService || typeof authService.anonymousLogin !== 'function') {
    setAuthStatus('익명 로그인 기능을 초기화하지 못했습니다. 새로고침 후 다시 시도하세요.');
    return;
  }
  pendingAuthPassword = '';
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
  if (sessionFlowActions && typeof sessionFlowActions.openUpgradeDialog === 'function') {
    sessionFlowActions.openUpgradeDialog();
    return;
  }
  const dlg = $('upgrade-dialog');
  const emailInput = $('upgrade-email');
  const passwordInput = $('upgrade-password');
  if (!dlg || !supabaseUser || !isAnonymousUser(supabaseUser)) return;
  if (emailInput) emailInput.value = '';
  if (passwordInput) passwordInput.value = '';
  if (typeof dlg.showModal === 'function') dlg.showModal();
}

function closeUpgradeDialog() {
  if (sessionFlowActions && typeof sessionFlowActions.closeUpgradeDialog === 'function') {
    sessionFlowActions.closeUpgradeDialog();
    return;
  }
  const dlg = $('upgrade-dialog');
  if (!dlg || typeof dlg.close !== 'function') return;
  dlg.close();
}

async function upgradeAnonymousAccount() {
  if (sessionFlowActions && typeof sessionFlowActions.upgradeAnonymousAccount === 'function') {
    return sessionFlowActions.upgradeAnonymousAccount();
  }
  if (!authService || typeof authService.upgradeAnonymousAccount !== 'function') {
    setAuthStatus('계정 전환 기능을 초기화하지 못했습니다. 새로고침 후 다시 시도하세요.');
    return;
  }
  const emailInput = $('upgrade-email');
  const passwordInput = $('upgrade-password');
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
      pendingAuthPassword = nextPassword || '';
    },
  });
  if (result.closeDialog) closeUpgradeDialog();
  if (result.ok) {
    setAuthStatus('회원가입 완료: 자동 로그인되었습니다.');
    return;
  }
  logServiceEvent('auth.upgrade.failed', { code: result.code });
  pendingAuthPassword = '';
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
  if (sessionFlowActions && typeof sessionFlowActions.authLogout === 'function') {
    return sessionFlowActions.authLogout();
  }
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

  // Ensure latest edits are pushed before sign-out to reduce cross-device data gaps.
  flushHistorySnapshots('manual-sync', { includeFullSync: true, onlyFullSync: true });
  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
    autoSyncTimer = null;
  }
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

  showWithdrawOnAuthGate = true;
  await supabase.auth.signOut();
}

function openWithdrawDialog() {
  if (sessionFlowActions && typeof sessionFlowActions.openWithdrawDialog === 'function') {
    sessionFlowActions.openWithdrawDialog();
    return;
  }
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
  if (sessionFlowActions && typeof sessionFlowActions.closeWithdrawDialog === 'function') {
    sessionFlowActions.closeWithdrawDialog();
    return;
  }
  const dlg = $('withdraw-dialog');
  if (!dlg || typeof dlg.close !== 'function') return;
  dlg.close();
}

function updateWithdrawConfirmState() {
  if (sessionFlowActions && typeof sessionFlowActions.updateWithdrawConfirmState === 'function') {
    sessionFlowActions.updateWithdrawConfirmState();
    return;
  }
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
  if (authService && typeof authService.deleteRemoteStateImmediately === 'function') {
    return authService.deleteRemoteStateImmediately(supabase, userId);
  }
  if (!supabase || !userId) return { error: { message: '삭제 대상 사용자 정보가 없습니다.' } };
  return supabase.from('editor_states').delete().eq('user_id', userId);
}

async function deleteOwnAccountImmediately() {
  if (authService && typeof authService.deleteOwnAccountImmediately === 'function') {
    return authService.deleteOwnAccountImmediately(supabase, 'delete_my_account_rpc_v3');
  }
  if (!supabase || typeof supabase.rpc !== 'function') {
    return { error: { message: '계정 삭제 RPC를 사용할 수 없습니다.' } };
  }
  return supabase.rpc('delete_my_account_rpc_v3');
}

function isJwtExpiredError(errorLike) {
  if (authService && typeof authService.isJwtExpiredError === 'function') {
    return authService.isJwtExpiredError(errorLike);
  }
  const msg = String((errorLike && errorLike.message) || errorLike || '').toLowerCase();
  return msg.includes('jwt') && msg.includes('expired');
}

async function ensureFreshAuthSession() {
  if (authService && typeof authService.ensureFreshAuthSession === 'function') {
    return authService.ensureFreshAuthSession(supabase);
  }
  if (!supabase || !supabase.auth || typeof supabase.auth.getSession !== 'function') {
    return { ok: false, message: '세션 확인 기능을 사용할 수 없습니다.' };
  }
  const sessionResult = await supabase.auth.getSession();
  if (sessionResult && sessionResult.error) {
    return { ok: false, message: sessionResult.error.message || '세션 확인 실패' };
  }
  const session = sessionResult && sessionResult.data ? sessionResult.data.session : null;
  const user = session && session.user ? session.user : null;
  if (!user || !user.id) return { ok: false, message: '세션 사용자 확인 실패' };
  return { ok: true, user };
}

async function executeAccountDeletionFlow(user, options = {}) {
  if (authService && typeof authService.executeAccountDeletionFlow === 'function') {
    return authService.executeAccountDeletionFlow({
      user,
      deleteRemoteState: (userId) => deleteRemoteStateImmediately(userId),
      deleteOwnAccount: () => deleteOwnAccountImmediately(),
      ensureFreshSession: () => ensureFreshAuthSession(),
      isJwtExpiredErrorFn: isJwtExpiredError,
      onMissingUser: () => {
        setAuthStatus('삭제 대상 사용자 확인에 실패했습니다.');
        setSyncStatus('탈퇴 중단: 사용자 확인 실패', 'error');
      },
      onStart: () => {
        setAuthStatus('회원 탈퇴 처리 중... 절대 창을 닫지 마세요.');
        setSyncStatus('회원 탈퇴 처리 중…', 'pending');
      },
      onRemoteStateDeleteError: (error) => {
        showUiError('withdraw', error, {
          auth: true,
          sync: true,
          logContext: 'withdraw deleteRemoteState failed',
        });
      },
      onDeleteAccountError: (error) => {
        showUiError('withdraw', error, {
          auth: true,
          sync: true,
          logContext: 'withdraw delete account rpc failed',
        });
        if ((error.message || '').includes('delete_my_account')) {
          void openNoticeDialog({
            title: '회원 탈퇴 실패',
            message: '서버 설정이 완료되지 않았습니다. 관리자에게 문의하세요.',
          });
        }
      },
      onSuccess: async () => {
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
          await openNoticeDialog({
            title: '회원 탈퇴 완료',
            message: '회원 탈퇴가 완료되었습니다. 계정과 데이터는 영구 삭제되었으며 복구할 수 없습니다.',
          });
        }
      },
    });
  }

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
      await openNoticeDialog({
        title: '회원 탈퇴 실패',
        message: '서버 설정이 완료되지 않았습니다. 관리자에게 문의하세요.',
      });
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
    await openNoticeDialog({
      title: '회원 탈퇴 완료',
      message: '회원 탈퇴가 완료되었습니다. 계정과 데이터는 영구 삭제되었으며 복구할 수 없습니다.',
    });
  }
  return true;
}

async function authWithdraw() {
  if (sessionFlowActions && typeof sessionFlowActions.authWithdraw === 'function') {
    return sessionFlowActions.authWithdraw();
  }
  if (!supabase) {
    setAuthStatus('먼저 설정 저장을 눌러 Supabase 연결을 초기화하세요.');
    return;
  }
  if (!authService || typeof authService.resolveWithdrawTargetUser !== 'function') {
    setAuthStatus('탈퇴 확인 기능을 초기화하지 못했습니다. 새로고침 후 다시 시도하세요.');
    setSyncStatus('탈퇴 중단: 인증 서비스 초기화 실패', 'error');
    return;
  }
  const requiresCredentialReauth = !(supabaseUser && isAnonymousUser(supabaseUser));
  const emailInput = $('withdraw-email');
  const passwordInput = $('withdraw-password');
  const inputEmail = emailInput ? emailInput.value.trim() : '';
  const inputPassword = passwordInput ? passwordInput.value : '';
  if (requiresCredentialReauth) setAuthStatus('탈퇴 계정 확인을 위해 재로그인 중...');
  const verify = await authService.resolveWithdrawTargetUser({
    supabase,
    supabaseUser,
    requiresCredentialReauth,
    inputEmail,
    inputPassword,
    resolveIdentifier,
    ensureFreshSessionFn: (client) => ensureFreshAuthSession(client),
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

async function saveAuthConfigAndInit() {
  const urlInput = $('sb-url');
  const anonInput = $('sb-anon');
  const embedded = getEmbeddedSupabaseConfig();
  const resolvedConfig = (authConfigService && typeof authConfigService.resolveConfigForSave === 'function')
    ? authConfigService.resolveConfigForSave({
      urlInputValue: urlInput && urlInput.value ? urlInput.value : '',
      anonInputValue: anonInput && anonInput.value ? anonInput.value : '',
      embeddedConfig: embedded,
    })
    : (() => {
      const url = (urlInput && urlInput.value ? urlInput.value.trim() : '') || (embedded ? embedded.url : '');
      const anon = (anonInput && anonInput.value ? anonInput.value.trim() : '') || (embedded ? embedded.anon : '');
      return (url && anon) ? { ok: true, url, anon } : { ok: false, code: 'missing_config' };
    })();
  if (!resolvedConfig.ok) {
    logServiceEvent('auth-config.resolve.failed', { code: resolvedConfig.code || 'missing_config' });
    setAuthStatus('관리자 Supabase 설정이 누락되었습니다.');
    return;
  }

  setAuthStatus('설정 저장 및 연결 확인 중...');

  try {
    const ok = await setupSupabase({ config: { url: resolvedConfig.url, anon: resolvedConfig.anon } });
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
  const splitSingleBtn = $('split-single-btn');
  const splitVerticalBtn = $('split-vertical-btn');
  const splitHorizontalBtn = $('split-horizontal-btn');
  const mobileDocBtn = $('mobile-doc-btn');
  const mobileCalendarBtn = $('mobile-calendar-btn');
  const isMobileMini = window.innerWidth <= MOBILE_MINI_BREAKPOINT;
  const showSidebar = isMobileMini ? mobileMiniSidebarOpen : !!layoutPrefs.showSidebar;
  const showCalendar = isMobileMini ? mobileMiniCalendarOpen : !!layoutPrefs.showCalendar;

  if (treeBtn) {
    treeBtn.textContent = '✕';
    treeBtn.title = '닫기';
    treeBtn.setAttribute('aria-label', '문서 목록 닫기');
  }
  if (calendarBtn) {
    calendarBtn.textContent = '✕';
    calendarBtn.title = '닫기';
    calendarBtn.setAttribute('aria-label', '달력 패널 닫기');
  }
  if (sidebarToolbarBtn) {
    sidebarToolbarBtn.classList.toggle('active', showSidebar);
    sidebarToolbarBtn.title = showSidebar ? '문서 목록 닫기' : '문서 목록 열기';
  }
  if (calendarToolbarBtn) {
    calendarToolbarBtn.textContent = '📊';
    calendarToolbarBtn.disabled = false;
    calendarToolbarBtn.classList.toggle('active', showCalendar);
    calendarToolbarBtn.title = showCalendar ? '기록 패널 닫기' : '기록 패널 열기';
  }
  if (mobileDocBtn) {
    mobileDocBtn.textContent = showSidebar ? '문서 닫기' : '문서';
    mobileDocBtn.setAttribute('aria-label', showSidebar ? '문서 목록 닫기' : '문서 목록 열기');
    mobileDocBtn.classList.toggle('active', showSidebar);
  }
  if (mobileCalendarBtn) {
    mobileCalendarBtn.textContent = showCalendar ? '기록 닫기' : '기록';
    mobileCalendarBtn.setAttribute('aria-label', showCalendar ? '기록 패널 닫기' : '기록 패널 열기');
    mobileCalendarBtn.classList.toggle('active', showCalendar);
  }
  if (splitSingleBtn) {
    splitSingleBtn.classList.toggle('active', state.split === 'single');
    splitSingleBtn.setAttribute('aria-label', '단일 레이아웃');
  }
  if (splitVerticalBtn) {
    splitVerticalBtn.classList.toggle('active', state.split === 'vertical');
    splitVerticalBtn.setAttribute('aria-label', '좌우 분할 레이아웃');
  }
  if (splitHorizontalBtn) {
    splitHorizontalBtn.classList.toggle('active', state.split === 'horizontal');
    splitHorizontalBtn.setAttribute('aria-label', '상하 분할 레이아웃');
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
  const mobileActionBar = $('mobile-action-bar');
  const backdrop = $('panel-backdrop');
  if (!app || !sidebar || !sidebarResizer || !calendarResizer || !statsPanel) return;

  const isMobileMini = window.innerWidth <= MOBILE_MINI_BREAKPOINT;
  const showSidebar = isMobileMini ? mobileMiniSidebarOpen : !!layoutPrefs.showSidebar;
  const showCalendar = isMobileMini ? mobileMiniCalendarOpen : !!layoutPrefs.showCalendar;

  document.body.classList.toggle('mobile-mini', isMobileMini);
  document.body.classList.toggle('mobile-mini-calendar-open', isMobileMini && showCalendar);
  sidebar.classList.toggle('hidden-panel', !showSidebar);
  sidebarResizer.classList.toggle('hidden-panel', !showSidebar);
  calendarResizer.classList.toggle('hidden-panel', !showCalendar);
  statsPanel.classList.toggle('hidden-panel', !showCalendar);

  // Backdrop: show when any overlay is open (desktop) or mobile drawer is open
  if (backdrop) {
    const anyOpen = showSidebar || showCalendar;
    backdrop.classList.toggle('active', anyOpen);
  }

  if (showTreeBar) {
    showTreeBar.classList.add('hidden');
  }
  if (showCalendarBar) {
    showCalendarBar.classList.add('hidden');
  }
  if (mobileActionBar) {
    mobileActionBar.classList.toggle('hidden', !isMobileMini);
  }

  // Sidebar/stats are fixed overlays — no grid columns needed
  app.style.gridTemplateColumns = '';
  app.style.paddingLeft = '';
  app.style.paddingRight = '';

  // Update toolbar document title
  const docTitleEl = $('toolbar-doc-title');
  if (docTitleEl && state && state.activeDocA) {
    const activeDoc = getDoc(state.activeDocA);
    docTitleEl.textContent = activeDoc && activeDoc.name ? activeDoc.name : '새 문서';
  }

  updatePanelToggleButtons();
}

function bindEvents() {
  initAuthGateBindings();
  if (!uiBindings || typeof uiBindings.bindUiEvents !== 'function') {
    const editorA = $('editor-a');
    const editorB = $('editor-b');
    const logoutBtn = $('logout-btn');
    if (editorA) editorA.addEventListener('input', (e) => updateEditorPane('a', e.target.value));
    if (editorB) editorB.addEventListener('input', (e) => updateEditorPane('b', e.target.value));
    if (logoutBtn) logoutBtn.onclick = authLogout;
    logServiceEvent('ui-bindings.missing', { fallback: true });
    return;
  }
  uiBindings.bindUiEvents({
    $,
    MOBILE_MINI_BREAKPOINT,
    layoutPrefs,
    saveLayoutPrefs,
    applyAppLayout,
    getMobileMiniState: () => ({
      sidebarOpen: mobileMiniSidebarOpen,
      calendarOpen: mobileMiniCalendarOpen,
    }),
    setMobileMiniState: ({ sidebarOpen, calendarOpen }) => {
      mobileMiniSidebarOpen = !!sidebarOpen;
      mobileMiniCalendarOpen = !!calendarOpen;
    },
    setActivePane: (pane) => {
      activePane = pane;
    },
    updateEditorPane,
    isTodayGoalLocked,
    todayKey,
    state,
    saveState,
    updateProgress,
    getGoalMetric,
    updateGoalLockUI,
    setCalendarViewMode,
    getCalendarViewMode: () => calendarViewMode,
    shiftCalendarMonth,
    closeHistoryDialog: () => {
      const dlg = $('history-dialog');
      if (dlg && typeof dlg.close === 'function') dlg.close();
    },
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
    getCommandPaletteSelection: () => commandPaletteSelection,
    setCommandPaletteSelection: (value) => {
      commandPaletteSelection = value;
    },
    switchSplit,
  });

  // Backdrop click: close all open overlays
  const backdrop = $('panel-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', () => {
      const isMobileMini = window.innerWidth <= MOBILE_MINI_BREAKPOINT;
      if (isMobileMini) {
        mobileMiniSidebarOpen = false;
        mobileMiniCalendarOpen = false;
      } else {
        layoutPrefs.showSidebar = false;
        layoutPrefs.showCalendar = false;
        saveLayoutPrefs();
      }
      applyAppLayout();
    });
  }

  // Sidebar close button
  const sidebarCloseBtn = $('sidebar-close-btn');
  if (sidebarCloseBtn) {
    sidebarCloseBtn.addEventListener('click', () => {
      const isMobileMini = window.innerWidth <= MOBILE_MINI_BREAKPOINT;
      if (isMobileMini) {
        mobileMiniSidebarOpen = false;
      } else {
        layoutPrefs.showSidebar = false;
        saveLayoutPrefs();
      }
      applyAppLayout();
    });
  }

  // Stats panel close button
  const panelCloseBtn = $('panel-close-btn');
  if (panelCloseBtn) {
    panelCloseBtn.addEventListener('click', () => {
      const isMobileMini = window.innerWidth <= MOBILE_MINI_BREAKPOINT;
      if (isMobileMini) {
        mobileMiniCalendarOpen = false;
      } else {
        layoutPrefs.showCalendar = false;
        saveLayoutPrefs();
      }
      applyAppLayout();
    });
  }
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
    // Panels are fixed overlays — no resize drag needed
    return;
    if (!layoutPrefs.showSidebar) return;
    e.preventDefault();
    draggingLeft = true;
    document.body.style.userSelect = 'none';
  });
  rightHandle.addEventListener('mousedown', (e) => {
    // Panels are fixed overlays — no resize drag needed
    return;
    if (!layoutPrefs.showCalendar) return;
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
    bindEditorSplitResize();
    bindSidebarResize();
    ensureHistoryAutoSaveInterval();
    renderAll();

    if (timerActions && typeof timerActions.resetTimerInterval === 'function') {
      timerActions.resetTimerInterval();
    }
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
