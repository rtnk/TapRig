import type { ConnectionProviderCapabilities } from '@agent-device/contracts/remote';
import { ROUTING_PROVIDER_IDENTITIES } from '@agent-device/plugins/manifest';
import { CLOUD_WEBDRIVER_PROVIDER_DECLARATIONS } from '@agent-device/provider-webdriver/providers';

/** Every provider id agent-device registers itself; a plugin cannot claim any of them. */
export const BUILTIN_PROVIDER_IDS: readonly string[] = CLOUD_WEBDRIVER_PROVIDER_DECLARATIONS.map(
  ({ provider }) => provider,
);

/** Provider ids `connect` accepts without a plugin: the routing identities and the built-ins. */
export const BUILTIN_CONNECT_PROVIDER_IDS: readonly string[] = [
  ...ROUTING_PROVIDER_IDENTITIES,
  ...BUILTIN_PROVIDER_IDS,
];

/** The built-in provider's connect capabilities, read without loading its implementation. */
export function builtinConnectionCapabilities(
  provider: string | undefined,
): ConnectionProviderCapabilities | undefined {
  return CLOUD_WEBDRIVER_PROVIDER_DECLARATIONS.find(
    (declaration) => declaration.provider === provider,
  )?.connection;
}
