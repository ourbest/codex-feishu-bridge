import { pathToFileURL } from 'node:url';

import { createBridgeApp } from './app.ts';
import { createLocalDevLarkTransport, resolveBridgeConfig, resolveStoragePath } from './runtime/bootstrap.ts';
import { createOpenClawLiteTransport } from './adapters/lark/openclaw-lite-transport.ts';
import { resolveCodexRuntimeConfigs } from './runtime/codex-config.ts';
import { CodexAppServerClient } from './adapters/codex/app-server-client.ts';
import { resolveConsoleRuntimeConfig, runCodexConsoleSession } from './runtime/codex-console.ts';
import { createCodexProjectRegistry } from './runtime/codex-project-registry.ts';
import { resolveOpenClawLiteRuntimeConfig } from './runtime/openclaw-lite-config.ts';
import { JsonBindingStore } from './storage/json-binding-store.ts';

export async function run(): Promise<void> {
  const config = resolveBridgeConfig();
  const storagePath = resolveStoragePath();
  const consoleRuntime = resolveConsoleRuntimeConfig();
  const codexRuntimes = resolveCodexRuntimeConfigs() ?? [];
  const openClawLiteRuntime = resolveOpenClawLiteRuntimeConfig();
  const transport = openClawLiteRuntime !== null
    ? createOpenClawLiteTransport({
        ...openClawLiteRuntime,
        onSend(message) {
          console.log(`[codex-bridge] outbound -> ${message.sessionId}: ${message.text}`);
        },
        onStderr(text) {
          process.stderr.write(text);
        },
      })
    : createLocalDevLarkTransport({
        onSend(message) {
          console.log(`[codex-bridge] outbound -> ${message.sessionId}: ${message.text}`);
        },
      });

  const app = createBridgeApp({
    config,
    larkTransport: transport,
    bindingStore: new JsonBindingStore(storagePath),
  });

  if (consoleRuntime !== null) {
    const project = codexRuntimes.find((entry) => entry.projectInstanceId === consoleRuntime.projectInstanceId) ?? {
      projectInstanceId: consoleRuntime.projectInstanceId,
      command: 'codex',
      args: ['app-server'],
      cwd: consoleRuntime.cwd,
      serviceName: 'codex-bridge',
      transport: 'websocket',
      websocketUrl: 'ws://127.0.0.1:4000',
    };

    const client = new CodexAppServerClient({
      command: project.command,
      args: project.args,
      cwd: project.cwd ?? consoleRuntime.cwd,
      clientInfo: {
        name: 'codex-bridge',
        title: 'Codex Bridge',
        version: '0.1.0',
      },
      serviceName: project.serviceName,
      transport: project.transport,
      websocketUrl: project.websocketUrl,
    });
    let printedCodexPrefix = false;
    client.onTextDelta = (text) => {
      if (!printedCodexPrefix) {
        process.stdout.write('codex> ');
        printedCodexPrefix = true;
      }
      process.stdout.write(text);
    };
    client.onTurnCompleted = () => {
      if (printedCodexPrefix) {
        process.stdout.write('\n');
        printedCodexPrefix = false;
      }
    };
    client.onStderr = (text) => {
      process.stderr.write(text);
    };
    client.onNotification = (message) => {
      if (message.method === 'error') {
        const error = message.params?.error;
        const errorMessage = typeof error === 'object' && error !== null && 'message' in error ? String((error as { message?: unknown }).message ?? '') : '';
        if (errorMessage) {
          process.stderr.write(`[codex-bridge] ${errorMessage}\n`);
        }
        return;
      }

      if (message.method === 'turn/started') {
        process.stderr.write('[codex-bridge] turn started\n');
        return;
      }

      if (message.method === 'turn/completed') {
        const turn = message.params?.turn;
        const status =
          typeof turn === 'object' && turn !== null && 'status' in turn ? String((turn as { status?: unknown }).status ?? '') : '';
        if (status) {
          process.stderr.write(`[codex-bridge] turn completed: ${status}\n`);
        }

        const error = typeof turn === 'object' && turn !== null && 'error' in turn ? (turn as { error?: unknown }).error : undefined;
        const errorMessage =
          typeof error === 'object' && error !== null && 'message' in error ? String((error as { message?: unknown }).message ?? '') : '';
        if (errorMessage) {
          process.stderr.write(`[codex-bridge] turn error: ${errorMessage}\n`);
        }
        return;
      }

      if (message.method === 'thread/status/changed') {
        const status = message.params?.status;
        const type = typeof status === 'object' && status !== null && 'type' in status ? String((status as { type?: unknown }).type ?? '') : '';
        if (type) {
          process.stderr.write(`[codex-bridge] thread status: ${type}\n`);
        }
      }
    };

    await runCodexConsoleSession({
      projectInstanceId: project.projectInstanceId,
      cwd: project.cwd ?? consoleRuntime.cwd,
      input: process.stdin,
      output: process.stdout,
      client,
    });
    return;
  }

  let codexProjectRegistry = null;
  if (codexRuntimes.length > 0) {
    codexProjectRegistry = createCodexProjectRegistry({
      projects: codexRuntimes,
    });
    codexProjectRegistry.attach(app.router);
      console.log(
        `[codex-bridge] codex app-server attached for ${codexRuntimes.length} project${codexRuntimes.length === 1 ? '' : 's'}`,
      );
  }

  await app.start();

  let keepAlive: NodeJS.Timeout | null = null;
  try {
    await new Promise<void>((resolve, reject) => {
      const server = app.apiServer;
      server.once('error', reject);
      server.listen(config.server.port, config.server.host, () => {
        console.log(
          `[codex-bridge] listening on http://${config.server.host}:${config.server.port} (storage: ${storagePath})`,
        );
        resolve();
      });
    });
  } catch (error) {
    const code = typeof error === 'object' && error !== null ? (error as { code?: string }).code : undefined;
    if (code !== 'EPERM' && code !== 'EACCES') {
      throw error;
    }

    console.warn('[codex-bridge] HTTP listen is unavailable in this environment, continuing in dry-run mode');
    keepAlive = setInterval(() => {}, 60_000);
    console.log(
      `[codex-bridge] dry-run active (storage: ${storagePath}); set BRIDGE_PORT/BRIDGE_HOST in a normal environment to enable HTTP`,
    );
  }

  const shutdown = async () => {
    if (keepAlive !== null) {
      clearInterval(keepAlive);
      keepAlive = null;
    }
    if (codexProjectRegistry !== null) {
      await codexProjectRegistry.stop();
      codexProjectRegistry = null;
    }
    await app.stop();
    await new Promise<void>((resolve) => {
      app.apiServer.close(() => resolve());
    });
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void run().catch((error) => {
    console.error('[codex-bridge] fatal startup error');
    console.error(error);
    process.exitCode = 1;
  });
}
