import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

import {
  parseChannelMessage,
  serializeChannelMessage,
  type ChannelEventMessage,
  type ChannelMessage,
  type ChannelOutboundMessage,
} from './protocol.ts';
import { resolveOpenClawLitePluginRuntimeConfig } from '../runtime/openclaw-lite-plugin-config.ts';

function writeMessage(message: ChannelMessage): void {
  process.stdout.write(`${serializeChannelMessage(message)}\n`);
}

function normalizeEvent(payload: unknown): ChannelEventMessage | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const chatId =
    typeof record.chatId === 'string'
      ? record.chatId
      : typeof record.sessionId === 'string'
        ? record.sessionId
        : typeof record.sessionKey === 'string'
          ? record.sessionKey
          : null;
  const text =
    typeof record.text === 'string'
      ? record.text
      : typeof record.content === 'string'
        ? record.content
        : typeof record.message === 'string'
          ? record.message
          : typeof record.messageText === 'string'
            ? record.messageText
            : null;

  if (chatId === null || text === null) {
    return null;
  }

  return {
    type: 'event',
    chatId,
    messageId:
      typeof record.messageId === 'string'
        ? record.messageId
        : typeof record.id === 'string'
          ? record.id
          : randomUUID(),
    text,
    senderId:
      typeof record.senderId === 'string'
        ? record.senderId
        : typeof record.userId === 'string'
          ? record.userId
          : typeof record.from === 'string'
            ? record.from
            : 'unknown',
    timestamp:
      typeof record.timestamp === 'string'
        ? record.timestamp
        : typeof record.createdAt === 'string'
          ? record.createdAt
          : new Date().toISOString(),
  };
}

async function runStubMode(): Promise<void> {
  writeMessage({
    type: 'status',
    state: 'ready',
  });

  const bootEvent = process.env.OPENCLAW_LITE_BOOT_EVENT_JSON;
  if (bootEvent !== undefined && bootEvent.trim() !== '') {
    writeMessage(parseChannelMessage(bootEvent) as ChannelMessage);
  }

  const input = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  input.on('line', (line) => {
    const message = parseChannelMessage(line);
    if (message.type === 'stop') {
      writeMessage({
        type: 'status',
        state: 'stopped',
      });
      process.exit(0);
      return;
    }

    if (message.type === 'send') {
      process.stderr.write(`[openclaw-lite] forwarding to ${message.chatId}\n`);
    }
  });

  process.on('SIGINT', () => {
    writeMessage({
      type: 'status',
      state: 'stopped',
    });
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    writeMessage({
      type: 'status',
      state: 'stopped',
    });
    process.exit(0);
  });
}

async function runPluginMode(): Promise<void> {
  const pluginConfig = resolveOpenClawLitePluginRuntimeConfig(process.env);
  const pluginProcess = spawn(pluginConfig.command, pluginConfig.args, {
    cwd: pluginConfig.cwd,
    env: {
      ...process.env,
      ...pluginConfig.env,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  pluginProcess.stderr.on('data', (chunk: Buffer) => {
    process.stderr.write(chunk);
  });

  pluginProcess.once('error', (error) => {
    process.stderr.write(
      `[openclaw-lite] plugin start failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });

  pluginProcess.stdout.on('data', (chunk: Buffer) => {
    const lines = chunk.toString().split(/\r?\n/).filter((line) => line.trim() !== '');
    for (const line of lines) {
      const message = parseChannelMessage(line);
      if (message.type === 'event') {
        const normalized = normalizeEvent(message);
        if (normalized !== null) {
          writeMessage(normalized);
        }
        continue;
      }

      if (message.type === 'status') {
        writeMessage(message);
      }
    }
  });

  const input = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  input.on('line', (line) => {
    const message = parseChannelMessage(line);

    if (message.type === 'stop') {
      writeMessage({
        type: 'status',
        state: 'stopped',
      });
      if (!pluginProcess.killed) {
        pluginProcess.kill('SIGTERM');
      }
      process.exit(0);
      return;
    }

    if (message.type === 'send') {
      const payload = serializeChannelMessage(message);
      pluginProcess.stdin.write(`${payload}\n`);
    }
  });

  writeMessage({
    type: 'status',
    state: 'ready',
  });

  process.on('SIGINT', () => {
    writeMessage({
      type: 'status',
      state: 'stopped',
    });
    if (!pluginProcess.killed) {
      pluginProcess.kill('SIGTERM');
    }
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    writeMessage({
      type: 'status',
      state: 'stopped',
    });
    if (!pluginProcess.killed) {
      pluginProcess.kill('SIGTERM');
    }
    process.exit(0);
  });
}

async function run(): Promise<void> {
  const mode = process.env.BRIDGE_OPENCLAW_LITE_MODE ?? 'auto';
  if (mode === 'plugin') {
    await runPluginMode();
    return;
  }

  await runStubMode();
}

void run().catch((error) => {
  process.stderr.write(`[openclaw-lite] fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
