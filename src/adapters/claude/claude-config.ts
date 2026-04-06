export interface RuntimeEnvClaudeConfig {
  BRIDGE_CLAUDE_API_KEY?: string;
  BRIDGE_CLAUDE_MODEL?: string;
  BRIDGE_CLAUDE_BASE_URL?: string;
  BRIDGE_ADAPTER_TYPE?: string;
}

export interface ClaudeRuntimeConfig {
  adapterType: 'claude';
  apiKey: string;
  model: string;
  baseUrl: string;
}

export function resolveClaudeRuntimeConfig(env: RuntimeEnvClaudeConfig = process.env): ClaudeRuntimeConfig | null {
  const apiKey = env.BRIDGE_CLAUDE_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  return {
    adapterType: 'claude',
    apiKey,
    model: env.BRIDGE_CLAUDE_MODEL?.trim() || 'claude-sonnet-4-20250514',
    baseUrl: env.BRIDGE_CLAUDE_BASE_URL?.trim() || 'https://api.anthropic.com',
  };
}
