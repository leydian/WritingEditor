const assert = require('assert');
const path = require('path');

const syncUtils = require(path.join(__dirname, '..', 'sync-utils.js'));

function testComputeAutoSyncDelay() {
  const now = 1_000_000;
  const interval = 30_000;
  assert.strictEqual(syncUtils.computeAutoSyncDelay(now - 5_000, interval, now), 25_000);
  assert.strictEqual(syncUtils.computeAutoSyncDelay(now - 40_000, interval, now), 0);
}

function testComputeRetryDelayMs() {
  assert.strictEqual(syncUtils.computeRetryDelayMs(1, 15_000), 15_000);
  assert.strictEqual(syncUtils.computeRetryDelayMs(2, 15_000), 30_000);
  assert.strictEqual(syncUtils.computeRetryDelayMs(3, 15_000), 60_000);
}

function testHasRemoteConflict() {
  const oldAt = '2026-02-16T00:00:00.000Z';
  const newAt = '2026-02-16T00:05:00.000Z';
  assert.strictEqual(syncUtils.hasRemoteConflict(newAt, oldAt), true);
  assert.strictEqual(syncUtils.hasRemoteConflict(oldAt, newAt), false);
  assert.strictEqual(syncUtils.hasRemoteConflict(null, newAt), false);
}

function run() {
  testComputeAutoSyncDelay();
  testComputeRetryDelayMs();
  testHasRemoteConflict();
  console.log('sync-utils tests passed');
}

run();
