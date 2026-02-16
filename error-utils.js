(function initErrorUtils(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ErrorUtils = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function getErrorMessage(errorLike) {
    return String((errorLike && errorLike.message) || errorLike || '').trim();
  }

  function isLikelyNetworkError(errorLike) {
    const msg = getErrorMessage(errorLike).toLowerCase();
    return msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch') || msg.includes('timeout');
  }

  function buildSyncFailureMessage(errorLike) {
    if (isLikelyNetworkError(errorLike)) {
      return '동기화 실패: 네트워크 연결을 확인할 수 없습니다. 연결 후 다시 시도하세요.';
    }
    return '동기화 실패: 서버 저장에 실패했습니다. 잠시 후 다시 시도하세요.';
  }

  function buildUpgradeFailureMessage(errorLike) {
    const msg = getErrorMessage(errorLike).toLowerCase();
    if (msg.includes('confirm') || msg.includes('verified')) {
      return '계정 전환 실패: 인증 정책으로 즉시 로그인이 제한되었습니다. 이메일 인증 후 다시 로그인하세요.';
    }
    if (msg.includes('email') || msg.includes('invalid')) {
      return '계정 전환 실패: 입력한 이메일 형식을 확인하세요.';
    }
    return '계정 전환 실패: 서버 요청이 완료되지 않았습니다. 잠시 후 다시 시도하세요.';
  }

  function buildWithdrawFailureMessage(errorLike) {
    if (isLikelyNetworkError(errorLike)) {
      return '회원 탈퇴 실패: 서버 요청이 완료되지 않았습니다. 잠시 후 다시 시도하세요.';
    }
    return '회원 탈퇴 실패: 계정 확인에 실패했습니다. 이메일과 비밀번호를 다시 확인하세요.';
  }

  return {
    getErrorMessage,
    isLikelyNetworkError,
    buildSyncFailureMessage,
    buildUpgradeFailureMessage,
    buildWithdrawFailureMessage,
  };
}));
