import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { JsonLineProcessManager } from '../../src/channel/process-manager.ts';

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

test('feishu plugin process emits ready and forwards boot events', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-bridge-feishu-plugin-'));

  const events: Array<Record<string, unknown>> = [];
  const manager = new JsonLineProcessManager({
    command: '/Users/yonghui/.nvm/versions/node/v24.0.2/bin/node',
    args: ['--experimental-strip-types', '/Users/yonghui/git/codex-bridge/src/channel/feishu-plugin-process.ts'],
    cwd: '/Users/yonghui/git/codex-bridge',
    env: {
      FEISHU_PLUGIN_BOOT_EVENT_JSON: JSON.stringify({
        type: 'event',
        chatId: 'chat-123',
        messageId: 'message-1',
        text: 'hello',
        senderId: 'user-a',
        timestamp: '2026-03-29T10:00:00.000Z',
      }),
    },
  });

  manager.onEvent((event) => {
    events.push(event);
  });

  await manager.start();
  await waitFor(() => (events.find((event) => event.type === 'status' && event.state === 'ready') ?? null) as Record<string, unknown> | null);

  const bootEvent = await waitFor(
    () => (events.find((event) => event.type === 'event' && event.chatId === 'chat-123') ?? null) as Record<string, unknown> | null,
  );

  assert.deepEqual(bootEvent, {
    type: 'event',
    chatId: 'chat-123',
    messageId: 'message-1',
    text: 'hello',
    senderId: 'user-a',
    timestamp: '2026-03-29T10:00:00.000Z',
  });

  await manager.send({
    type: 'send',
    chatId: 'chat-123',
    text: 'reply',
  });

  await manager.stop();
});
