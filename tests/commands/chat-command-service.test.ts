import assert from 'node:assert/strict';
import test from 'node:test';

import { BindingService } from '../../src/core/binding/binding-service.ts';
import { createChatCommandService } from '../../src/commands/chat-command-service.ts';
import { InMemoryBindingStore } from '../../src/storage/binding-store.ts';
import { createProjectRegistry } from '../../src/runtime/project-registry.ts';

function createBindingService(): BindingService {
  return new BindingService(new InMemoryBindingStore());
}

test('returns bridge and codex state for //sessions on a bound chat', async () => {
  const bindingService = createBindingService();
  const registry = createProjectRegistry({
    getProjectConfig: (projectInstanceId) =>
      projectInstanceId === 'project-a'
        ? { projectInstanceId: 'project-a', websocketUrl: 'ws://localhost:4000' }
        : null,
    createClient: () => ({
      async generateReply() {
        return 'reply';
      },
      async stop() {},
    }),
  });

  await bindingService.bindProjectToSession('project-a', 'chat-a');
  await registry.onBindingChanged({ type: 'bound', projectId: 'project-a', sessionId: 'chat-a' });

  const service = createChatCommandService({
    bindingService,
    projectRegistry: registry,
  });

  const lines = await service.execute({
    sessionId: 'chat-a',
    senderId: 'user-a',
    text: '//sessions',
  });

  assert.deepEqual(lines, [
    '[codex-bridge] Bridge State:',
    '  chatId: chat-a',
    '  senderId: user-a',
    '  projectId: project-a',
    '[codex-bridge] Codex State:',
    '  projectId: project-a',
    '  configured: yes',
    '  active: yes',
    '  removed: no',
  ]);
});

test('returns the current binding for //list', async () => {
  const bindingService = createBindingService();
  const registry = createProjectRegistry({
    getProjectConfig: (projectInstanceId) =>
      projectInstanceId === 'project-a'
        ? { projectInstanceId: 'project-a', websocketUrl: 'ws://localhost:4000' }
        : null,
    createClient: () => ({
      async generateReply() {
        return 'reply';
      },
      async stop() {},
    }),
  });

  await bindingService.bindProjectToSession('project-a', 'chat-a');
  await registry.onBindingChanged({ type: 'bound', projectId: 'project-a', sessionId: 'chat-a' });

  const service = createChatCommandService({
    bindingService,
    projectRegistry: registry,
  });

  const lines = await service.execute({
    sessionId: 'chat-a',
    senderId: 'user-a',
    text: '//list',
  });

  assert.deepEqual(lines, [
    '[codex-bridge] current binding:',
    '  chatId: chat-a',
    '  senderId: user-a',
    '  projectId: project-a',
  ]);
});

test('routes bare codex commands through the executor when bound', async () => {
  const bindingService = createBindingService();
  const registry = createProjectRegistry({
    getProjectConfig: (projectInstanceId) =>
      projectInstanceId === 'project-a'
        ? { projectInstanceId: 'project-a', websocketUrl: 'ws://localhost:4000' }
        : null,
    createClient: () => ({
      async generateReply() {
        return 'reply';
      },
      async stop() {},
    }),
  });
  const calls: Array<{
    sessionId: string;
    senderId: string;
    projectInstanceId: string;
    command: string;
    args: string[];
  }> = [];

  await bindingService.bindProjectToSession('project-a', 'chat-a');
  await registry.onBindingChanged({ type: 'bound', projectId: 'project-a', sessionId: 'chat-a' });

  const service = createChatCommandService({
    bindingService,
    projectRegistry: registry,
    executeCodexCommand: async (input) => {
      calls.push(input);
      return ['[codex-bridge] codex ok'];
    },
  });

  const lines = await service.execute({
    sessionId: 'chat-a',
    senderId: 'user-a',
    text: 'app/list',
  });

  assert.deepEqual(calls, [
    {
      sessionId: 'chat-a',
      senderId: 'user-a',
      projectInstanceId: 'project-a',
      command: 'app/list',
      args: [],
    },
  ]);
  assert.deepEqual(lines, ['[codex-bridge] codex ok']);
});

test('returns a configuration error when the codex executor is unavailable', async () => {
  const bindingService = createBindingService();
  const registry = createProjectRegistry({
    getProjectConfig: (projectInstanceId) =>
      projectInstanceId === 'project-a'
        ? { projectInstanceId: 'project-a', websocketUrl: 'ws://localhost:4000' }
        : null,
    createClient: () => ({
      async generateReply() {
        return 'reply';
      },
      async stop() {},
    }),
  });

  await bindingService.bindProjectToSession('project-a', 'chat-a');
  await registry.onBindingChanged({ type: 'bound', projectId: 'project-a', sessionId: 'chat-a' });

  const service = createChatCommandService({
    bindingService,
    projectRegistry: registry,
  });

  const lines = await service.execute({
    sessionId: 'chat-a',
    senderId: 'user-a',
    text: 'app/list',
  });

  assert.deepEqual(lines, [
    '[codex-bridge] codex command support is not configured',
    '  projectId: project-a',
    '  command: app/list',
  ]);
});

