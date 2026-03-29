import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createOpenClawLiteTransport } from '../../../src/adapters/lark/openclaw-lite-transport.ts';
import { createBridgeApp } from '../../../src/app.ts';
import { loadConfig } from '../../../src/config/env.ts';

async function waitFor<T>(predicate: () => T | null, timeoutMs = 2000): Promise<T> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = predicate();
    if (value !== null) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error('Timed out waiting for condition');
}

test('starts an openclaw-lite child process and routes bridge replies back through it', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-bridge-openclaw-lite-'));
  const scriptPath = path.join(tempDir, 'mock-openclaw-lite-runtime.js');
  await writeFile(
    scriptPath,
    [
      "import readline from 'node:readline';",
      "const bootEvent = process.env.OPENCLAW_LITE_BOOT_EVENT_JSON;",
      "process.stdout.write(JSON.stringify({ type: 'status', state: 'ready' }) + '\\n');",
      'if (bootEvent) {',
      '  process.stdout.write(`${bootEvent}\\n`);',
      '}',
      "const input = readline.createInterface({ input: process.stdin });",
      "input.on('line', (line) => {",
      '  const message = JSON.parse(line);',
      "  if (message.type === 'send') {",
      "    process.stdout.write(JSON.stringify({ type: 'status', state: 'reconnecting' }) + '\\n');",
      '  }',
      "  if (message.type === 'stop') {",
      "    process.stdout.write(JSON.stringify({ type: 'status', state: 'stopped' }) + '\\n');",
      '    process.exit(0);',
      '  }',
      '});',
      '',
    ].join('\n'),
  );

  const sentMessages: Array<{ sessionId: string; text: string }> = [];
  const transport = createOpenClawLiteTransport({
    command: '/Users/yonghui/.nvm/versions/node/v24.0.2/bin/node',
    args: ['--experimental-strip-types', scriptPath],
    cwd: tempDir,
    env: {
      OPENCLAW_LITE_BOOT_EVENT_JSON: JSON.stringify({
        type: 'event',
        chatId: 'chat-123',
        messageId: 'message-1',
        text: 'hello',
        senderId: 'user-a',
        timestamp: '2026-03-29T10:00:00.000Z',
      }),
    },
    onSend(message) {
      sentMessages.push(message);
    },
  });

  const app = createBridgeApp({
    config: loadConfig({}),
    larkTransport: transport,
  });

  app.router.registerProjectHandler('project-a', async ({ message }) => ({
    text: `reply:${message.text}`,
  }));

  await app.bindingService.bindProjectToSession('project-a', 'chat-123');
  await app.start();

  const reply = await waitFor(() => sentMessages[0] ?? null);
  assert.deepEqual(reply, {
    sessionId: 'chat-123',
    text: 'reply:hello',
  });

  await app.stop();
});
