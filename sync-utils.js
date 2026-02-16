(function initSyncUtils(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SyncUtils = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function toUnixMs(value) {
    const ts = new Date(value || 0).getTime();
    return Number.isFinite(ts) ? ts : 0;
  }

  function computeAutoSyncDelay(lastSyncAt, intervalMs, nowMs = Date.now()) {
    const elapsed = Math.max(0, Number(nowMs) - Number(lastSyncAt || 0));
    return Math.max(0, Number(intervalMs || 0) - elapsed);
  }

  function computeRetryDelayMs(retryCount, baseMs) {
    const count = Math.max(1, Math.trunc(Number(retryCount) || 1));
    const base = Math.max(0, Math.trunc(Number(baseMs) || 0));
    return base * Math.pow(2, count - 1);
  }

  function hasRemoteConflict(remoteUpdatedAt, lastKnownRemoteUpdatedAt) {
    if (!remoteUpdatedAt || !lastKnownRemoteUpdatedAt) return false;
    return toUnixMs(remoteUpdatedAt) > toUnixMs(lastKnownRemoteUpdatedAt);
  }

  return {
    computeAutoSyncDelay,
    computeRetryDelayMs,
    hasRemoteConflict,
  };
}));