test('routes a whitelisted structured codex command through the executor', async () => {
  const bindingService = createBindingService();
  const registry = createProjectRegistry({
    getProjectConfig: (projectInstanceId) =>
      projectInstanceId === 'project-a'
        ? { projectInstanceId: 'project-a', websocketUrl: 'ws://localhost:4000' }
        : null,
    createClient: () => ({
      async generateReply() {
        return 'reply';
      },
      async stop() {},
    }),
  });
  const calls: Array<{
    sessionId: string;
    senderId: string;
    projectInstanceId: string;
    method: string;
    params: Record<string, unknown>;
  }> = [];

  await bindingService.bindProjectToSession('project-a', 'chat-a');
  await registry.onBindingChanged({ type: 'bound', projectId: 'project-a', sessionId: 'chat-a' });

  const service = createChatCommandService({
    bindingService,
    projectRegistry: registry,
    executeStructuredCodexCommand: async (input) => {
      calls.push(input);
      return ['[codex-bridge] codex ok'];
    },
  });

  const lines = await service.execute({
    sessionId: 'chat-a',
    senderId: 'user-a',
    text: 'session/get chat-a',
  });

  assert.deepEqual(calls, [
    {
      sessionId: 'chat-a',
      senderId: 'user-a',
      projectInstanceId: 'project-a',
      method: 'session/get',
      params: {
        id: 'chat-a',
      },
    },
  ]);
  assert.deepEqual(lines, ['[codex-bridge] codex ok']);
});

test('rejects unsupported codex commands before they reach the executor', async () => {
  const bindingService = createBindingService();
  const registry = createProjectRegistry({
    getProjectConfig: (projectInstanceId) =>
      projectInstanceId === 'project-a'
        ? { projectInstanceId: 'project-a', websocketUrl: 'ws://localhost:4000' }
        : null,
    createClient: () => ({
      async generateReply() {
        return 'reply';
      },
      async stop() {},
    }),
  });
  let called = false;

  await bindingService.bindProjectToSession('project-a', 'chat-a');
  await registry.onBindingChanged({ type: 'bound', projectId: 'project-a', sessionId: 'chat-a' });

  const service = createChatCommandService({
    bindingService,
    projectRegistry: registry,
    executeStructuredCodexCommand: async () => {
      called = true;
      return ['unexpected'];
    },
  });

  const lines = await service.execute({
    sessionId: 'chat-a',
    senderId: 'user-a',
    text: 'session/delete chat-a',
  });

  assert.equal(called, false);
  assert.deepEqual(lines, [
    '[codex-bridge] unknown command: session/delete chat-a',
    '[codex-bridge] commands:',
    '  //bind <projectId>  - bind this chat to a project',
    '  //unbind            - unbind this chat',
    '  //list              - show current binding',
    '  //sessions          - show bridge and codex state',
    '  //reload projects   - reload projects.json',
    '  //help              - show this help',
    '  app/list            - list codex apps',
    '  session/list        - list codex sessions',
    '  session/get <id>    - get a codex session',
    '  thread/get <id>     - get a codex thread',
  ]);
});

test('returns an error for unknown // commands instead of falling through', async () => {
  const bindingService = createBindingService();
  const registry = createProjectRegistry({
    getProjectConfig: () => null,
    createClient: () => ({
      async generateReply() {
        return 'reply';
      },
      async stop() {},
    }),
  });

  const service = createChatCommandService({
    bindingService,
    projectRegistry: registry,
  });

  const lines = await service.execute({
    sessionId: 'chat-a',
    senderId: 'user-a',
    text: '//sesions',
  });

  assert.deepEqual(lines, [
    '[codex-bridge] unknown command: //sesions',
    '[codex-bridge] commands:',
    '  //bind <projectId>  - bind this chat to a project',
    '  //unbind            - unbind this chat',
    '  //list              - show current binding',
    '  //sessions          - show bridge and codex state',
    '  //reload projects   - reload projects.json',
    '  //help              - show this help',
    '  app/list            - list codex apps',
    '  session/list        - list codex sessions',
    '  session/get <id>    - get a codex session',
    '  thread/get <id>     - get a codex thread',
  ]);
});
