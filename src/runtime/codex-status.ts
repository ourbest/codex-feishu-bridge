import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export interface CodexStatusReadOptions {
  homeDir?: string;
  workspaceRoot?: string;
  configPath?: string;
  historyPath?: string;
  globalStatePath?: string;
  statePath?: string;
  logsPath?: string;
  runSqliteJson?: (databasePath: string, query: string) => Promise<Array<Record<string, unknown>> | null>;
  sqliteTimeoutMs?: number;
}

interface CodexConfigSnapshot {
  model?: string;
  reasoningEffort?: string;
  sandboxMode?: string;
  approvalPolicy?: string;
}

interface CodexThreadSnapshot {
  cwd?: string;
  sandboxPolicy?: string;
  approvalMode?: string;
  model?: string;
  reasoningEffort?: string;
  memoryMode?: string;
}

interface RateLimitWindow {
  usedPercent?: number;
  windowDurationMins?: number;
  resetsAt?: number;
}

interface RateLimitsSnapshot {
  primary?: RateLimitWindow | null;
  secondary?: RateLimitWindow | null;
}

const execFileAsync = promisify(execFile);

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function readJsonFileIfExists<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function readTomlValue(content: string, key: string): string | null {
  const match = content.match(new RegExp(`^\\s*${key.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*"([^"]*)"\\s*$`, 'm'));
  return match?.[1] ?? null;
}

function readCodexConfig(filePath: string): CodexConfigSnapshot {
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    return {
      model: readTomlValue(content, 'model') ?? undefined,
      reasoningEffort: readTomlValue(content, 'model_reasoning_effort') ?? undefined,
      sandboxMode: readTomlValue(content, 'sandbox_mode') ?? undefined,
      approvalPolicy: readTomlValue(content, 'approval_policy') ?? undefined,
    };
  } catch {
    return {};
  }
}

function resolveDisplayPath(filePath: string, homeDir: string): string {
  if (filePath === homeDir) {
    return '~';
  }

  if (filePath.startsWith(`${homeDir}${path.sep}`)) {
    return `~${filePath.slice(homeDir.length)}`;
  }

  return filePath;
}

