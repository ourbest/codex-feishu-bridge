import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveConsoleRuntimeConfig } from '../../src/runtime/codex-console.ts';

test('returns null when console mode is disabled', () => {
  assert.equal(resolveConsoleRuntimeConfig({}), null);
});

test('resolves the default project-a console config', () => {
  assert.deepEqual(
    resolveConsoleRuntimeConfig({
      BRIDGE_CONSOLE: '1',
      HOME: '/Users/yonghui',
    }),
    {
      enabled: true,
      projectInstanceId: 'project-a',
      cwd: '/Users/yonghui/git/codex-bridge',
    },
  );
});
