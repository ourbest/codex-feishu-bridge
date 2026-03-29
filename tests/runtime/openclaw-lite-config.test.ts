import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveOpenClawLiteRuntimeConfig } from '../../src/runtime/openclaw-lite-config.ts';

test('resolves openclaw-lite runtime config from environment overrides', () => {
  const config = resolveOpenClawLiteRuntimeConfig({
    BRIDGE_OPENCLAW_LITE_PLUGIN_COMMAND: '/usr/bin/node',
    BRIDGE_OPENCLAW_LITE_PLUGIN_ARGS_JSON: '["--flag","script.js"]',
    BRIDGE_OPENCLAW_LITE_PLUGIN_CWD: '/tmp/openclaw-lite',
    BRIDGE_OPENCLAW_LITE_PLUGIN_ENV_JSON: '{"FOO":"bar"}',
  });

  assert.deepEqual(config, {
    command: '/usr/bin/node',
    args: ['--flag', 'script.js'],
    cwd: '/tmp/openclaw-lite',
    env: {
      FOO: 'bar',
    },
  });
});

test('returns null when openclaw-lite is not enabled', () => {
  assert.equal(resolveOpenClawLiteRuntimeConfig({}), null);
});

test('does not fall back to legacy connector env names', () => {
  assert.equal(
    resolveOpenClawLiteRuntimeConfig({
      BRIDGE_OPENCLAW_LITE_CONNECTOR_COMMAND: '/usr/bin/node',
      BRIDGE_OPENCLAW_LITE_CONNECTOR_ARGS_JSON: '["--flag","script.js"]',
    } as never),
    null,
  );
});

test('defaults to the bundled openclaw-lite process entry when enabled without explicit command', () => {
  const config = resolveOpenClawLiteRuntimeConfig({
    BRIDGE_OPENCLAW_LITE_ENABLED: '1',
  });

  assert.equal(config?.command, process.execPath);
  assert.ok(config !== null);
  assert.equal(config.args[0], '--experimental-strip-types');
  assert.match(config.args[1], /openclaw-lite-process\.ts$/);
});