function findLatestMatchingFile(dirPath: string, pattern: RegExp): string | null {
  if (!existsSync(dirPath)) {
    return null;
  }

  const entries = readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => {
      const fullPath = path.join(dirPath, entry.name);
      return { fullPath, mtimeMs: statSync(fullPath).mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  return entries[0]?.fullPath ?? null;
}

function findAgentsFile(workspaceRoot: string): string | null {
  let current = workspaceRoot;
  while (true) {
    const candidate = path.join(current, 'AGENTS.md');
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

function readLatestJsonlSessionId(historyPath: string): string | null {
  if (!existsSync(historyPath)) {
    return null;
  }

  try {
    const lines = readFileSync(historyPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const parsed = JSON.parse(lines[index]) as { session_id?: unknown };
      if (typeof parsed.session_id === 'string' && parsed.session_id.trim() !== '') {
        return parsed.session_id.trim();
      }
    }
  } catch {
    return null;
  }

  return null;
}

function parseThreadSnapshot(row: Record<string, unknown> | null): CodexThreadSnapshot | null {
  if (row === null) {
    return null;
  }

  return {
    cwd: typeof row.cwd === 'string' ? row.cwd : undefined,
    sandboxPolicy: typeof row.sandbox_policy === 'string' ? row.sandbox_policy : undefined,
    approvalMode: typeof row.approval_mode === 'string' ? row.approval_mode : undefined,
    model: typeof row.model === 'string' ? row.model : undefined,
    reasoningEffort: typeof row.reasoning_effort === 'string' ? row.reasoning_effort : undefined,
    memoryMode: typeof row.memory_mode === 'string' ? row.memory_mode : undefined,
  };
}

async function querySqliteJson(
  databasePath: string,
  query: string,
  timeoutMs: number,
): Promise<Array<Record<string, unknown>> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { stdout } = await execFileAsync('sqlite3', ['-json', databasePath, query], {
      encoding: 'utf8',
      signal: controller.signal,
    });
    const output = stdout.toString();
    if (output.trim() === '') {
      return [];
    }

    const parsed = JSON.parse(output) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && !Array.isArray(entry));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function readThreadSnapshot(
  statePath: string,
  sessionId: string | null,
  runSqliteJson: CodexStatusReadOptions['runSqliteJson'],
  sqliteTimeoutMs: number,
): Promise<CodexThreadSnapshot | null> {
  const query = sessionId === null
    ? 'select cwd,sandbox_policy,approval_mode,model,reasoning_effort,memory_mode from threads order by updated_at desc, created_at desc limit 1;'
    : `select cwd,sandbox_policy,approval_mode,model,reasoning_effort,memory_mode from threads where id = '${escapeSqlLiteral(sessionId)}' limit 1;`;

  const rows = runSqliteJson !== undefined
    ? await withTimeout(runSqliteJson(statePath, query), sqliteTimeoutMs)
    : await querySqliteJson(statePath, query, sqliteTimeoutMs);
  if (rows === null || rows.length === 0) {
    return null;
  }

  return parseThreadSnapshot(rows[0]);
}

function parseRateLimitsSnapshot(row: Record<string, unknown> | null): RateLimitsSnapshot | null {
  if (row === null) {
    return null;
  }

  const raw = typeof row.feedback_log_body === 'string' ? row.feedback_log_body : null;
  if (raw === null) {
    return null;
  }

  const payloadMatch = raw.match(/payload: b"((?:\\.|[^"])*)"/);
  if (payloadMatch === null) {
    return null;
  }

  try {
    const decoded = JSON.parse(`"${payloadMatch[1]}"`) as string;
    const parsed = JSON.parse(decoded) as {
      params?: {
        rateLimits?: {
          primary?: RateLimitWindow | null;
          secondary?: RateLimitWindow | null;
        };
      };
    };
    const rateLimits = parsed.params?.rateLimits ?? null;
    return rateLimits === null ? null : {
      primary: rateLimits.primary ?? null,
      secondary: rateLimits.secondary ?? null,
    };
  } catch {
    return null;
  }
}

async function readRateLimitsSnapshot(
  logsPath: string,
  runSqliteJson: CodexStatusReadOptions['runSqliteJson'],
  sqliteTimeoutMs: number,
): Promise<RateLimitsSnapshot | null> {
  const query = `select feedback_log_body from logs where feedback_log_body like '%account/rateLimits/updated%' order by ts desc, ts_nanos desc, id desc limit 25;`;
  const rows = runSqliteJson !== undefined
    ? await withTimeout(runSqliteJson(logsPath, query), sqliteTimeoutMs)
    : await querySqliteJson(logsPath, query, sqliteTimeoutMs);
  if (rows === null || rows.length === 0) {
    return null;
  }

  for (const row of rows) {
    const snapshot = parseRateLimitsSnapshot(row);
    if (snapshot !== null) {
      return snapshot;
    }
  }

  return null;
}

function formatWorkspaceRoot(workspaceRoot: string, homeDir: string): string {
  return resolveDisplayPath(workspaceRoot, homeDir);
}

function formatAgentsFile(workspaceRoot: string): string {
  const agentsFile = findAgentsFile(workspaceRoot);
  if (agentsFile === null) {
    return 'not found';
  }

  const relativePath = path.relative(workspaceRoot, agentsFile);
  return relativePath === '' ? 'AGENTS.md' : relativePath;
}

function formatPermissions(input: CodexThreadSnapshot | null, config: CodexConfigSnapshot): string {
  const sandboxMode = input?.sandboxPolicy !== undefined
    ? (() => {
        try {
          const parsed = JSON.parse(input.sandboxPolicy) as { type?: unknown };
          return typeof parsed.type === 'string' ? parsed.type : config.sandboxMode ?? null;
        } catch {
          return config.sandboxMode ?? null;
        }
      })()
    : config.sandboxMode ?? null;

  switch (sandboxMode) {
    case 'danger-full-access':
      return 'Full Access';
    case 'workspace-write':
      return 'Workspace Write';
    case 'read-only':
      return 'Read Only';
    default:
      return 'Unknown';
  }
}

function formatModelLine(thread: CodexThreadSnapshot | null, config: CodexConfigSnapshot): string {
  const model = thread?.model?.trim() || config.model?.trim() || 'unknown';
  const reasoning = thread?.reasoningEffort?.trim() || config.reasoningEffort?.trim();
  const summaryMode = thread?.memoryMode === 'enabled' ? 'auto' : 'off';

  if (reasoning !== undefined && reasoning !== '') {
    return `${model} (reasoning ${reasoning}, summaries ${summaryMode})`;
  }

  return model;
}

function formatSessionId(sessionId: string | null): string {
  return sessionId ?? 'unknown';
}

function formatLimitBar(remainingPercent: number): string {
  const fullBlocks = Math.max(0, Math.min(20, Math.round(remainingPercent / 5)));
  return `[${'█'.repeat(fullBlocks)}${'░'.repeat(20 - fullBlocks)}]`;
}

function formatResetTime(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatResetDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

function formatLimitLine(label: string, window: RateLimitWindow | null | undefined, includeDate: boolean): string {
  if (window === null || window === undefined) {
    return `${label}: unknown`;
  }

  const usedPercent = typeof window.usedPercent === 'number' ? window.usedPercent : null;
  const remainingPercent = usedPercent === null ? null : Math.max(0, 100 - usedPercent);
  const bar = remainingPercent === null ? '[????????????????????]' : formatLimitBar(remainingPercent);
  const percentText = remainingPercent === null ? 'unknown left' : `${Math.round(remainingPercent)}% left`;
  const resetText = typeof window.resetsAt === 'number'
    ? includeDate
      ? ` (resets ${formatResetTime(window.resetsAt)} on ${formatResetDate(window.resetsAt)})`
      : ` (resets ${formatResetTime(window.resetsAt)})`
    : '';

  return `${label}: ${bar} ${percentText}${resetText}`;
}

function resolveCodexHome(homeDir: string): string {
  return path.join(homeDir, '.codex');
}

function findLatestCodexDatabase(codexHome: string, prefix: 'state_' | 'logs_'): string | null {
  const pattern = new RegExp(`^${prefix}.*\\.sqlite$`);
  return findLatestMatchingFile(codexHome, pattern);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

export async function readCodexStatusLines(options: CodexStatusReadOptions = {}): Promise<string[]> {
  const homeDir = options.homeDir ?? process.env.HOME ?? os.homedir();
  const workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
  const sqliteTimeoutMs = options.sqliteTimeoutMs ?? 250;
  const codexHome = resolveCodexHome(homeDir);
  const configPath = options.configPath ?? path.join(codexHome, 'config.toml');
  const historyPath = options.historyPath ?? path.join(codexHome, 'history.jsonl');
  const globalStatePath = options.globalStatePath ?? path.join(codexHome, '.codex-global-state.json');
  const statePath = options.statePath ?? findLatestCodexDatabase(codexHome, 'state_');
  const logsPath = options.logsPath ?? findLatestCodexDatabase(codexHome, 'logs_');

  const config = readCodexConfig(configPath);
  const globalState = readJsonFileIfExists<Record<string, unknown>>(globalStatePath);
  const sessionId = readLatestJsonlSessionId(historyPath);
  const [thread, rateLimits] = await Promise.all([
    statePath !== null ? readThreadSnapshot(statePath, sessionId, options.runSqliteJson, sqliteTimeoutMs) : Promise.resolve(null),
    logsPath !== null ? readRateLimitsSnapshot(logsPath, options.runSqliteJson, sqliteTimeoutMs) : Promise.resolve(null),
  ]);

  const modelLine = formatModelLine(thread, config);
  const workspaceLine = formatWorkspaceRoot(thread?.cwd?.trim() || workspaceRoot, homeDir);
  const permissionsLine = formatPermissions(thread, config);
  const agentsLine = formatAgentsFile(workspaceRoot);
  const collaborationMode =
    typeof globalState?.['collaboration-mode'] === 'string'
      ? String(globalState['collaboration-mode'])
      : typeof globalState?.['collaborationMode'] === 'string'
        ? String(globalState['collaborationMode'])
        : 'Default';

  const primaryLimitLine = formatLimitLine('5h limit', rateLimits?.primary ?? null, false);
  const weeklyLimitLine = formatLimitLine('Weekly limit', rateLimits?.secondary ?? null, true);

  return [
    `Model: ${modelLine}`,
    `Directory: ${formatWorkspaceRoot(workspaceLine, homeDir)}`,
    `Permissions: ${permissionsLine}`,
    `Agents.md: ${agentsLine}`,
    `Collaboration mode: ${collaborationMode}`,
    `Session: ${formatSessionId(sessionId)}`,
    primaryLimitLine,
    weeklyLimitLine,
  ];
}
