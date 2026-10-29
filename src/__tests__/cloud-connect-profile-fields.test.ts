import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '@agent-device/kernel/errors';
import { resolveConnectProviderProfile } from '../cli/connection/connect-provider-adapters.ts';
import { mkdtempForTestSync } from '@agent-device/test-kit';

test('connect browserstack refuses AWS Device Farm flags', async () => {
  const tempRoot = mkdtempForTestSync('agent-device-connect-browserstack-reject-');

  try {
    await assert.rejects(
      resolveConnectProviderProfile({
        provider: 'browserstack',
        stateDir: path.join(tempRoot, '.state'),
        cwd: tempRoot,
        env: {},
        flags: {
          json: false,
          help: false,
          version: false,
          platform: 'android',
          device: 'Google Pixel 8',
          awsProjectArn: 'arn:aws:devicefarm:us-west-2:123:project:project-a',
        },
      }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, 'INVALID_ARGS');
        assert.equal(error.details?.provider, 'browserstack');
        assert.deepEqual(error.details?.flags, ['--aws-project-arn']);
        return true;
      },
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
