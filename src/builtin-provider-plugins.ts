import type { AgentDevicePlugin } from '@agent-device/plugins/contract';
import type { PluginCandidate } from '@agent-device/plugins/registry';
import {
  CLOUD_WEBDRIVER_PROVIDER_DECLARATIONS,
  type CloudWebDriverProviderDeclaration,
} from '@agent-device/provider-webdriver/providers';

/**
 * The built-in providers as registry candidates, in the shape a plugin has. Their implementations
 * load only when a runtime is set up.
 */
export function builtinProviderCandidates(): PluginCandidate[] {
  return CLOUD_WEBDRIVER_PROVIDER_DECLARATIONS.map((declaration): PluginCandidate => ({
    source: 'builtin',
    provider: declaration.provider,
    load: () => cloudWebDriverPlugin(declaration),
  }));
}

function cloudWebDriverPlugin(declaration: CloudWebDriverProviderDeclaration): AgentDevicePlugin {
  const loadProvider = async () => {
    const [{ bundledCloudWebDriverProvider }, host] = await Promise.all([
      import('@agent-device/provider-webdriver'),
      import('./provider-webdriver.ts'),
    ]);
    return { bundled: bundledCloudWebDriverProvider(declaration.provider)!, host };
  };
  return {
    apiVersion: 2,
    provider: declaration.provider,
    credentials: { variables: declaration.credentialVariables ?? [] },
    connection: {
      capabilities: declaration.connection,
      resolve: async (context) => {
        const { bundled, host } = await loadProvider();
        return await bundled
          .create(host.createBundledCloudWebDriverHost(context.env))
          .connection.resolve(context);
      },
      verify: async (context) => {
        const { bundled, host } = await loadProvider();
        return await bundled
          .create(host.createBundledCloudWebDriverHost(context.env))
          .connection.verify(context);
      },
    },
    setup: async (pluginHost) => {
      const { bundled, host } = await loadProvider();
      return {
        webDriver: bundled.create(host.createBundledCloudWebDriverHost(pluginHost.env)).webDriver,
      };
    },
  };
}
