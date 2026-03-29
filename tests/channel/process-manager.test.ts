import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
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

test('starts a json-line child process and relays messages', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-bridge-channel-'));
  const scriptPath = path.join(tempDir, 'mock-channel-runtime.js');
  await writeFile(
    scriptPath,
    [
      "import readline from 'node:readline';",
      "process.stdout.write(JSON.stringify({ type: 'status', state: 'ready' }) + '\\n');",
      "const input = readline.createInterface({ input: process.stdin });",
      "input.on('line', (line) => {",
      '  const message = JSON.parse(line);',
      "  if (message.type === 'send') {",
      "    process.stdout.write(JSON.stringify({ type: 'event', chatId: message.chatId, messageId: 'message-1', text: `echo:${message.text}`, senderId: 'bridge', timestamp: '2026-03-29T10:00:00.000Z' }) + '\\n');",
      '  }',
      "  if (message.type === 'stop') {",
      "    process.stdout.write(JSON.stringify({ type: 'status', state: 'stopped' }) + '\\n');",
      '    process.exit(0);',
      '  }',
      '});',
      '',
    ].join('\n'),
  );

  const events: Array<Record<string, unknown>> = [];
  const manager = new JsonLineProcessManager({
    command: '/Users/yonghui/.nvm/versions/node/v24.0.2/bin/node',
    args: ['--experimental-strip-types', scriptPath],
    cwd: tempDir,
  });

  manager.onEvent((event) => {
    events.push(event);
  });

  await manager.start();
  await waitFor(() => (events.find((event) => event.type === 'status' && event.state === 'ready') ?? null) as Record<string, unknown> | null);

  await manager.send({
    type: 'send',
    chatId: 'chat-123',
    text: 'hello',
  });

  const reply = await waitFor(
    () => (events.find((event) => event.type === 'event' && event.chatId === 'chat-123') ?? null) as Record<string, unknown> | null,
  );
  assert.deepEqual(reply, {
    type: 'event',
    chatId: 'chat-123',
    messageId: 'message-1',
    text: 'echo:hello',
    senderId: 'bridge',
    timestamp: '2026-03-29T10:00:00.000Z',
  });

  await manager.stop();
  await waitFor(() => (events.find((event) => event.type === 'status' && event.state === 'stopped') ?? null) as Record<string, unknown> | null);

  const capturedScript = await readFile(scriptPath, 'utf8');
  assert.match(capturedScript, /process\.stdout\.write/);
});
