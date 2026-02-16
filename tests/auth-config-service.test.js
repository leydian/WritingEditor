const assert = require('assert');
const path = require('path');

const authConfigService = require(path.join(__dirname, '..', 'auth-config-service.js'));

function testResolveConfigForSave() {
  const missing = authConfigService.resolveConfigForSave({
    urlInputValue: '',
    anonInputValue: '',
    embeddedConfig: null,
  });
  assert.strictEqual(missing.ok, false);
  assert.strictEqual(missing.code, 'missing_config');

  const embedded = authConfigService.resolveConfigForSave({
    urlInputValue: '',
    anonInputValue: '',
    embeddedConfig: { url: ' https://x.supabase.co ', anon: ' anon ' },
  });
  assert.strictEqual(embedded.ok, true);
  assert.strictEqual(embedded.url, 'https://x.supabase.co');
  assert.strictEqual(embedded.anon, 'anon');
}

async function testSetupSupabaseRuntime() {
  let unsubscribed = false;
  let signedInUserId = '';
  let signedOutCount = 0;

  const result = await authConfigService.setupSupabaseRuntime({
    config: { url: 'https://x.supabase.co', anon: 'anon-key' },
    persistConfig: () => true,
    ensureSdkLoaded: async () => true,
    getSdkCreateClient: () => (() => ({
      auth: {
        async getSession() {
          return { data: { session: { user: { id: 'u1' } } }, error: null };
        },
        onAuthStateChange(cb) {
          cb('SIGNED_IN', { user: { id: 'u2' } });
          return { data: { subscription: { unsubscribe() {} } } };
        },
      },
    })),
    createCompatClient: () => {
      throw new Error('compat should not be called');
    },
    sdkErrorMessage: '',
    previousAuthSubscription: {
      unsubscribe() { unsubscribed = true; },
    },
    onSignedIn: async (user) => { signedInUserId = user.id; },
    onSignedOut: () => { signedOutCount += 1; },
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(unsubscribed, true);
  assert.strictEqual(signedInUserId, 'u1');
  assert.strictEqual(signedOutCount, 0);
}

async function testSetupSupabaseRuntimeFallbackClient() {
  const result = await authConfigService.setupSupabaseRuntime({
    config: { url: 'https://x.supabase.co', anon: 'anon-key' },
    persistConfig: () => true,
    ensureSdkLoaded: async () => false,
    getSdkCreateClient: () => null,
    createCompatClient: () => ({
      auth: {
        async getSession() {
          return { data: { session: null }, error: null };
        },
        onAuthStateChange() {
          return { data: { subscription: null } };
        },
      },
    }),
    sdkErrorMessage: 'fetch',
    previousAuthSubscription: null,
    onSignedIn: async () => {},
    onSignedOut: () => {},
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(typeof result.statusMessage, 'string');
  assert.strictEqual(result.statusMessage.includes('대체 모드'), true);
}

async function testSetupSupabaseRuntimeSdkLateReady() {
  let lookedUpAfterEnsure = false;
  let ensureDone = false;
  const result = await authConfigService.setupSupabaseRuntime({
    config: { url: 'https://x.supabase.co', anon: 'anon-key' },
    persistConfig: () => true,
    ensureSdkLoaded: async () => {
      ensureDone = true;
      return true;
    },
    getSdkCreateClient: () => {
      if (ensureDone) lookedUpAfterEnsure = true;
      return () => ({
        auth: {
          async getSession() {
            return { data: { session: null }, error: null };
          },
          onAuthStateChange() {
            return { data: { subscription: null } };
          },
        },
      });
    },
    createCompatClient: () => {
      throw new Error('compat should not be used');
    },
    sdkErrorMessage: '',
    previousAuthSubscription: null,
    onSignedIn: async () => {},
    onSignedOut: () => {},
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(lookedUpAfterEnsure, true);
}

async function run() {
  testResolveConfigForSave();
  await testSetupSupabaseRuntime();
  await testSetupSupabaseRuntimeFallbackClient();
  await testSetupSupabaseRuntimeSdkLateReady();
  console.log('auth-config-service tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
