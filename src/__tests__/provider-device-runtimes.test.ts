import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { createDaemonProviderRuntimeComposition } from '../provider-device-runtimes.ts';
import fs from 'node:fs';
import path from 'node:path';
import {
  pluginHome,
  registrationSource,
  selectPlugin,
  selectV2Plugin,
} from '@agent-device/test-kit';

test('daemon composition registers installed provider runtimes and their lazy platform modules', async () => {
  const { home, env } = pluginHome();
  selectPlugin(home, 'example', 'example', registrationSource('example'));
  const composition = await createDaemonProviderRuntimeComposition({
    env: env,
    cwd: process.cwd(),
  });
  const plugin = composition.runtimes.find((runtime) => runtime.provider === 'example');
  assert.ok(plugin);
  assert.equal(
    composition.platformModules.find(({ runtime }) => runtime === plugin)?.module.owner.provider,
    'example',
  );
  await composition.shutdown();
});

test('built-in providers register ahead of the store', async () => {
  const { home, env } = pluginHome();
  selectPlugin(home, 'example', 'example', registrationSource('example'));
  const composition = await createDaemonProviderRuntimeComposition({
    env: env,
    cwd: process.cwd(),
  });

  assert.deepEqual(
    composition.runtimes.map((runtime) => runtime.provider),
    ['browserstack', 'aws-device-farm', 'example'],
  );
  assert.deepEqual(
    composition.inventory.map(({ provider, source, state }) => [provider, source, state]),
    [
      ['browserstack', 'builtin', 'active'],
      ['aws-device-farm', 'builtin', 'active'],
      ['example', 'store', 'active'],
    ],
  );
  await composition.shutdown();
});

test('Limrun credentials in the environment register no provider and open no connection', async () => {
  const { env } = pluginHome();
  const fetch = vi.spyOn(globalThis, 'fetch');
  const { runtimes, platformModules, inventory, shutdown } =
    await createDaemonProviderRuntimeComposition({
      env: {
        ...env,
        LIMRUN_API_KEY: 'lim_test_key',
        LIM_IOS_INSTANCE_URL: 'https://region.limrun.example/v1/ios_x/api',
        LIM_IOS_INSTANCE_TOKEN: 'ios-instance-token',
      },
      cwd: process.cwd(),
    });

  try {
    assert.deepEqual(
      runtimes.map((runtime) => runtime.provider),
      ['browserstack', 'aws-device-farm'],
    );
    assert.deepEqual(
      inventory.map(({ provider, state }) => [provider, state]),
      [
        ['browserstack', 'active'],
        ['aws-device-farm', 'active'],
      ],
    );
    assertPlatformModuleCoverage(runtimes, platformModules);
    assert.equal(fetch.mock.calls.length, 0);
  } finally {
    fetch.mockRestore();
    await shutdown();
  }
});

test('a plugin claiming a built-in provider ID is recorded as failed and the built-in keeps the ID', async () => {
  for (const provider of ['browserstack', 'aws-device-farm']) {
    const { home, env } = pluginHome();
    selectPlugin(home, 'example', provider, 'throw new Error("must not evaluate");');
    const composition = await createDaemonProviderRuntimeComposition({
      env: env,
      cwd: process.cwd(),
    });
    const plugin = composition.inventory.find(({ package: name }) => name === 'example');
    assert.equal(plugin?.state, 'failed');
    assert.equal(plugin?.error?.reason, 'duplicate_provider');
    assert.equal(composition.runtimes.filter((runtime) => runtime.provider === provider).length, 1);
    await composition.shutdown();
  }
});

function assertPlatformModuleCoverage(
  runtimes: readonly object[],
  platformModules: ReadonlyArray<
    Readonly<{ runtime: object; module: { owner: { provider: string } } }>
  >,
): void {
  const runtimeModules = runtimes.filter(
    (runtime) => 'owner' in runtime && 'loadRuntime' in runtime,
  );
  assert.deepEqual(
    platformModules.map(({ runtime }) => runtime),
    runtimeModules,
  );
  for (const { runtime, module } of platformModules) {
    assert.equal('provider' in runtime ? runtime.provider : undefined, module.owner.provider);
  }
}

test('composition shutdown is the only route the daemon uses: it shuts every runtime down and runs plugin cleanup', async () => {
  const { home, env } = pluginHome();
  const log = path.join(home, 'shutdown-log');
  selectV2Plugin(
    home,
    'cleaning',
    `import fs from 'node:fs';
    export default (options) => ({
      apiVersion: 2, provider: 'cleaning', credentials: { variables: [] },
      setup: async () => ({
        runtime: { provider: 'cleaning', ownsDevice: () => false, getInteractor: () => undefined,
          deviceInventoryProvider: async () => [], leaseLifecycle: {},
          shutdown: async () => { fs.appendFileSync(options.log, 'runtime;'); } },
        platformModule: { owner: { kind: 'provider-runtime', provider: 'cleaning', instance: 'test' }, loadRuntime: async () => { throw new Error('lazy'); } },
        dispose: async () => { fs.appendFileSync(options.log, 'dispose;'); },
      }),
    });`,
    { selectionOptions: { log } },
  );
  const composition = await createDaemonProviderRuntimeComposition({
    env: env,
    cwd: process.cwd(),
  });
  assert.ok(composition.runtimes.some((runtime) => runtime.provider === 'cleaning'));

  await composition.shutdown();

  assert.equal(fs.readFileSync(log, 'utf8'), 'runtime;dispose;');
});
