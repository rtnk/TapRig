import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import {
  providerCredentialFingerprint as fingerprintFor,
  readDaemonProviderCredentials as daemonCredentialsFor,
} from './provider-credential-fingerprint.ts';
import type { EnvMap } from '@agent-device/kernel/source-value';
import type { PluginInventoryEntry } from '@agent-device/contracts/plugin-inventory';
import { builtinPluginInventory } from './__tests__/test-utils/builtin-plugin-inventory.ts';
import { pluginHome, selectPluginManifest } from '@agent-device/test-kit';

// A neutral provider whose leases on each backend read the account variables plus that
// backend's own access variables.
const EXAMPLE_BACKENDS = {
  provider: 'example-backends',
  source: 'embedder',
  credentials: {
    variables: ['EXAMPLE_API_KEY', 'EXAMPLE_IOS_TOKEN', 'EXAMPLE_ANDROID_TOKEN'],
    byBackend: {
      'ios-instance': ['EXAMPLE_API_KEY', 'EXAMPLE_IOS_TOKEN'],
      'android-instance': ['EXAMPLE_API_KEY', 'EXAMPLE_ANDROID_TOKEN'],
    },
  },
  state: 'active',
} as const satisfies PluginInventoryEntry;

const inventory = [...(await builtinPluginInventory()), EXAMPLE_BACKENDS];
const providerCredentialFingerprint = (provider: string, env: EnvMap, leaseBackend?: string) =>
  fingerprintFor(provider, env, leaseBackend, inventory);
const readDaemonProviderCredentials = (env: EnvMap, stateDir: string) =>
  daemonCredentialsFor(env, stateDir, inventory);

const BROWSERSTACK_ENV = { BROWSERSTACK_USERNAME: 'user', BROWSERSTACK_ACCESS_KEY: 'key-1' };

test.for([
  ['example-backends', { EXAMPLE_API_KEY: 'key' }, { EXAMPLE_API_KEY: 'key-rotated' }],
  [
    'example-backends',
    { EXAMPLE_API_KEY: 'key' },
    { EXAMPLE_API_KEY: 'key', EXAMPLE_IOS_TOKEN: 'ios-token' },
  ],
  ['browserstack', BROWSERSTACK_ENV, { ...BROWSERSTACK_ENV, BROWSERSTACK_ACCESS_KEY: 'key-2' }],
] as const)('%s fingerprint changes with its credential variables', ([provider, before, after]) => {
  const fingerprint = providerCredentialFingerprint(provider, before);
  expect(fingerprint).toMatch(/^v1:[0-9a-f]{16}$/);
  expect(providerCredentialFingerprint(provider, { ...before })).toBe(fingerprint);
  expect(providerCredentialFingerprint(provider, after)).not.toBe(fingerprint);
});

test('a fingerprint ignores variables the provider does not read and blank values', () => {
  const fingerprint = providerCredentialFingerprint('browserstack', BROWSERSTACK_ENV);
  expect(
    providerCredentialFingerprint('browserstack', {
      ...BROWSERSTACK_ENV,
      EXAMPLE_API_KEY: 'key',
      BROWSERSTACK_WEBDRIVER_ENDPOINT: 'https://hub.example',
    }),
  ).toBe(fingerprint);
});

test.for(['example-backends', 'browserstack'])(
  'neither a caller nor a daemon without %s credentials has a fingerprint',
  (provider) => {
    expect(providerCredentialFingerprint(provider, {})).toBe(undefined);
    expect(
      providerCredentialFingerprint(provider, { EXAMPLE_API_KEY: ' ', BROWSERSTACK_USERNAME: ' ' }),
    ).toBe(undefined);
    expect(readDaemonProviderCredentials({}, '/state').fingerprint(provider)).toBe(undefined);
  },
);

test('a fingerprint hashes the exact values each provider reads', () => {
  const browserstack = providerCredentialFingerprint('browserstack', BROWSERSTACK_ENV);
  expect(
    providerCredentialFingerprint('browserstack', {
      ...BROWSERSTACK_ENV,
      BROWSERSTACK_ACCESS_KEY: 'key-1 ',
    }),
  ).not.toBe(browserstack);
  const example = providerCredentialFingerprint('example-backends', { EXAMPLE_API_KEY: 'key' });
  expect(providerCredentialFingerprint('example-backends', { EXAMPLE_API_KEY: ' key ' })).not.toBe(
    example,
  );
});

test('a provider name that only matches an inherited object key has no fingerprint', () => {
  const env = { ...pluginHome().env, ...BROWSERSTACK_ENV };
  expect(providerCredentialFingerprint('constructor', env)).toBe(undefined);
});

test('AWS Device Farm has no environment fingerprint', () => {
  const env = { AWS_ACCESS_KEY_ID: 'id' };
  expect(providerCredentialFingerprint('aws-device-farm', env)).toBe(undefined);
  expect(readDaemonProviderCredentials(env, '/state').fingerprint('aws-device-farm')).toBe(
    undefined,
  );
});

