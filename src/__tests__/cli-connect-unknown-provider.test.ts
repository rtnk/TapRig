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

test('connect limrun is an unknown provider and opens no connection, even with Limrun credentials', async () => {
  const fetchSpy = vi.fn(async () => {
    throw new Error('connect must not reach the network');
  });
  vi.stubGlobal('fetch', fetchSpy);

  const result = await runCliCapture(['connect', 'limrun', '--platform', 'android', '--json'], {
    env: { LIMRUN_API_KEY: 'dummy-limrun-key' },
    stateDirPrefix: 'agent-device-connect-unknown-provider-',
  });

  assert.equal(result.code, 1);
  const error = (JSON.parse(result.stdout) as { error: { code: string; message: string } }).error;
  assert.equal(error.code, 'INVALID_ARGS');
  assert.match(error.message, /^Unknown connect provider: limrun\. Supported providers: /);
  assert.doesNotMatch(error.message.replace(/^Unknown connect provider: limrun\./, ''), /limrun/);
  assert.equal(fetchSpy.mock.calls.length, 0);
  assert.equal(vi.mocked(runCmd).mock.calls.length, 0);
  assert.equal(vi.mocked(runCmdDetached).mock.calls.length, 0);
  assert.equal(result.calls.length, 0);
});
