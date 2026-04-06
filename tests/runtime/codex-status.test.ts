import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { readCodexStatusLines } from '../../src/runtime/codex-status.ts';

test('reads Codex status details from local files and sqlite snapshots', async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'codex-status-'));
  const homeDir = join(tempRoot, 'home');
  const codexDir = join(homeDir, '.codex');
  const workspaceRoot = join(homeDir, 'git', 'codex-bridge');
  const statePath = join(codexDir, 'state_5.sqlite');
  const logsPath = join(codexDir, 'logs_1.sqlite');

  mkdirSync(workspaceRoot, { recursive: true });
  mkdirSync(codexDir, { recursive: true });

  writeFileSync(join(workspaceRoot, 'AGENTS.md'), '# AGENTS\n');
  writeFileSync(
    join(codexDir, 'config.toml'),
    [
      'model = "gpt-5.4-mini"',
      'model_reasoning_effort = "medium"',
      'approval_policy = "never"',
      'sandbox_mode = "danger-full-access"',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(codexDir, 'history.jsonl'),
    '{"session_id":"019d5e2f-9356-7903-9cdd-5ed89c556893","ts":1775404231,"text":"status"}\n',
  );

  const lines = await readCodexStatusLines({
    homeDir,
    workspaceRoot,
    configPath: join(codexDir, 'config.toml'),
    historyPath: join(codexDir, 'history.jsonl'),
    statePath,
    logsPath,
    runSqliteJson: async (databasePath, query) => {
      if (databasePath === statePath && query.includes('from threads where id =')) {
        return [
          {
            cwd: workspaceRoot,
            sandbox_policy: '{"type":"danger-full-access"}',
            approval_mode: 'never',
            model: 'gpt-5.4-mini',
            reasoning_effort: 'medium',
            memory_mode: 'enabled',
          },
        ];
      }

      if (databasePath === logsPath && query.includes('account/rateLimits/updated')) {
        return [
          {
            feedback_log_body:
              'Sending frame: Frame { payload: b"{\\"method\\":\\"account/rateLimits/updated\\",\\"params\\":{\\"rateLimits\\":{\\"limitId\\":\\"codex\\",\\"primary\\":{\\"usedPercent\\":2,\\"windowDurationMins\\":300,\\"resetsAt\\":1775444475},\\"secondary\\":{\\"usedPercent\\":76,\\"windowDurationMins\\":10080,\\"resetsAt\\":1775643986},\\"planType\\":\\"plus\\"}}}" }',
          },
        ];
      }

      return [];
    },
  });

  assert.deepEqual(lines, [
    'Model: gpt-5.4-mini (reasoning medium, summaries auto)',
    'Directory: ~/git/codex-bridge',
    'Permissions: Full Access',
    'Agents.md: AGENTS.md',
    'Collaboration mode: Default',
    'Session: 019d5e2f-9356-7903-9cdd-5ed89c556893',
    '5h limit: [████████████████████] 98% left (resets 11:01)',
    'Weekly limit: [█████░░░░░░░░░░░░░░░] 24% left (resets 18:26 on 8 Apr)',
  ]);
});

test('returns quickly when sqlite status reads time out', async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'codex-status-timeout-'));
  const homeDir = join(tempRoot, 'home');
  const codexDir = join(homeDir, '.codex');
  const workspaceRoot = join(homeDir, 'git', 'codex-bridge');
  const statePath = join(codexDir, 'state_5.sqlite');
  const logsPath = join(codexDir, 'logs_1.sqlite');

  mkdirSync(workspaceRoot, { recursive: true });
  mkdirSync(codexDir, { recursive: true });

  writeFileSync(join(workspaceRoot, 'AGENTS.md'), '# AGENTS\n');
  writeFileSync(
    join(codexDir, 'config.toml'),
    [
      'model = "gpt-5.4-mini"',
      'model_reasoning_effort = "medium"',
      'approval_policy = "never"',
      'sandbox_mode = "danger-full-access"',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(codexDir, 'history.jsonl'),
    '{"session_id":"019d5e2f-9356-7903-9cdd-5ed89c556893","ts":1775404231,"text":"status"}\n',
  );

  const startedAt = Date.now();
  const lines = await readCodexStatusLines({
    homeDir,
    workspaceRoot,
    configPath: join(codexDir, 'config.toml'),
    historyPath: join(codexDir, 'history.jsonl'),
    statePath,
    logsPath,
    sqliteTimeoutMs: 10,
    runSqliteJson: async () => new Promise<Array<Record<string, unknown>> | null>(() => {}),
  });
  const elapsedMs = Date.now() - startedAt;

  assert.ok(elapsedMs < 200);
  assert.deepEqual(lines, [
    'Model: gpt-5.4-mini (reasoning medium, summaries off)',
    'Directory: ~/git/codex-bridge',
    'Permissions: Full Access',
    'Agents.md: AGENTS.md',
    'Collaboration mode: Default',
    'Session: 019d5e2f-9356-7903-9cdd-5ed89c556893',
    '5h limit: unknown',
    'Weekly limit: unknown',
  ]);
});
