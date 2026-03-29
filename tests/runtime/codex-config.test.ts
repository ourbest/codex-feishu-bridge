import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCodexRuntimeConfig, resolveCodexRuntimeConfigs } from '../../src/runtime/codex-config.ts';

test('returns null when codex runtime is not enabled', () => {
  assert.equal(resolveCodexRuntimeConfig({}), null);
});

test('resolves codex runtime config from environment defaults', () => {
  assert.deepEqual(
    resolveCodexRuntimeConfig({
      BRIDGE_CODEX_PROJECT_INSTANCE_ID: 'project-a',
    }),
    {
      projectInstanceId: 'project-a',
      command: 'codex',
      args: ['app-server'],
      cwd: undefined,
      serviceName: 'codex-bridge',
      transport: 'websocket',
      websocketUrl: 'ws://127.0.0.1:4000',
    },
  );
});

test('resolves websocket transport from environment override', () => {
  assert.deepEqual(
    resolveCodexRuntimeConfig({
      BRIDGE_CODEX_PROJECT_INSTANCE_ID: 'project-a',
      BRIDGE_CODEX_TRANSPORT: 'websocket',
      BRIDGE_CODEX_WEBSOCKET_URL: 'ws://127.0.0.1:4567',
    }),
    {
      projectInstanceId: 'project-a',
      command: 'codex',
      args: ['app-server'],
      cwd: undefined,
      serviceName: 'codex-bridge',
      transport: 'websocket',
      websocketUrl: 'ws://127.0.0.1:4567',
    },
  );
});

test('resolves multiple codex runtime configs from environment json', () => {
  assert.deepEqual(
    resolveCodexRuntimeConfigs({
      BRIDGE_CODEX_PROJECTS_JSON: JSON.stringify([
        {
          projectInstanceId: 'project-a',
          cwd: '/repo/a',
        },
        {
          projectInstanceId: 'project-b',
          command: 'codex',
          args: ['app-server', '--listen', 'stdio://'],
        },
      ]),
    }),
    [
      {
        projectInstanceId: 'project-a',
        command: 'codex',
        args: ['app-server'],
        cwd: '/repo/a',
        serviceName: 'codex-bridge',
        transport: 'websocket',
        websocketUrl: 'ws://127.0.0.1:4000',
      },
      {
        projectInstanceId: 'project-b',
        command: 'codex',
        args: ['app-server', '--listen', 'stdio://'],
        cwd: undefined,
        serviceName: 'codex-bridge',
        transport: 'websocket',
        websocketUrl: 'ws://127.0.0.1:4000',
      },
    ],
  );
});
