import type { BridgeConfig, PartialBridgeConfigInput } from '../types/index.ts';

const DEFAULT_CONFIG: BridgeConfig = {
  server: {
    host: '127.0.0.1',
    port: 3000,
  },
  storage: {
    path: './data/bridge.json',
  },
};

export function loadConfig(input: PartialBridgeConfigInput): BridgeConfig {
  return {
    server: {
      host: input.server?.host ?? DEFAULT_CONFIG.server.host,
      port: input.server?.port ?? DEFAULT_CONFIG.server.port,
    },
    storage: {
      path: input.storage?.path ?? DEFAULT_CONFIG.storage.path,
    },
  };
}
