import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';
import { runCmd, runCmdDetached } from '@agent-device/host-kit/command';
import { runCliCapture } from './cli-capture.ts';

vi.mock('@agent-device/host-kit/command', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agent-device/host-kit/command')>()),
  runCmd: vi.fn(),
  runCmdDetached: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test('connect without a provider fails with INVALID_ARGS before any connection, even with a daemon token', async () => {
  const fetchSpy = vi.fn(async () => {
    throw new Error('connect must not reach the network');
  });
  vi.stubGlobal('fetch', fetchSpy);

  const result = await runCliCapture(['connect', '--json'], {
    env: { AGENT_DEVICE_DAEMON_AUTH_TOKEN: 'dummy-daemon-token' },
    stateDirPrefix: 'agent-device-connect-requires-provider-',
  });

  assert.equal(result.code, 1);
  const error = (
    JSON.parse(result.stdout) as {
      success: boolean;
      error: { code: string; message: string; details?: { reason?: string } };
    }
  ).error;
  assert.equal(error.code, 'INVALID_ARGS');
  assert.equal(error.details?.reason, 'connect-provider-required');
  assert.equal(fetchSpy.mock.calls.length, 0);
  assert.equal(vi.mocked(runCmd).mock.calls.length, 0);
  assert.equal(vi.mocked(runCmdDetached).mock.calls.length, 0);
  assert.equal(result.calls.length, 0);
});

test('auth is an unknown command', async () => {
  const result = await runCliCapture(['auth', 'login']);

  assert.equal(result.code, 1);
  assert.equal(result.calls.length, 0);
  assert.match(result.stderr, /Unknown command: auth\b/);
});
