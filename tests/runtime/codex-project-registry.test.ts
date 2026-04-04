import assert from 'node:assert/strict';
import test from 'node:test';

import { createBridgeApp } from '../../src/app.ts';
import { loadConfig } from '../../src/config/env.ts';
import type { LarkEventPayload, LarkTransport } from '../../src/adapters/lark/adapter.ts';
import { createCodexProjectRegistry } from '../../src/runtime/codex-project-registry.ts';

test('routes each bound session to its matching codex project client', async () => {
  const sentMessages: Array<{ sessionId: string; text: string }> = [];
  const reactions: Array<{ targetMessageId: string; emojiType: string }> = [];
  let eventHandler: ((event: LarkEventPayload) => Promise<void> | void) | null = null;
  const projectAInputs: string[] = [];
  const projectBInputs: string[] = [];

  const transport: LarkTransport = {
    onEvent(handler) {
      eventHandler = handler;
    },
    async sendMessage(message) {
      sentMessages.push(message);
    },
    async sendReaction(message) {
      reactions.push(message);
    },
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

  const registry = createCodexProjectRegistry([
    {
      projectInstanceId: 'project-a',
      client: {
        async generateReply(input) {
          projectAInputs.push(input.text);
          return `a:${input.text}`;
        },
        async stop() {},
      },
    },
    {
      projectInstanceId: 'project-b',
      client: {
        async generateReply(input) {
          projectBInputs.push(input.text);
          return `b:${input.text}`;
        },
        async stop() {},
      },
    },
  ]);

  registry.attach(app.router);

  await app.bindingService.bindProjectToSession('project-a', 'session-a');
  await app.bindingService.bindProjectToSession('project-b', 'session-b');
  await app.start();

  await eventHandler!({
    sessionId: 'session-a',
    messageId: 'message-1',
    text: 'hello',
    senderId: 'user-a',
    timestamp: '2026-03-29T00:00:00.000Z',
  });

  await eventHandler!({
    sessionId: 'session-b',
    messageId: 'message-2',
    text: 'world',
    senderId: 'user-b',
    timestamp: '2026-03-29T00:00:01.000Z',
  });

  assert.deepEqual(projectAInputs, ['hello']);
  assert.deepEqual(projectBInputs, ['world']);
  assert.deepEqual(reactions, [
    { targetMessageId: 'message-1', emojiType: 'THUMBSUP' },
    { targetMessageId: 'message-2', emojiType: 'THUMBSUP' },
  ]);
  assert.deepEqual(sentMessages, [
    { sessionId: 'session-a', text: 'a:hello' },
    { sessionId: 'session-b', text: 'b:world' },
  ]);

  await registry.stop();
  await app.stop();
});
