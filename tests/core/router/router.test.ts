import assert from 'node:assert/strict';
import test from 'node:test';

import { BindingService } from '../../../src/core/binding/binding-service.ts';
import { BridgeRouter } from '../../../src/core/router/router.ts';
import { InMemoryBindingStore } from '../../../src/storage/binding-store.ts';

test('routes a bound inbound message to the matching project handler', async () => {
  const bindingService = new BindingService(new InMemoryBindingStore());
  const router = new BridgeRouter(bindingService);

  await bindingService.bindProjectToSession('project-a', 'session-a');
  router.registerProjectHandler('project-a', async ({ message }) => ({
    text: `reply:${message.text}`,
  }));

  const outbound = await router.routeInboundMessage({
    source: 'lark',
    sessionId: 'session-a',
    messageId: 'message-1',
    text: 'hello',
    senderId: 'user-a',
    timestamp: '2026-03-29T00:00:00.000Z',
  });

  assert.deepEqual(outbound, {
    targetSessionId: 'session-a',
    text: 'reply:hello',
  });
});

test('ignores an inbound message when the session is not bound', async () => {
  const bindingService = new BindingService(new InMemoryBindingStore());
  const router = new BridgeRouter(bindingService);

  const outbound = await router.routeInboundMessage({
    source: 'lark',
    sessionId: 'session-a',
    messageId: 'message-1',
    text: 'hello',
    senderId: 'user-a',
    timestamp: '2026-03-29T00:00:00.000Z',
  });

  assert.equal(outbound, null);
});

test('keeps outbound replies targeted at the rebound session', async () => {
  const bindingService = new BindingService(new InMemoryBindingStore());
  const router = new BridgeRouter(bindingService);

  await bindingService.bindProjectToSession('project-a', 'session-a');
  await bindingService.bindProjectToSession('project-a', 'session-b');
  router.registerProjectHandler('project-a', async ({ message }) => ({
    text: `reply:${message.text}`,
  }));

  const outbound = await router.routeInboundMessage({
    source: 'lark',
    sessionId: 'session-b',
    messageId: 'message-1',
    text: 'hello',
    senderId: 'user-a',
    timestamp: '2026-03-29T00:00:00.000Z',
  });

  assert.deepEqual(outbound, {
    targetSessionId: 'session-b',
    text: 'reply:hello',
  });
});
