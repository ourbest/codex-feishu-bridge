import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { createBridgeApp } from '../../src/app.ts';
import { loadConfig } from '../../src/config/env.ts';
import type { LarkEventPayload, LarkTransport } from '../../src/adapters/lark/adapter.ts';
import { createProjectConfigWatcher } from '../../src/runtime/project-config-watcher.ts';
import { createProjectRegistry } from '../../src/runtime/project-registry.ts';

test('boots the bridge runtime and forwards a routed reply back to lark', async () => {
  const sentMessages: Array<{ sessionId: string; text: string }> = [];
  const sentCards: Array<{ sessionId: string; card: { msg_type: 'interactive'; content: string } }> = [];
  const reactions: Array<{ targetMessageId: string; emojiType: string }> = [];
  let eventHandler: ((event: LarkEventPayload) => Promise<void> | void) | null = null;

  const transport: LarkTransport = {
    onEvent(handler) {
      eventHandler = handler;
    },
    async sendMessage(message) {
      sentMessages.push(message);
    },
    async sendCard(message) {
      sentCards.push(message);
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
          configured: false,
          active: false,
          removed: false,
          sessionCount: 0,
        };
      },
    },
  });

  app.router.registerProjectHandler('project-a', async ({ message }) => ({
    text: `reply:${message.text}`,
  }));

  await app.bindingService.bindProjectToSession('project-a', 'session-a');
  await app.start();

  assert.equal(app.ready, true);
  assert.ok(app.apiServer);
  assert.ok(eventHandler);

  await eventHandler!({
    sessionId: 'session-a',
    messageId: 'message-1',
    text: 'hello',
    senderId: 'user-a',
    timestamp: '2026-03-29T00:00:00.000Z',
  });

  assert.deepEqual(reactions, [
    {
      targetMessageId: 'message-1',
      emojiType: 'THUMBSUP',
    },
  ]);
  assert.deepEqual(sentMessages, []);
  assert.equal(sentCards.length, 1);
  assert.deepEqual(sentCards[0], {
    sessionId: 'session-a',
    card: {
      msg_type: 'interactive',
      content: sentCards[0]?.card.content ?? '',
    },
    fallbackText: 'reply:hello',
  });
  const card = JSON.parse(sentCards[0].card.content) as {
    header?: { title?: { content?: string }; subtitle?: { content?: string } };
    body?: { elements?: Array<{ tag?: string; content?: string }> };
  };
  assert.equal(card.header?.title?.content, 'project-a');
  assert.equal(card.header?.subtitle, undefined);
  assert.ok(card.body?.elements?.some((element) => element.tag === 'markdown'));
  const footer = card.body?.elements?.find((element) => element.tag === 'markdown' && typeof element.content === 'string' && element.content.includes('PATH'));
  assert.ok(footer);
  assert.match(JSON.stringify(footer), /PATH/);
  assert.match(JSON.stringify(footer), /Transport/);
  assert.deepEqual(sentMessages, []);

  await app.stop();
  assert.equal(app.ready, false);
});

test('handles //sessions using the supplied project registry', async () => {
  const sentMessages: Array<{ sessionId: string; text: string }> = [];
  const sentCards: Array<{ sessionId: string; card: { msg_type: 'interactive'; content: string }; fallbackText?: string }> = [];
  const reactions: Array<{ targetMessageId: string; emojiType: string }> = [];
  let eventHandler: ((event: LarkEventPayload) => Promise<void> | void) | null = null;

  const transport: LarkTransport = {
    onEvent(handler) {
      eventHandler = handler;
    },
    async sendMessage(message) {
      sentMessages.push(message);
    },
    async sendCard(message) {
      sentCards.push(message);
    },
    async sendReaction(message) {
      reactions.push(message);
    },
  };

  const app = createBridgeApp({
    config: loadConfig({}),
    larkTransport: transport,
    projectRegistry: {
      async describeProject() {
        return {
          projectInstanceId: 'project-a',
          configured: true,
          active: false,
          removed: false,
          sessionCount: 0,
        };
      },
    },
  });

  await app.bindingService.bindProjectToSession('project-a', 'session-a');
  await app.start();

  assert.ok(eventHandler);

  await eventHandler!({
    sessionId: 'session-a',
    messageId: 'message-2',
    text: '//sessions',
    senderId: 'user-a',
    timestamp: '2026-03-29T00:00:00.000Z',
  });

  assert.deepEqual(reactions, [
    {
      targetMessageId: 'message-2',
      emojiType: 'THUMBSUP',
    },
  ]);
  assert.deepEqual(sentMessages, []);
  assert.equal(sentCards.length, 1);
  assert.equal(sentCards[0]?.sessionId, 'session-a');
  assert.match(sentCards[0]?.fallbackText ?? '', /\[codex-bridge\] Bridge State:/);
  const card = JSON.parse(sentCards[0]?.card.content ?? '{}') as {
    header?: { title?: { content?: string } };
    body?: { elements?: Array<{ tag?: string; content?: string }> };
  };
  assert.equal(card.header?.title?.content, 'Session State');
  assert.ok(card.body?.elements?.some((element) => element.tag === 'markdown' && String(element.content).includes('chatId: session-a')));

  await app.stop();
});

