import assert from 'node:assert/strict';
import test from 'node:test';

import { createBridgeApp } from '../../src/app.ts';
import { loadConfig } from '../../src/config/env.ts';
import type { LarkEventPayload, LarkTransport } from '../../src/adapters/lark/adapter.ts';
import { createCodexProjectSession } from '../../src/runtime/codex-project.ts';

test('routes inbound lark messages through a codex project session', async () => {
  const sentMessages: Array<{ sessionId: string; text: string }> = [];
  let eventHandler: ((event: LarkEventPayload) => Promise<void> | void) | null = null;
  const codexInputs: string[] = [];

  const transport: LarkTransport = {
    onEvent(handler) {
      eventHandler = handler;
    },
    async sendMessage(message) {
      sentMessages.push(message);
    },
  };

  const app = createBridgeApp({
    config: loadConfig({}),
    larkTransport: transport,
  });

  const codexProject = createCodexProjectSession({
    projectInstanceId: 'project-a',
    client: {
      async generateReply(input) {
        codexInputs.push(input.text);
        return `codex:${input.text}`;
      },
      async stop() {},
    },
  });

  codexProject.attach(app.router);

  await app.bindingService.bindProjectToSession('project-a', 'session-a');
  await app.start();

  await eventHandler!({
    sessionId: 'session-a',
    messageId: 'message-1',
    text: 'hello',
    senderId: 'user-a',
    timestamp: '2026-03-29T00:00:00.000Z',
  });

  assert.deepEqual(codexInputs, ['hello']);
  assert.deepEqual(sentMessages, [{ sessionId: 'session-a', text: 'codex:hello' }]);

  await codexProject.stop();
  await app.stop();
});
