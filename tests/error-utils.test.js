const assert = require('assert');
const path = require('path');

const errorUtils = require(path.join(__dirname, '..', 'error-utils.js'));

function run() {
  assert.strictEqual(errorUtils.getErrorMessage({ message: 'oops' }), 'oops');
  assert.strictEqual(errorUtils.getErrorMessage('x'), 'x');

  assert.strictEqual(errorUtils.isLikelyNetworkError({ message: 'Failed to fetch resource' }), true);
  assert.strictEqual(errorUtils.isLikelyNetworkError({ message: 'HTTP 401' }), false);

  assert.strictEqual(
    errorUtils.buildSyncFailureMessage({ message: 'network timeout' }),
    '동기화 실패: 네트워크 연결을 확인할 수 없습니다. 연결 후 다시 시도하세요.'
  );
  assert.strictEqual(
    errorUtils.buildSyncFailureMessage({ message: 'permission denied' }),
    '동기화 실패: 서버 저장에 실패했습니다. 잠시 후 다시 시도하세요.'
  );

  assert.strictEqual(
    errorUtils.buildUpgradeFailureMessage({ message: 'invalid email format' }),
    '계정 전환 실패: 입력한 이메일 형식을 확인하세요.'
  );
  assert.strictEqual(
    errorUtils.buildUpgradeFailureMessage({ message: 'email not verified, confirm first' }),
    '계정 전환 실패: 인증 정책으로 즉시 로그인이 제한되었습니다. 이메일 인증 후 다시 로그인하세요.'
  );
  assert.strictEqual(
    errorUtils.buildUpgradeFailureMessage({ message: 'server exploded' }),
    '계정 전환 실패: 서버 요청이 완료되지 않았습니다. 잠시 후 다시 시도하세요.'
  );

  assert.strictEqual(
    errorUtils.buildWithdrawFailureMessage({ message: 'fetch timeout' }),
    '회원 탈퇴 실패: 서버 요청이 완료되지 않았습니다. 잠시 후 다시 시도하세요.'
  );
  assert.strictEqual(
    errorUtils.buildWithdrawFailureMessage({ message: 'wrong password' }),
    '회원 탈퇴 실패: 계정 확인에 실패했습니다. 이메일과 비밀번호를 다시 확인하세요.'
  );

  console.log('error-utils tests passed');
}

run();