test('a fingerprint never contains a credential value', () => {
  const daemon = readDaemonProviderCredentials(
    { ...BROWSERSTACK_ENV, EXAMPLE_API_KEY: 'example-key' },
    '/state',
  );
  const fingerprints = JSON.stringify([
    daemon.fingerprint('browserstack'),
    daemon.fingerprint('example-backends'),
  ]);
  for (const value of ['user', 'key-1', 'example-key']) expect(fingerprints).not.toContain(value);
});

test('a lease fingerprint covers only the leased backend and the account', () => {
  const before = {
    EXAMPLE_API_KEY: 'key',
    EXAMPLE_IOS_TOKEN: 'ios-token',
    EXAMPLE_ANDROID_TOKEN: 'android-token',
  };
  const rotatedAndroid = { ...before, EXAMPLE_ANDROID_TOKEN: 'android-token-2' };
  const ios = (env: Record<string, string>) =>
    providerCredentialFingerprint('example-backends', env, 'ios-instance');
  const android = (env: Record<string, string>) =>
    providerCredentialFingerprint('example-backends', env, 'android-instance');

  expect(ios(rotatedAndroid)).toBe(ios(before));
  expect(android(rotatedAndroid)).not.toBe(android(before));
  expect(ios({ ...before, EXAMPLE_API_KEY: 'key-rotated' })).not.toBe(ios(before));
  expect(providerCredentialFingerprint('example-backends', rotatedAndroid)).not.toBe(
    providerCredentialFingerprint('example-backends', before),
  );
  expect(
    readDaemonProviderCredentials(before, '/state').fingerprint('example-backends', 'ios-instance'),
  ).toBe(ios(rotatedAndroid));
});

function pluginWithCredentialVariables(credentialVariables?: string[], provider = 'example') {
  const { home, env } = pluginHome();
  selectPluginManifest(home, {
    name: '@example/provider',
    version: '1.2.3',
    agentDevicePlugin: { apiVersion: 1, provider, entry: './plugin.js', credentialVariables },
  });
  return env;
}

test('a plugin provider fingerprint hashes the variables its manifest declares', () => {
  const home = pluginWithCredentialVariables(['EXAMPLE_USER', 'EXAMPLE_KEY']);
  const env = { ...home, EXAMPLE_USER: 'user', EXAMPLE_KEY: 'key-1' };
  const fingerprint = providerCredentialFingerprint('example', env);

  expect(fingerprint).toMatch(/^v1:[0-9a-f]{16}$/);
  expect(providerCredentialFingerprint('example', { ...env, UNRELATED: 'x' })).toBe(fingerprint);
  expect(providerCredentialFingerprint('example', { ...env, EXAMPLE_KEY: 'key-2' })).not.toBe(
    fingerprint,
  );
  expect(providerCredentialFingerprint('example', { ...env, EXAMPLE_KEY: 'key-1 ' })).not.toBe(
    fingerprint,
  );
  expect(providerCredentialFingerprint('example', { ...home, EXAMPLE_USER: ' ' })).toBe(undefined);
  expect(readDaemonProviderCredentials(env, '/state').fingerprint('example')).toBe(fingerprint);
});

test('a plugin provider without declared credential variables has no fingerprint', () => {
  const env = { ...pluginWithCredentialVariables(), EXAMPLE_USER: 'user' };
  expect(providerCredentialFingerprint('example', env)).toBe(undefined);
  expect(providerCredentialFingerprint('other', env)).toBe(undefined);
});

test('a plugin declaration never adds a fingerprint to a bundled provider', () => {
  const env = {
    ...pluginWithCredentialVariables(['AWS_ACCESS_KEY_ID'], 'aws-device-farm'),
    AWS_ACCESS_KEY_ID: 'id',
  };
  expect(providerCredentialFingerprint('aws-device-farm', env)).toBe(undefined);
});

function testMuPluginEnv(): Record<string, string> {
  const manifest = path.resolve(import.meta.dirname, '../packages/provider-testmu/package.json');
  const { home, env } = pluginHome();
  selectPluginManifest(home, JSON.parse(fs.readFileSync(manifest, 'utf8')));
  return env;
}

test('the bundled TestMu AI plugin manifest fingerprints its LT credentials', () => {
  const home = testMuPluginEnv();
  const env = { ...home, LT_USERNAME: 'user', LT_ACCESS_KEY: 'key-1' };
  const fingerprint = providerCredentialFingerprint('testmu', env);

  expect(fingerprint).toMatch(/^v1:[0-9a-f]{16}$/);
  expect(providerCredentialFingerprint('testmu', { ...env })).toBe(fingerprint);
  expect(providerCredentialFingerprint('testmu', { ...env, LT_ACCESS_KEY: 'key-2' })).not.toBe(
    fingerprint,
  );
  expect(providerCredentialFingerprint('testmu', home)).toBe(undefined);
  expect(readDaemonProviderCredentials(env, '/state').fingerprint('testmu')).toBe(fingerprint);
  expect(readDaemonProviderCredentials(home, '/state').fingerprint('testmu')).toBe(undefined);
});
