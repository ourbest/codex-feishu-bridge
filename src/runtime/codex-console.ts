import { createInterface } from 'node:readline';

import type { CodexProjectClient } from './codex-project.ts';

export interface CodexConsoleSessionOptions {
  projectInstanceId: string;
  cwd: string;
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  client: CodexProjectClient;
  showFinalReply?: boolean;
}

export interface ConsoleRuntimeConfig {
  enabled: boolean;
  projectInstanceId: string;
  cwd: string;
}

export interface RuntimeEnvConsoleConfig {
  BRIDGE_CONSOLE?: string;
  BRIDGE_CONSOLE_PROJECT_INSTANCE_ID?: string;
  BRIDGE_CODEX_CWD?: string;
  HOME?: string;
}

function isEnabled(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'yes';
}

function resolveDefaultCwd(env: RuntimeEnvConsoleConfig): string {
  return env.BRIDGE_CODEX_CWD?.trim() || `${env.HOME ?? process.env.HOME ?? process.cwd()}/git/codex-bridge`;
}

export function resolveConsoleRuntimeConfig(env: RuntimeEnvConsoleConfig = process.env): ConsoleRuntimeConfig | null {
  if (!isEnabled(env.BRIDGE_CONSOLE)) {
    return null;
  }

  return {
    enabled: true,
    projectInstanceId: env.BRIDGE_CONSOLE_PROJECT_INSTANCE_ID?.trim() || 'project-a',
    cwd: resolveDefaultCwd(env),
  };
}

export async function runCodexConsoleSession(options: CodexConsoleSessionOptions): Promise<void> {
  options.output.write(`connected to codex project ${options.projectInstanceId} at ${options.cwd}\n`);

  const reader = createInterface({
    input: options.input,
    crlfDelay: Infinity,
  });

  let queue = Promise.resolve();
  let closeResolve: (() => void) | null = null;
  let closeReject: ((error: Error) => void) | null = null;
  let sawDelta = false;
  const previousOnTextDelta = options.client.onTextDelta ?? null;
  const previousOnTurnCompleted = options.client.onTurnCompleted ?? null;

  options.client.onTextDelta = (text) => {
    sawDelta = true;
    previousOnTextDelta?.(text);
  };
  options.client.onTurnCompleted = () => {
    previousOnTurnCompleted?.();
  };

  const completion = new Promise<void>((resolve, reject) => {
    closeResolve = resolve;
    closeReject = reject;
  });

  reader.on('line', (line) => {
    const text = line.trim();
    if (!text) {
      return;
    }

    queue = queue.then(async () => {
      options.output.write(`you> ${text}\n`);
      try {
        sawDelta = false;
        const reply = await options.client.generateReply({
          text,
          cwd: options.cwd,
        });
        if (options.showFinalReply !== false && !sawDelta) {
          options.output.write(`codex> ${reply}\n`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        options.output.write(`codex error> ${message}\n`);
      }
    });
  });

  reader.on('close', () => {
    queue.then(
      () => closeResolve?.(),
      (error) => closeReject?.(error instanceof Error ? error : new Error(String(error))),
    );
  });

  reader.on('error', (error) => {
    closeReject?.(error instanceof Error ? error : new Error(String(error)));
  });

  try {
    await completion;
  } finally {
    options.client.onTextDelta = previousOnTextDelta;
    options.client.onTurnCompleted = previousOnTurnCompleted;
    reader.close();
    await options.client.stop();
  }
}
