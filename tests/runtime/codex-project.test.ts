import assert from 'node:assert/strict';
import test from 'node:test';

import { createBridgeApp } from '../../src/app.ts';
import { loadConfig } from '../../src/config/env.ts';
import type { LarkEventPayload, LarkTransport } from '../../src/adapters/lark/adapter.ts';
import { createCodexProjectSession } from '../../src/runtime/codex-project.ts';

test('routes inbound lark messages through a codex project session', async () => {
  const sentCards: Array<{ sessionId: string; card: { msg_type: 'interactive'; content: string }; fallbackText?: string }> = [];
  const updatedCards: Array<{ messageId: string; card: { msg_type: 'interactive'; content: string }; fallbackText?: string }> = [];
  let eventHandler: ((event: LarkEventPayload) => Promise<void> | void) | null = null;
  const codexInputs: string[] = [];

  const transport: LarkTransport = {
    onEvent(handler) {
      eventHandler = handler;
    },
    async sendMessage() {
      return undefined;
    },
    async sendCard(message) {
      sentCards.push(message);
      return { messageId: `card-${sentCards.length}` };
    },
    async updateCard(message) {
      updatedCards.push(message);
    },
    async sendReaction() {},
  };

  const app = createBridgeApp({
    config: loadConfig({}),
    larkTransport: transport,
    projectRegistry: {
      async describeProject(projectInstanceId) {
        return {
          projectInstanceId,
          configured: true,
          active: false,
          removed: false,
          sessionCount: 0,
        };
      },
    },
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
  assert.equal(sentCards.length, 2);
  assert.equal(updatedCards.length, 0);
  assert.match(sentCards[1]?.fallbackText ?? '', /codex:hello/);

  await codexProject.stop();
  await app.stop();
});