test('renders codex query command results as interactive cards', async () => {
  const sentMessages: Array<{ sessionId: string; text: string }> = [];
  const sentCards: Array<{ sessionId: string; card: { msg_type: 'interactive'; content: string }; fallbackText?: string }> = [];
  const reactions: Array<{ targetMessageId: string; emojiType: string }> = [];
  let eventHandler: ((event: LarkEventPayload) => Promise<void> | void) | null = null;

  const transport: LarkTransport = {
    onEvent(handler) {
      eventHandler = handler;
    },
    async sendMessage(message) {
      sentMessages.push(message);
    },
    async sendCard(message) {
      sentCards.push(message);
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
          active: true,
          removed: false,
          sessionCount: 1,
        };
      },
      getProjectConfig(projectInstanceId) {
        return {
          projectInstanceId,
          cwd: '/repo/project-a',
          transport: 'stdio',
          command: 'codex',
          args: ['app-server'],
        };
      },
    },
    executeStructuredCodexCommand: async ({ method }) => {
      if (method === 'app/list') {
        return [
          '[codex-bridge] app/list: 1 item(s)',
          '1. shell',
          '   title: Shell',
        ];
      }

      return [
        '[codex-bridge] thread/read',
        'id: thr_123',
        'preview: hello world',
      ];
    },
  });

  await app.bindingService.bindProjectToSession('project-a', 'session-a');
  await app.start();
  assert.ok(eventHandler);

  await eventHandler!({
    sessionId: 'session-a',
    messageId: 'message-app-list',
    text: 'app/list',
    senderId: 'user-a',
    timestamp: '2026-03-29T00:00:00.000Z',
  });

  await eventHandler!({
    sessionId: 'session-a',
    messageId: 'message-thread-read',
    text: 'thread/read thr_123',
    senderId: 'user-a',
    timestamp: '2026-03-29T00:00:01.000Z',
  });

  assert.deepEqual(sentMessages, []);
  assert.equal(sentCards.length, 2);
  assert.match(sentCards[0]?.fallbackText ?? '', /\[codex-bridge\] app\/list: 1 item\(s\)/);
  assert.match(sentCards[1]?.fallbackText ?? '', /\[codex-bridge\] thread\/read/);

  const firstCard = JSON.parse(sentCards[0]?.card.content ?? '{}') as {
    header?: { title?: { content?: string } };
    body?: { elements?: Array<{ tag?: string; content?: string }> };
  };
  assert.equal(firstCard.header?.title?.content, 'app/list');
  assert.ok(firstCard.body?.elements?.some((element) => element.tag === 'markdown' && String(element.content).includes('1. shell')));

  const secondCard = JSON.parse(sentCards[1]?.card.content ?? '{}') as {
    header?: { title?: { content?: string } };
    body?: { elements?: Array<{ tag?: string; content?: string }> };
  };
  assert.equal(secondCard.header?.title?.content, 'thread/read');
  assert.ok(secondCard.body?.elements?.some((element) => element.tag === 'markdown' && String(element.content).includes('id: thr_123')));

  await app.stop();
});

