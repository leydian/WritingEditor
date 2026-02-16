(function initCryptoUtils(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.CryptoUtils = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const ENC_VERSION = 1;
  const DEFAULT_ITERATIONS = 210000;

  function ensureWebCrypto() {
    if (!globalThis.crypto || !globalThis.crypto.subtle) {
      throw new Error('Web Crypto API를 사용할 수 없습니다.');
    }
    return globalThis.crypto.subtle;
  }

  function toBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  function fromBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function randomBytes(length) {
    const arr = new Uint8Array(length);
    globalThis.crypto.getRandomValues(arr);
    return arr;
  }

  async function deriveAesKey(password, saltBytes, iterations) {
    const subtle = ensureWebCrypto();
    const keyMaterial = await subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey'],
    );
    return subtle.deriveKey(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: saltBytes,
        iterations,
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  function isEncryptedEnvelope(value) {
    return !!(
      value
      && typeof value === 'object'
      && value.__enc_v === ENC_VERSION
      && typeof value.alg === 'string'
      && typeof value.kdf === 'string'
      && typeof value.iter === 'number'
      && typeof value.salt === 'string'
      && typeof value.iv === 'string'
      && typeof value.ct === 'string'
    );
  }

  async function encryptValue(value, password, options = {}) {
    if (!password) throw new Error('암호화 비밀번호가 비어 있습니다.');
    const subtle = ensureWebCrypto();
    const salt = options.saltBase64 ? fromBase64(options.saltBase64) : randomBytes(16);
    const iv = randomBytes(12);
    const iterations = Number(options.iterations) || DEFAULT_ITERATIONS;
    const key = await deriveAesKey(password, salt, iterations);
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const encrypted = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return {
      __enc_v: ENC_VERSION,
      alg: 'AES-GCM',
      kdf: 'PBKDF2-SHA-256',
      iter: iterations,
      salt: toBase64(salt),
      iv: toBase64(iv),
      ct: toBase64(new Uint8Array(encrypted)),
    };
  }

  async function decryptValue(envelope, password) {
    if (!isEncryptedEnvelope(envelope)) {
      throw new Error('암호화 포맷이 올바르지 않습니다.');
    }
    if (!password) throw new Error('복호화 비밀번호가 비어 있습니다.');
    const subtle = ensureWebCrypto();
    const salt = fromBase64(envelope.salt);
    const iv = fromBase64(envelope.iv);
    const ciphertext = fromBase64(envelope.ct);
    const iterations = Number(envelope.iter) || DEFAULT_ITERATIONS;
    const key = await deriveAesKey(password, salt, iterations);
    let plainBytes;
    try {
      const decrypted = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
      plainBytes = new Uint8Array(decrypted);
    } catch (_error) {
      throw new Error('복호화에 실패했습니다. 비밀번호를 확인하세요.');
    }
    try {
      return JSON.parse(new TextDecoder().decode(plainBytes));
    } catch (_error) {
      throw new Error('복호화 결과를 JSON으로 파싱할 수 없습니다.');
    }
  }

  return {
    ENC_VERSION,
    DEFAULT_ITERATIONS,
    isEncryptedEnvelope,
    encryptValue,
    decryptValue,
  };
}));
