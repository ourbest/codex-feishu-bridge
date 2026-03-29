export interface BridgeConfig {
  server: {
    host: string;
    port: number;
  };
  storage: {
    path: string;
  };
}

export interface AppShell {
  name: string;
  ready: boolean;
  config: BridgeConfig;
}

export interface PartialBridgeConfigInput {
  server?: Partial<BridgeConfig['server']>;
  storage?: Partial<BridgeConfig['storage']>;
}
