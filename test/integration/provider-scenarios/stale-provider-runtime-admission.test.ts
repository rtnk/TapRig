import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import type { DeviceLease } from '@agent-device/contracts/device';
import { createBundledCloudWebDriverRuntimes } from './bundled-cloud-webdriver-runtimes.ts';
import type { DeviceInfo } from '@agent-device/kernel/device';
import { bindTestCommandHost, mkdtempForTestSync } from '@agent-device/test-kit';
import { createProviderDeviceRuntimeRequestProviders } from '../../../src/provider-device-runtime.ts';
import { assertRpcError, assertRpcOk } from './assertions.ts';
import { createProviderScenarioHarness } from './harness.ts';
import {
  CloudWebDriverTestServer,
  cloudWebDriverTestJson,
  startCloudWebDriverTestServer,
  type CloudWebDriverHttpCall,
} from './cloud-webdriver-test-server.ts';
import {
  AwsRemoteAccessHost,
  ProviderRegressionServer,
  awsRegressionContext,
} from './cloud-webdriver-regression-fixtures.ts';
import { inspectProviderDeploymentAdmission } from './stale-provider-runtime-admission.fixtures.ts';
import { CLOUD_WEBDRIVER_PROVIDERS } from '@agent-device/provider-webdriver/providers';

bindTestCommandHost();

test('a released WebDriver device remains provider-owned with deployment unavailable', async () => {
  const server = await startCloudWebDriverTestServer(new StaleWebDriverServer());
  const runtime = await webDriverRuntime(server.url);
  const lease = providerLease(CLOUD_WEBDRIVER_PROVIDERS.browserStack, 'webdriver-stale');

  try {
    const allocate = runtime.leaseLifecycle.allocate;
    if (!allocate) throw new Error('Cloud WebDriver runtime must allocate leases');
    await allocate(lease, {
      flags: {
        platform: 'android',
        device: 'Test Android',
        providerOsVersion: '14',
        providerApp: 'bs://example-app',
      },
    });
    const device = await allocatedDevice(runtime, lease);
    await runtime.leaseLifecycle.release?.(lease);

    expect(runtime.ownsDevice(device)).toBe(true);
    const facts = await inspectProviderDeploymentAdmission({
      runtime,
      module: runtime.platformRuntimeModule,
      device,
    });
    expect(facts).toMatchObject({
      device: { providerMode: 'provider-runtime' },
      operations: {
        ensureReady: { available: false, reason: 'owner-capability-missing' },
        deployApp: { available: false, reason: 'owner-capability-missing' },
      },
    });
  } finally {
    await runtime.shutdown();
    await server.close();
  }
});

test('an active AWS WebDriver device denies unsupported install from facts before bind or provider execution', async () => {
  const server = await ProviderRegressionServer.start();
  const host = new AwsRemoteAccessHost({ appiumEndpoint: `${server.url}/wd/hub/` });
  const runtime = await awsWebDriverRuntime(host);
  const provider = runtime.platformRuntimeModule;
  if (!provider) throw new Error('AWS WebDriver runtime requires its platform runtime module');
  let bindCalls = 0;
  const countedProvider = Object.freeze({
    ...provider,
    loadRuntime: async (...args: Parameters<typeof provider.loadRuntime>) => {
      const owner = await provider.loadRuntime(...args);
      return Object.freeze({
        ...owner,
        bind: async (request: Parameters<typeof owner.bind>[0]) => {
          bindCalls += 1;
          return await owner.bind(request);
        },
      });
    },
  });
  const providers = createProviderDeviceRuntimeRequestProviders([runtime]);
  const daemon = await createProviderScenarioHarness({
    ...providers,
    deviceInventorySource: providers.deviceInventorySource!,
    platformRuntime: {
      providerRuntimes: [runtime],
      providerModules: [{ runtime, module: countedProvider }],
    },
  });
  const leaseId = 'a'.repeat(32);
  const flags = {
    ...awsRegressionContext().flags,
    tenant: 'team-a',
    runId: 'run-a',
    leaseId,
    leaseProvider: CLOUD_WEBDRIVER_PROVIDERS.awsDeviceFarm,
  };
  const meta = {
    tenantId: 'team-a',
    runId: 'run-a',
    leaseId,
    leaseBackend: 'android-instance' as const,
    leaseProvider: CLOUD_WEBDRIVER_PROVIDERS.awsDeviceFarm,
    deviceKey: 'provider-device-regression',
    clientId: 'client-a',
  };
  let lease: DeviceLease | undefined;

  try {
    lease = assertRpcOk<{ lease: DeviceLease }>(
      await daemon.callCommand('lease_allocate', [], flags, { meta }),
    ).lease;
    const device = await allocatedDevice(runtime, lease);
    const tempDir = mkdtempForTestSync('agent-device-provider-install-admission-');
    const appPath = path.join(tempDir, 'demo.apk');
    fs.writeFileSync(appPath, 'fake apk');
    const providerCallsBeforeAdmission = server.calls.length;
    const hostCallsBeforeAdmission = host.calls.length;
    const bindCallsBeforeAdmission = bindCalls;
    const response = await daemon.callCommand(
      'install',
      [appPath],
      { ...flags, serial: device.id },
      { meta },
    );
    const error = assertRpcError(
      response,
      500,
      'UNSUPPORTED_OPERATION',
      /not supported on this device/,
    );
    assert.equal(
      (error.details as Record<string, unknown> | undefined)?.reason,
      'owner-capability-missing',
    );
    expect(bindCalls).toBe(bindCallsBeforeAdmission);
    expect(server.calls).toHaveLength(providerCallsBeforeAdmission);
    expect(host.calls).toHaveLength(hostCallsBeforeAdmission);
  } finally {
    try {
      if (lease) await daemon.callCommand('lease_release', [], flags, { meta });
    } finally {
      try {
        await daemon.close();
      } finally {
        try {
          await runtime.shutdown();
        } finally {
          await server.close();
        }
      }
    }
  }
});

