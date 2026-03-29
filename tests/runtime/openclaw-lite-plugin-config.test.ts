import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveOpenClawLitePluginRuntimeConfig } from '../../src/runtime/openclaw-lite-plugin-config.ts';

test('defaults to the bundled feishu plugin entry when no explicit plugin command is provided', () => {
  const config = resolveOpenClawLitePluginRuntimeConfig({});

  assert.equal(config.command, process.execPath);
  assert.equal(config.args[0], '--experimental-strip-types');
  assert.match(config.args[1], /feishu-plugin-process\.ts$/);
});

test('reads plugin runtime overrides from environment', () => {
  const config = resolveOpenClawLitePluginRuntimeConfig({
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
