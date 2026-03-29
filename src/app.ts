import type { Server } from 'node:http';

import { LarkAdapter } from './adapters/lark/adapter.ts';
import { sendOutboundViaOpenClawLark } from './adapters/lark/openclaw-lark.ts';
import { createApiServer } from './api/server.ts';
import { BindingService } from './core/binding/binding-service.ts';
import { BridgeRouter } from './core/router/router.ts';
import type { BridgeConfig } from './types/index.ts';
import { InMemoryBindingStore } from './storage/binding-store.ts';
import type { LarkTransport } from './adapters/lark/adapter.ts';
import type { OpenClawLarkModule } from './adapters/lark/openclaw-lark.ts';

export interface BridgeRuntime {
  config: BridgeConfig;
  bindingService: BindingService;
  router: BridgeRouter;
  larkAdapter: LarkAdapter;
  apiServer: Server;
  ready: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createBridgeApp(options: {
  config: BridgeConfig;
  larkTransport: LarkTransport;
  openclawConfig?: unknown;
  openclawLark?: OpenClawLarkModule;
}): BridgeRuntime {
  const bindingStore = new InMemoryBindingStore();
  const bindingService = new BindingService(bindingStore);
  const router = new BridgeRouter(bindingService);
  const larkAdapter = new LarkAdapter(options.larkTransport);
  const apiServer = createApiServer({
    bindingService,
  });

  larkAdapter.onMessage(async (message) => {
    const outboundMessage = await router.routeInboundMessage(message);
    if (outboundMessage !== null) {
      if (options.openclawConfig !== undefined) {
        await sendOutboundViaOpenClawLark({
          config: options.openclawConfig,
          message: outboundMessage,
          openclawLark: options.openclawLark,
        });
        return;
      }

      await larkAdapter.send(outboundMessage);
    }
  });

  let ready = false;

  return {
    config: options.config,
    bindingService,
    router,
    larkAdapter,
    apiServer,
    get ready() {
      return ready;
    },
    async start() {
      await larkAdapter.start();
      ready = true;
    },
    async stop() {
      await larkAdapter.stop();
      ready = false;
    },
  };
}