test('acknowledges //restart before invoking the restart callback', async () => {
  const sentMessages: Array<{ sessionId: string; text: string }> = [];
  const reactions: Array<{ targetMessageId: string; emojiType: string }> = [];
  const steps: string[] = [];
  let eventHandler: ((event: LarkEventPayload) => Promise<void> | void) | null = null;

  const transport: LarkTransport = {
    onEvent(handler) {
      eventHandler = handler;
    },
    async sendMessage(message) {
      sentMessages.push(message);
      steps.push(`send:${message.text}`);
    },
    async sendReaction(message) {
      reactions.push(message);
    },
  };

  const app = createBridgeApp({
    config: loadConfig({}),
    larkTransport: transport,
    onRestartRequested: async () => {
      steps.push('restart');
    },
    projectRegistry: {
      async describeProject(projectInstanceId) {
        return {
          projectInstanceId,
          configured: false,
          active: false,
          removed: false,
          sessionCount: 0,
        };
      },
    },
  });

  await app.start();
  assert.ok(eventHandler);

  await eventHandler!({
    sessionId: 'session-restart',
    messageId: 'message-restart',
    text: '//restart',
    senderId: 'user-restart',
    timestamp: '2026-03-29T00:00:00.000Z',
  });

  assert.deepEqual(reactions, [
    {
      targetMessageId: 'message-restart',
      emojiType: 'THUMBSUP',
    },
  ]);
  assert.deepEqual(sentMessages, [
    {
      sessionId: 'session-restart',
      text: '[codex-bridge] restarting bridge process...',
    },
  ]);
  assert.deepEqual(steps, [
    'send:[codex-bridge] restarting bridge process...',
    'restart',
  ]);

  await app.stop();
});

test('renders //help as an interactive card for easier reading', async () => {
  const sentMessages: Array<{ sessionId: string; text: string }> = [];
  const sentCards: Array<{ sessionId: string; card: { msg_type: 'interactive'; content: string }; fallbackText?: string }> = [];
  const reactions: Array<{ targetMessageId: string; emojiType: string }> = [];
  let eventHandler: ((event: LarkEventPayload) => Promise<void> | void) | null = null;

  const transport: LarkTransport = {
    onEvent(handler) {
      eventHandler = handler;
    },
    async sendMessage(message) {
      sentMessages.push(message);
    },
    async sendCard(message) {
      sentCards.push(message);
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
          configured: false,
          active: false,
          removed: false,
          sessionCount: 0,
        };
      },
    },
  });

  await app.start();
  assert.ok(eventHandler);

  await eventHandler!({
    sessionId: 'session-help',
    messageId: 'message-help',
    text: '//help',
    senderId: 'user-help',
    timestamp: '2026-03-29T00:00:00.000Z',
  });

  assert.deepEqual(reactions, [
    {
      targetMessageId: 'message-help',
      emojiType: 'THUMBSUP',
    },
  ]);
  assert.deepEqual(sentMessages, []);
  assert.equal(sentCards.length, 1);
  assert.equal(sentCards[0]?.sessionId, 'session-help');
  assert.equal(sentCards[0]?.card.msg_type, 'interactive');
  assert.match(sentCards[0]?.fallbackText ?? '', /\[codex-bridge\] commands:/);

  const card = JSON.parse(sentCards[0]?.card.content ?? '{}') as {
    header?: { title?: { content?: string } };
    body?: { elements?: Array<{ tag?: string; content?: string }> };
  };
  assert.equal(card.header?.title?.content, 'codex-bridge help');
  assert.ok(card.body?.elements?.some((element) => element.tag === 'markdown' && String(element.content).includes('//bind')));
  assert.ok(card.body?.elements?.some((element) => element.tag === 'markdown' && String(element.content).includes('thread/start')));

  await app.stop();
});

test('renders unbound guidance as an interactive card', async () => {
  const sentMessages: Array<{ sessionId: string; text: string }> = [];
  const sentCards: Array<{ sessionId: string; card: { msg_type: 'interactive'; content: string }; fallbackText?: string }> = [];
  const reactions: Array<{ targetMessageId: string; emojiType: string }> = [];
  let eventHandler: ((event: LarkEventPayload) => Promise<void> | void) | null = null;

  const transport: LarkTransport = {
    onEvent(handler) {
      eventHandler = handler;
    },
    async sendMessage(message) {
      sentMessages.push(message);
    },
    async sendCard(message) {
      sentCards.push(message);
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
          configured: false,
          active: false,
          removed: false,
          sessionCount: 0,
        };
      },
    },
  });

  await app.start();
  assert.ok(eventHandler);

  await eventHandler!({
    sessionId: 'session-unbound',
    messageId: 'message-unbound',
    text: 'hello there',
    senderId: 'user-unbound',
    timestamp: '2026-03-29T00:00:00.000Z',
  });

  assert.deepEqual(reactions, [
    {
      targetMessageId: 'message-unbound',
      emojiType: 'THUMBSUP',
    },
  ]);
  assert.deepEqual(sentMessages, []);
  assert.equal(sentCards.length, 1);
  assert.equal(sentCards[0]?.sessionId, 'session-unbound');
  assert.equal(sentCards[0]?.card.msg_type, 'interactive');
  assert.match(sentCards[0]?.fallbackText ?? '', /unbound session/);
  assert.match(sentCards[0]?.fallbackText ?? '', /\/\/bind <projectId>/);

  const card = JSON.parse(sentCards[0]?.card.content ?? '{}') as {
    header?: { title?: { content?: string } };
    body?: { elements?: Array<{ tag?: string; content?: string }> };
  };
  assert.equal(card.header?.title?.content, 'codex-bridge');
  assert.ok(card.body?.elements?.some((element) => element.tag === 'markdown' && String(element.content).includes('not bound')));
  assert.ok(card.body?.elements?.some((element) => element.tag === 'markdown' && String(element.content).includes('//bind <projectId>')));

  await app.stop();
});