async function webDriverRuntime(endpoint: string) {
  const runtimes = await createBundledCloudWebDriverRuntimes({
    env: {
      BROWSERSTACK_USERNAME: 'browser-user',
      BROWSERSTACK_ACCESS_KEY: 'browser-key',
      BROWSERSTACK_WEBDRIVER_ENDPOINT: `${endpoint}/wd/hub/`,
    },
    clientVersion: 'test',
    runHostCommand: async () => {
      throw new Error('stale WebDriver admission never invokes host commands');
    },
  });
  const runtime = runtimes.find(
    (candidate) => candidate.provider === CLOUD_WEBDRIVER_PROVIDERS.browserStack,
  );
  if (!runtime) throw new Error('Expected BrowserStack WebDriver runtime');
  return runtime;
}

async function awsWebDriverRuntime(host: AwsRemoteAccessHost) {
  const runtimes = await createBundledCloudWebDriverRuntimes({
    env: { AWS_REGION: 'us-west-2' },
    clientVersion: 'test',
    runHostCommand: host.run,
  });
  const runtime = runtimes.find(
    (candidate) => candidate.provider === CLOUD_WEBDRIVER_PROVIDERS.awsDeviceFarm,
  );
  if (!runtime) throw new Error('Expected AWS Device Farm WebDriver runtime');
  return runtime;
}

async function allocatedDevice(
  runtime: Awaited<ReturnType<typeof webDriverRuntime>>,
  lease: DeviceLease,
): Promise<DeviceInfo> {
  const devices = await runtime.deviceInventoryProvider({
    leaseProvider: lease.leaseProvider,
    leaseId: lease.leaseId,
  });
  const device = devices?.[0];
  if (!device) throw new Error('Expected the allocated WebDriver device');
  return device;
}

function providerLease(provider: string, leaseId: string): DeviceLease {
  return {
    leaseId,
    tenantId: 'team-a',
    runId: 'run-a',
    clientId: 'client-a',
    leaseProvider: provider,
    backend: 'android-instance',
    deviceKey: `${provider}:device-a`,
    createdAt: 1,
    heartbeatAt: 1,
    expiresAt: 60_001,
  };
}

class StaleWebDriverServer extends CloudWebDriverTestServer {
  protected respond(call: CloudWebDriverHttpCall) {
    if (call.method === 'POST' && call.path === '/wd/hub/session') {
      return cloudWebDriverTestJson({
        value: { sessionId: 'webdriver-session-a', capabilities: { platformName: 'Android' } },
      });
    }
    if (call.method === 'DELETE' && call.path === '/wd/hub/session/webdriver-session-a') {
      return cloudWebDriverTestJson({ value: null });
    }
    return cloudWebDriverTestJson(
      { value: { message: `Unexpected ${call.method} ${call.path}` } },
      500,
    );
  }
}
