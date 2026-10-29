import { afterEach, beforeEach, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { connectCommand } from '../cli/commands/connection.ts';
import { runCliCapture } from './cli-capture.ts';
import {
  readActiveConnectionState,
  readRemoteConnectionState,
  type RemoteConnectionState,
} from '@agent-device/remote/remote-connection-state';
import type { AgentDeviceClient } from '../agent-device-client.ts';
import { resolveConnectProviderProfile } from '../cli/connection/connect-provider-adapters.ts';
import { AppError } from '@agent-device/kernel/errors';
import {
  verifyAwsDeviceFarmConnection,
  verifyBrowserStackConnection,
} from '@agent-device/provider-webdriver/connection-verification';
import {
  mkdtempForTestSync,
  bindTestCommandHost,
  createTestHostEnvironment,
} from '@agent-device/test-kit';
import { connectWithGeneratedProviderProfile } from './test-utils/connect-command.ts';

bindTestCommandHost();

vi.mock('@agent-device/provider-webdriver/connection-verification', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@agent-device/provider-webdriver/connection-verification')
  >()),
  verifyBrowserStackConnection: vi.fn(),
  verifyAwsDeviceFarmConnection: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const mockedVerifyBrowserStackConnection = vi.mocked(verifyBrowserStackConnection);
const mockedVerifyAwsDeviceFarmConnection = vi.mocked(verifyAwsDeviceFarmConnection);

beforeEach(() => {
  mockedVerifyBrowserStackConnection.mockImplementation(async (options) => ({
    provider: 'browserstack',
    service: 'BrowserStack',
    verificationMessage: 'Credentials, device, and uploaded app verified.',
    device: {
      status: 'verified',
      name: options.deviceName,
      platform: options.platform,
      osVersion: options.osVersion,
    },
    app: { status: 'verified', reference: options.app },
  }));
  mockedVerifyAwsDeviceFarmConnection.mockImplementation(async (options) => ({
    provider: 'aws-device-farm',
    service: 'AWS Device Farm',
    verificationMessage: 'Credentials, project, and device verified.',
    project: { name: 'Agent Device', reference: options.projectArn },
    device: {
      status: 'verified',
      name: 'iPhone 15',
      reference: options.deviceArn,
      platform: options.platform,
      osVersion: '17',
    },
    app: {
      status: 'missing',
      message:
        'No app upload is attached; AWS Device Farm does not support install after allocation.',
    },
  }));
});

test('connect browserstack generates local provider profile without credentials', async () => {
  const tempRoot = mkdtempForTestSync('agent-device-connect-browserstack-');
  const stateDir = path.join(tempRoot, '.state');
  vi.stubEnv('BROWSERSTACK_USERNAME', 'browser-user');
  vi.stubEnv('BROWSERSTACK_ACCESS_KEY', 'browser-key');

  try {
    await connectWithGeneratedProviderProfile({
      stateDir,
      positionals: ['browserstack'],
      flags: {
        platform: 'android',
        device: 'Google Pixel 8',
        providerOsVersion: '14.0',
        providerApp: 'bs://app-id',
        providerProject: 'agent-device',
        providerBuild: 'build-a',
      },
    });

    const state = readRequiredActiveState(stateDir);
    assert.equal(state.tenant, 'browserstack');
    assert.equal(state.leaseProvider, 'browserstack');
    assert.equal(state.daemon?.baseUrl, undefined);
    assert.match(state.remoteConfigPath, /generated\/browserstack-[a-f0-9]{16}\.json$/);
    const generated = readGeneratedConfig(state.remoteConfigPath);
    assert.equal(generated.providerApp, 'bs://app-id');
    assert.equal(generated.providerOsVersion, '14.0');
    assert.equal(generated.providerProject, 'agent-device');
    assert.equal(generated.providerBuild, 'build-a');
    assert.equal(JSON.stringify(generated).includes('browser-key'), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('connect browserstack canonicalizes the app scheme and refuses a malformed bs:// id', async () => {
  const tempRoot = mkdtempForTestSync('agent-device-connect-browserstack-ref-');
  const stateDir = path.join(tempRoot, '.state');
  vi.stubEnv('BROWSERSTACK_USERNAME', 'browser-user');
  vi.stubEnv('BROWSERSTACK_ACCESS_KEY', 'browser-key');
  const flags = {
    platform: 'android' as const,
    device: 'Google Pixel 8',
    providerOsVersion: '14.0',
  };

  try {
    await connectWithGeneratedProviderProfile({
      stateDir,
      positionals: ['browserstack'],
      flags: { ...flags, providerApp: 'Bs://app-id' },
    });
    assert.equal(
      readGeneratedConfig(readRequiredActiveState(stateDir).remoteConfigPath).providerApp,
      'bs://app-id',
    );
    // Verification must look up the reference the profile saved, not the spelling typed.
    assert.equal(mockedVerifyBrowserStackConnection.mock.calls[0]?.[0].app, 'bs://app-id');

    for (const app of ['bs://', 'bs://a b', 'BS://a/b']) {
      await assert.rejects(
        resolveConnectProviderProfile({
          provider: 'browserstack',
          stateDir,
          cwd: tempRoot,
          env: { BROWSERSTACK_USERNAME: 'browser-user', BROWSERSTACK_ACCESS_KEY: 'browser-key' },
          flags: { json: false, help: false, version: false, ...flags, providerApp: app },
        }),
        (error: unknown) => {
          assert.ok(error instanceof AppError);
          assert.equal(error.code, 'INVALID_ARGS');
          assert.equal(error.message, `BrowserStack --provider-app ${app} is not a bs:// app id.`);
          assert.deepEqual(error.details, {
            providerApp: app,
            hint: 'Pass <bs://app-id-or-local-path>.',
          });
          return true;
        },
      );
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('connect --remote-config verifies a direct provider profile before saving state', async () => {
  const tempRoot = mkdtempForTestSync('agent-device-connect-provider-config-');
  const stateDir = path.join(tempRoot, '.state');
  const remoteConfig = path.join(tempRoot, 'browserstack.remote.json');
  fs.writeFileSync(
    remoteConfig,
    JSON.stringify({
      tenant: 'browserstack',
      runId: 'browserstack-config',
      sessionIsolation: 'tenant',
      leaseProvider: 'browserstack',
      leaseBackend: 'android-instance',
      platform: 'android',
      target: 'mobile',
      device: 'Google Pixel 8',
      providerOsVersion: '14.0',
      providerApp: 'bs://app-id',
    }),
  );
  vi.stubEnv('BROWSERSTACK_USERNAME', 'browser-user');
  vi.stubEnv('BROWSERSTACK_ACCESS_KEY', 'browser-key');

  try {
    await connectWithGeneratedProviderProfile({
      stateDir,
      positionals: [],
      flags: { remoteConfig },
    });

    assert.equal(mockedVerifyBrowserStackConnection.mock.calls.length, 1);
    assert.deepEqual(mockedVerifyBrowserStackConnection.mock.calls[0]?.[0], {
      username: 'browser-user',
      accessKey: 'browser-key',
      platform: 'android',
      deviceName: 'Google Pixel 8',
      osVersion: '14.0',
      app: 'bs://app-id',
    });
    assert.equal(readRequiredActiveState(stateDir).remoteConfigPath, remoteConfig);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('connect browserstack persists a local app artifact as an absolute path', async () => {
  const tempRoot = mkdtempForTestSync('agent-device-connect-browserstack-app-');
  const stateDir = path.join(tempRoot, '.state');
  const appPath = path.join(tempRoot, 'sample.apk');
  fs.writeFileSync(appPath, 'fixture');
  vi.stubEnv('BROWSERSTACK_USERNAME', 'browser-user');
  vi.stubEnv('BROWSERSTACK_ACCESS_KEY', 'browser-key');

  try {
    // The host the command runs in decides what `./sample.apk` is relative to.
    await connectWithGeneratedProviderProfile({
      stateDir,
      host: { env: process.env, cwd: fs.realpathSync(tempRoot) },
      positionals: ['browserstack'],
      flags: {
        platform: 'android',
        device: 'Google Pixel 8',
        providerOsVersion: '14.0',
        providerApp: './sample.apk',
      },
    });

    const state = readRequiredActiveState(stateDir);
    assert.equal(readGeneratedConfig(state.remoteConfigPath).providerApp, fs.realpathSync(appPath));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('connect aws-device-farm generates local provider profile from flags', async () => {
  const tempRoot = mkdtempForTestSync('agent-device-connect-aws-');
  const stateDir = path.join(tempRoot, '.state');

  try {
    await connectWithGeneratedProviderProfile({
      stateDir,
      positionals: ['aws-device-farm'],
      flags: {
        platform: 'ios',
        device: 'Apple iPhone 15',
        awsProjectArn: 'arn:aws:devicefarm:us-west-2:123:project:project-a',
        awsDeviceArn: 'arn:aws:devicefarm:us-west-2::device:device-a',
        awsAppArn: 'arn:aws:devicefarm:us-west-2:123:upload:app-a',
        awsInteractionMode: 'INTERACTIVE',
      },
    });

    const state = readRequiredActiveState(stateDir);
    assert.equal(state.tenant, 'aws-device-farm');
    assert.equal(state.leaseProvider, 'aws-device-farm');
    assert.equal(state.daemon?.baseUrl, undefined);
    assert.match(state.remoteConfigPath, /generated\/aws-device-farm-[a-f0-9]{16}\.json$/);
    const generated = readGeneratedConfig(state.remoteConfigPath);
    assert.equal(generated.awsProjectArn, 'arn:aws:devicefarm:us-west-2:123:project:project-a');
    assert.equal(generated.awsDeviceArn, 'arn:aws:devicefarm:us-west-2::device:device-a');
    assert.equal(generated.awsAppArn, 'arn:aws:devicefarm:us-west-2:123:upload:app-a');
    assert.equal(generated.awsRegion, 'us-west-2');
    assert.equal(generated.awsInteractionMode, 'INTERACTIVE');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('connect JSON exposes verification, device, app, live-session, and next-step state', async () => {
  const result = await runCliCapture(
    [
      'connect',
      'aws-device-farm',
      '--platform',
      'ios',
      '--aws-project-arn',
      'project-arn',
      '--aws-device-arn',
      'device-arn',
      '--json',
    ],
    { stateDirPrefix: 'agent-device-connect-aws-output-' },
  );

  assert.equal(result.code, null);
  const output = (JSON.parse(result.stdout) as { data: Record<string, any> }).data;
  assert.equal(output.verification.status, 'verified');
  assert.equal(output.device.name, 'iPhone 15');
  assert.equal(output.app.status, 'missing');
  assert.equal(output.liveSession.status, 'not-created');
  assert.deepEqual(output.nextSteps, [
    `agent-device connect aws-device-farm --platform ios --aws-project-arn project-arn --aws-device-arn device-arn --aws-app-arn <arn> --force --session ${output.session}`,
    `agent-device open <bundle-id> --relaunch --session ${output.session}`,
  ]);
  assert.deepEqual(output.leasePreparation.nextSteps, output.nextSteps);
  assert.deepEqual(output.notes, [
    `After close, run agent-device artifacts --json --session ${output.session} for provider video and logs.`,
  ]);
});

test('connect JSON preserves BrowserStack workflow notes from human output', async () => {
  const result = await runCliCapture(
    [
      'connect',
      'browserstack',
      '--platform',
      'android',
      '--device',
      'Google Pixel 8',
      '--provider-os-version',
      '14.0',
      '--provider-app',
      'bs://app-id',
      '--json',
    ],
    {
      env: {
        BROWSERSTACK_USERNAME: 'browser-user',
        BROWSERSTACK_ACCESS_KEY: 'browser-key',
      },
      stateDirPrefix: 'agent-device-connect-browserstack-json-',
    },
  );

  assert.equal(result.code, null);
  const output = (JSON.parse(result.stdout) as { data: Record<string, any> }).data;
  assert.deepEqual(output.nextSteps, [
    `agent-device open <package-id> --relaunch --session ${output.session}`,
  ]);
  assert.deepEqual(output.notes, [
    'Use the installed package or bundle identifier in open, not the app artifact name.',
    `After close, run agent-device artifacts --json --session ${output.session} for provider video and logs.`,
  ]);
});

test('every command BrowserStack connect emits resolves back to the connection that emitted it', async () => {
  const tempRoot = mkdtempForTestSync('agent-device-connect-scoped-commands-');
  const stateDir = path.join(tempRoot, '.state');
  const browserstackArgs = [
    'connect',
    'browserstack',
    '--platform',
    'android',
    '--device',
    'Google Pixel 8',
    '--provider-os-version',
    '14.0',
    '--provider-app',
    'bs://app-id',
    '--state-dir',
    stateDir,
  ];
  const captureOptions = {
    env: { BROWSERSTACK_USERNAME: 'browser-user', BROWSERSTACK_ACCESS_KEY: 'browser-key' },
  };

  try {
    const json = await runCliCapture([...browserstackArgs, '--json'], captureOptions);
    const human = await runCliCapture(browserstackArgs, captureOptions);

    assert.equal(json.code, null);
    assert.equal(human.code, null);
    const output = (JSON.parse(json.stdout) as { data: Record<string, any> }).data;
    const session: string = output.session;

    // Every emitted command — nextSteps AND the prose notes — must name a
    // session, so following one cannot adopt whichever connection happens to
    // be host-global active in a concurrent run.
    for (const line of [...output.nextSteps, ...output.notes]) {
      assertCommandsAreSessionScoped(line, session);
    }
    assert.deepEqual([...readEmittedSessions([...output.nextSteps, ...output.notes])], [session]);

    // The human run is a second unscoped connect, so it mints its own identity;
    // its commands must name THAT one, not the JSON run's.
    const humanSessions = [...readEmittedSessions([human.stdout])];
    assert.equal(humanSessions.length, 1, human.stdout);
    const humanSession = humanSessions[0] ?? '';
    assert.notEqual(humanSession, session);
    assertCommandsAreSessionScoped(human.stdout, humanSession);

    // The scope is not decoration: resolving each emitted --session lands on
    // the connection state that connect wrote.
    for (const emittedSession of [session, humanSession]) {
      const state = readRemoteConnectionState({ stateDir, session: emittedSession });
      assert.equal(state?.session, emittedSession);
      assert.equal(state?.leaseProvider, 'browserstack');
      assert.equal(state?.tenant, 'browserstack');
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

/**
 * A command-bearing string must carry one `--session <name>` per `agent-device`
 * invocation it suggests. Counting rather than matching means an added command
 * cannot silently ship unscoped alongside a scoped sibling.
 */
function assertCommandsAreSessionScoped(text: string, session: string): void {
  const commands = text.match(/agent-device\s+[a-z]/g)?.length ?? 0;
  const scopes = text.split(`--session ${session}`).length - 1;
  assert.equal(scopes, commands, `unscoped suggested command in: ${text}`);
}

function readEmittedSessions(texts: readonly string[]): Set<string> {
  const sessions = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(/--session\s+(\S+)/g)) {
      const value = match[1];
      if (value) sessions.add(value);
    }
  }
  return sessions;
}

test('connect does not activate provider state when verification fails', async () => {
  const tempRoot = mkdtempForTestSync('agent-device-connect-verify-fail-');
  const stateDir = path.join(tempRoot, '.state');
  vi.stubEnv('BROWSERSTACK_USERNAME', 'browser-user');
  vi.stubEnv('BROWSERSTACK_ACCESS_KEY', 'browser-bad-key');
  mockedVerifyBrowserStackConnection.mockRejectedValueOnce(
    new AppError('UNAUTHORIZED', 'BrowserStack rejected connection verification.'),
  );

  try {
    await assert.rejects(
      connectCommand({
        host: createTestHostEnvironment(),
        positionals: ['browserstack'],
        flags: {
          json: true,
          help: false,
          version: false,
          stateDir,
          platform: 'android',
          device: 'Google Pixel 8',
          providerOsVersion: '14.0',
          providerApp: 'bs://app-id',
        },
        client: {} as AgentDeviceClient,
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'UNAUTHORIZED');
        return true;
      },
    );
    assert.equal(readActiveConnectionState({ stateDir }), null);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('connect aws-device-farm rejects device-feature flags it does not read', async () => {
  const tempRoot = mkdtempForTestSync('agent-device-connect-aws-reject-');

  try {
    await assert.rejects(
      resolveConnectProviderProfile({
        provider: 'aws-device-farm',
        stateDir: path.join(tempRoot, '.state'),
        cwd: tempRoot,
        env: {},
        flags: {
          json: false,
          help: false,
          version: false,
          platform: 'android',
          device: 'Google Pixel 8',
          providerDeviceOrientation: 'portrait',
          providerTimezone: 'New_York',
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, 'INVALID_ARGS');
        // Names every offending flag, and fires before the provider's own required-arg checks so
        // the caller is told what is unsupported rather than what else is missing.
        assert.equal(error.details?.provider, 'aws-device-farm');
        assert.deepEqual(error.details?.flags, [
          '--provider-device-orientation',
          '--provider-timezone',
        ]);
        return true;
      },
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

function readGeneratedConfig(configPath: string): {
  tenant?: string;
  leaseProvider?: string;
  clientId?: string;
  providerApp?: string;
  providerOsVersion?: string;
  providerProject?: string;
  providerBuild?: string;
  awsProjectArn?: string;
  awsDeviceArn?: string;
  awsAppArn?: string;
  awsRegion?: string;
  awsInteractionMode?: string;
} {
  return JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
    tenant?: string;
    leaseProvider?: string;
    clientId?: string;
    providerApp?: string;
    providerOsVersion?: string;
    providerProject?: string;
    providerBuild?: string;
    awsProjectArn?: string;
    awsDeviceArn?: string;
    awsAppArn?: string;
    awsRegion?: string;
    awsInteractionMode?: string;
  };
}

function readRequiredActiveState(stateDir: string): RemoteConnectionState {
  const state = readActiveConnectionState({ stateDir });
  assert.ok(state);
  return state;
}