test('handles //reload projects by reloading a real projects file and reconciling state', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'codex-bridge-projects-'));
  const filePath = join(tempDir, 'projects.json');
  writeFileSync(
    filePath,
    `${JSON.stringify(
      {
        projects: [
          {
            projectInstanceId: 'project-a',
            websocketUrl: 'ws://127.0.0.1:4000',
          },
        ],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const sentMessages: Array<{ sessionId: string; text: string }> = [];
  const sentCards: Array<{ sessionId: string; card: { msg_type: 'interactive'; content: string }; fallbackText?: string }> = [];
  const reactions: Array<{ targetMessageId: string; emojiType: string }> = [];
  let eventHandler: ((event: LarkEventPayload) => Promise<void> | void) | null = null;
  const projectConfigs: Array<{ projectInstanceId: string; websocketUrl: string }> = [];

  const registry = createProjectRegistry({
    getProjectConfig(projectInstanceId) {
      return projectConfigs.find((entry) => entry.projectInstanceId === projectInstanceId) ?? null;
    },
    createClient: () => ({
      async generateReply({ text }) {
        return `reply:${text}`;
      },
      async stop() {},
    }),
  });

  const watcher = createProjectConfigWatcher({
    filePath,
  });

  const transport: LarkTransport = {
    onEvent(handler) {
      eventHandler = handler;
    },
    async sendMessage(message) {
      sentMessages.push(message);
    },
    async sendCard(message) {
      sentCards.push(message);
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
        return registry.describeProject(projectInstanceId);
      },
    },
    reloadProjects: async () => {
      const projects = await watcher.reload();
      projectConfigs.splice(0, projectConfigs.length, ...projects.map((entry) => ({
        projectInstanceId: entry.projectInstanceId,
        websocketUrl: entry.websocketUrl ?? 'ws://127.0.0.1:4000',
      })));
      await registry.reconcileProjectConfigs(projectConfigs);
      return [`[codex-bridge] reloaded projects: ${projects.length}`];
    },
  });

  await registry.reconcileProjectConfigs([]);
  await app.start();
  await app.bindingService.bindProjectToSession('project-a', 'session-a');
  assert.ok(eventHandler);

  await eventHandler!({
    sessionId: 'session-a',
    messageId: 'message-3',
    text: '//reload projects',
    senderId: 'user-a',
    timestamp: '2026-03-29T00:00:00.000Z',
  });

  assert.deepEqual(reactions, [
    {
      targetMessageId: 'message-3',
      emojiType: 'THUMBSUP',
    },
  ]);
  assert.deepEqual(sentMessages, [
    {
      sessionId: 'session-a',
      text: '[codex-bridge] reloaded projects: 1',
    },
  ]);

  const stateAfterReload = await registry.describeProject('project-a');
  assert.deepEqual(stateAfterReload, {
    projectInstanceId: 'project-a',
    configured: true,
    active: false,
    removed: false,
    sessionCount: 0,
  });

  await eventHandler!({
    sessionId: 'session-a',
    messageId: 'message-4',
    text: '//sessions',
    senderId: 'user-a',
    timestamp: '2026-03-29T00:00:01.000Z',
  });

  assert.equal(sentMessages[1]?.text, undefined);
  assert.equal(sentCards.length, 1);
  assert.match(sentCards[0]?.fallbackText ?? '', /\[codex-bridge\] Bridge State:/);

  await app.stop();
  rmSync(tempDir, { recursive: true, force: true });
});

test('rejects app construction without a real project registry', async () => {
  const transport: LarkTransport = {
    onEvent() {},
    async sendMessage() {},
    async sendReaction() {},
  };

  await assert.rejects(
    async () =>
      createBridgeApp({
        config: loadConfig({}),
        larkTransport: transport,
      }),
    /projectRegistry is required/,
  );
});
