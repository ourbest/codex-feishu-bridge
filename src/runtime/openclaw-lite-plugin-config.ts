import { fileURLToPath } from 'node:url';

export interface OpenClawLitePluginRuntimeConfig {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface OpenClawLitePluginRuntimeEnv {
  BRIDGE_OPENCLAW_LITE_PLUGIN_COMMAND?: string;
  BRIDGE_OPENCLAW_LITE_PLUGIN_ARGS_JSON?: string;
  BRIDGE_OPENCLAW_LITE_PLUGIN_CWD?: string;
  BRIDGE_OPENCLAW_LITE_PLUGIN_ENV_JSON?: string;
}

function parseArgs(value: string | undefined): string[] | null {
  if (value === undefined || value.trim() === '') {
    return null;
  }

  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
    throw new Error('BRIDGE_OPENCLAW_LITE_PLUGIN_ARGS_JSON must be a JSON array of strings');
  }

  return parsed;
}

function parseEnv(value: string | undefined): NodeJS.ProcessEnv | null {
  if (value === undefined || value.trim() === '') {
    return null;
  }

  const parsed = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('BRIDGE_OPENCLAW_LITE_PLUGIN_ENV_JSON must be a JSON object');
  }

  const env: NodeJS.ProcessEnv = {};
  for (const [key, rawValue] of Object.entries(parsed)) {
    if (typeof rawValue !== 'string') {
      throw new Error('BRIDGE_OPENCLAW_LITE_PLUGIN_ENV_JSON values must be strings');
    }

    env[key] = rawValue;
  }

  return env;
}

export function resolveOpenClawLitePluginRuntimeConfig(
  env: OpenClawLitePluginRuntimeEnv = process.env,
): OpenClawLitePluginRuntimeConfig {
  const defaultEntry = fileURLToPath(new URL('../channel/feishu-plugin-process.ts', import.meta.url));

  return {
    command: env.BRIDGE_OPENCLAW_LITE_PLUGIN_COMMAND ?? process.execPath,
    args: parseArgs(env.BRIDGE_OPENCLAW_LITE_PLUGIN_ARGS_JSON) ?? ['--experimental-strip-types', defaultEntry],
    cwd: env.BRIDGE_OPENCLAW_LITE_PLUGIN_CWD,
    env: parseEnv(env.BRIDGE_OPENCLAW_LITE_PLUGIN_ENV_JSON) ?? undefined,
  };
}
