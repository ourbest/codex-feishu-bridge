import { fileURLToPath } from 'node:url';

export interface OpenClawLiteRuntimeConfig {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface OpenClawLiteRuntimeEnv {
  BRIDGE_OPENCLAW_LITE_PLUGIN_COMMAND?: string;
  BRIDGE_OPENCLAW_LITE_PLUGIN_ARGS_JSON?: string;
  BRIDGE_OPENCLAW_LITE_PLUGIN_CWD?: string;
  BRIDGE_OPENCLAW_LITE_PLUGIN_ENV_JSON?: string;
  BRIDGE_OPENCLAW_LITE_ENABLED?: string;
  BRIDGE_OPENCLAW_LITE_COMMAND?: string;
  BRIDGE_OPENCLAW_LITE_ARGS_JSON?: string;
  BRIDGE_OPENCLAW_LITE_CWD?: string;
  BRIDGE_OPENCLAW_LITE_ENV_JSON?: string;
}

function parseArgs(value: string | undefined): string[] | null {
  if (value === undefined || value.trim() === '') {
    return null;
  }

  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
    throw new Error('BRIDGE_OPENCLAW_LITE_ARGS_JSON must be a JSON array of strings');
  }

  return parsed;
}

function parseEnv(value: string | undefined): NodeJS.ProcessEnv | null {
  if (value === undefined || value.trim() === '') {
    return null;
  }

  const parsed = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('BRIDGE_OPENCLAW_LITE_ENV_JSON must be a JSON object');
  }

  const env: NodeJS.ProcessEnv = {};
  for (const [key, rawValue] of Object.entries(parsed)) {
    if (typeof rawValue !== 'string') {
      throw new Error('BRIDGE_OPENCLAW_LITE_ENV_JSON values must be strings');
    }

    env[key] = rawValue;
  }

  return env;
}

export function resolveOpenClawLiteRuntimeConfig(
  env: OpenClawLiteRuntimeEnv = process.env,
): OpenClawLiteRuntimeConfig | null {
  const enabled =
    env.BRIDGE_OPENCLAW_LITE_ENABLED === '1' ||
    env.BRIDGE_OPENCLAW_LITE_PLUGIN_COMMAND !== undefined ||
    env.BRIDGE_OPENCLAW_LITE_COMMAND !== undefined;
  if (!enabled) {
    return null;
  }

  const defaultEntry = fileURLToPath(new URL('../channel/openclaw-lite-process.ts', import.meta.url));
  const args =
    parseArgs(env.BRIDGE_OPENCLAW_LITE_PLUGIN_ARGS_JSON ?? env.BRIDGE_OPENCLAW_LITE_ARGS_JSON) ??
    ['--experimental-strip-types', defaultEntry];

  return {
    command: env.BRIDGE_OPENCLAW_LITE_PLUGIN_COMMAND ?? env.BRIDGE_OPENCLAW_LITE_COMMAND ?? process.execPath,
    args,
    cwd: env.BRIDGE_OPENCLAW_LITE_PLUGIN_CWD ?? env.BRIDGE_OPENCLAW_LITE_CWD,
    env: parseEnv(env.BRIDGE_OPENCLAW_LITE_PLUGIN_ENV_JSON ?? env.BRIDGE_OPENCLAW_LITE_ENV_JSON) ?? undefined,
  };
}
