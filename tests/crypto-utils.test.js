const assert = require('assert');
const path = require('path');
const { webcrypto } = require('crypto');

if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.btoa) {
  globalThis.btoa = (input) => Buffer.from(input, 'binary').toString('base64');
}
if (!globalThis.atob) {
  globalThis.atob = (input) => Buffer.from(input, 'base64').toString('binary');
}

const cryptoUtils = require(path.join(__dirname, '..', 'crypto-utils.js'));

async function testEncryptDecryptRoundtrip() {
  const sample = {
    docs: [{ id: 'd1', content: 'hello world' }],
    goalByDate: { '2026-02-16': 1000 },
  };
  const password = 'pass-1234';
  const envelope = await cryptoUtils.encryptValue(sample, password);
  assert.strictEqual(cryptoUtils.isEncryptedEnvelope(envelope), true);
  const decrypted = await cryptoUtils.decryptValue(envelope, password);
  assert.deepStrictEqual(decrypted, sample);
}

async function testWrongPassword() {
  const sample = { a: 1, b: 'x' };
  const envelope = await cryptoUtils.encryptValue(sample, 'correct-password');
  let failed = false;
  try {
    await cryptoUtils.decryptValue(envelope, 'wrong-password');
  } catch (error) {
    failed = true;
    assert.ok(String(error.message || '').includes('복호화'));
  }
  assert.strictEqual(failed, true);
}

async function run() {
  await testEncryptDecryptRoundtrip();
  await testWrongPassword();
  console.log('crypto-utils tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
