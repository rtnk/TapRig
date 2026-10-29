import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, vi } from 'vitest';
import { runCmdDetached } from '@agent-device/host-kit/command';
import { mkdtempForTestSync } from '@agent-device/test-kit';
import { runCliCapture } from './cli-capture.ts';

vi.mock('@agent-device/host-kit/command', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agent-device/host-kit/command')>()),
  runCmdDetached: vi.fn(),
}));

test('an interactive CLI run with a fresh state dir starts no update check', async () => {
  const stateDir = mkdtempForTestSync('agent-device-cli-no-update-check-');
  const isTTYDescriptor = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
  Object.defineProperty(process.stderr, 'isTTY', { configurable: true, value: true });
  try {
    const result = await runCliCapture(['devices', '--platform', 'android'], {
      env: { AGENT_DEVICE_STATE_DIR: stateDir, CI: undefined, NODE_ENV: undefined },
      defaultResponse: { ok: true, data: { devices: [] } },
    });
    assert.equal(result.code, null);
    assert.equal(result.calls[0]?.command, 'devices');
    assert.equal(vi.mocked(runCmdDetached).mock.calls.length, 0);
    assert.equal(fs.existsSync(path.join(stateDir, 'update-check.json')), false);
    assert.doesNotMatch(result.stderr, /Update available/);
  } finally {
    if (isTTYDescriptor) Object.defineProperty(process.stderr, 'isTTY', isTTYDescriptor);
    else delete (process.stderr as { isTTY?: boolean }).isTTY;
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});
