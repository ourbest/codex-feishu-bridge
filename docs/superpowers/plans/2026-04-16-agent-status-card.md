# Agent Status Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the Lark bridge status card to display richer real-time Agent status (model, session, Git state, rate limits, background tasks)

**Architecture:** Create a new AgentStatusManager to cache agent state from system/init messages, execute git commands on demand, and provide data to a new buildAgentStatusCard function. Integrate into BridgeRuntime's reportProjectStatus flow.

**Tech Stack:** TypeScript, Node.js 24, Lark SDK

---

## File Structure

| File | Change |
|------|--------|
| `src/runtime/agent-status.ts` | Create - AgentStatusManager class |
| `src/adapters/lark/cards.ts` | Modify - Add buildAgentStatusCard |
| `src/adapters/claude-code/claude-code-client.ts` | Modify - Parse system/init |
| `src/adapters/codex/app-server-client.ts` | Modify - Parse system/init |
| `src/app.ts` | Modify - Integrate AgentStatusManager |
| `tests/runtime/agent-status.test.ts` | Create - Unit tests |

---

## Task 1: Create AgentStatusManager

**Files:**
- Create: `src/runtime/agent-status.ts`
- Test: `tests/runtime/agent-status.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/runtime/agent-status.test.ts
import { describe, it, expect, beforeEach } from 'node:test';
import assert from 'node:assert';
import { AgentStatusManager } from '../../src/runtime/agent-status.ts';

describe('AgentStatusManager', () => {
  let manager: AgentStatusManager;

  beforeEach(() => {
    manager = new AgentStatusManager();
  });

  it('should return default state when no data set', () => {
    const state = manager.getStatus('project-a');
    expect(state.model).toBeNull();
    expect(state.sessionId).toBeNull();
    expect(state.cwd).toBeNull();
    expect(state.gitStatus).toBe('unknown');
    expect(state.gitBranch).toBeNull();
  });

  it('should update from system/init data', () => {
    manager.updateFromSystemInit('project-a', {
      model: 'opus-4-6',
      sessionId: 'sess_123',
      cwd: '/path/to/project',
      permissionMode: 'default',
    });
    const state = manager.getStatus('project-a');
    expect(state.model).toBe('opus-4-6');
    expect(state.sessionId).toBe('sess_123');
    expect(state.cwd).toBe('/path/to/project');
    expect(state.permissionMode).toBe('default');
  });

  it('should update git state', async () => {
    // Note: This test uses a real git repo, skipping for unit test
    // In real test, mock execFile
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/runtime/agent-status.test.ts`
Expected: FAIL - AgentStatusManager not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/runtime/agent-status.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface AgentStatusState {
  model: string | null;
  sessionId: string | null;
  cwd: string | null;
  permissionMode: string | null;
  gitStatus: 'modified' | 'clean' | 'unknown';
  gitBranch: string | null;
  gitDiffStat: string | null;
  backgroundTasks: Array<{ id: string; name: string; status: string }>;
}

export interface SystemInitData {
  model?: string;
  sessionId?: string;
  cwd?: string;
  permissionMode?: string;
}

export class AgentStatusManager {
  private states = new Map<string, AgentStatusState>();

  updateFromSystemInit(projectId: string, data: SystemInitData): void {
    const state = this.getOrCreateState(projectId);
    if (data.model !== undefined) state.model = data.model;
    if (data.sessionId !== undefined) state.sessionId = data.sessionId;
    if (data.cwd !== undefined) state.cwd = data.cwd;
    if (data.permissionMode !== undefined) state.permissionMode = data.permissionMode;
  }

  async updateGitState(projectId: string, cwd: string): Promise<void> {
    const state = this.getOrCreateState(projectId);
    try {
      const [statusOut, branchOut, diffStatOut] = await Promise.all([
        execFileAsync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }),
        execFileAsync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8' }),
        execFileAsync('git', ['diff', '--stat'], { cwd, encoding: 'utf8' }),
      ]);
      state.gitStatus = statusOut.trim() === '' ? 'clean' : 'modified';
      state.gitBranch = branchOut.trim() || null;
      state.gitDiffStat = diffStatOut.trim().split('\n').pop() || null;
    } catch {
      state.gitStatus = 'unknown';
      state.gitBranch = null;
      state.gitDiffStat = null;
    }
  }

  setBackgroundTasks(projectId: string, tasks: Array<{ id: string; name: string; status: string }>): void {
    const state = this.getOrCreateState(projectId);
    state.backgroundTasks = tasks;
  }

  getStatus(projectId: string): AgentStatusState {
    return this.getOrCreateState(projectId);
  }

  private getOrCreateState(projectId: string): AgentStatusState {
    let state = this.states.get(projectId);
    if (!state) {
      state = {
        model: null,
        sessionId: null,
        cwd: null,
        permissionMode: null,
        gitStatus: 'unknown',
        gitBranch: null,
        gitDiffStat: null,
        backgroundTasks: [],
      };
      this.states.set(projectId, state);
    }
    return state;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/runtime/agent-status.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/runtime/agent-status.ts tests/runtime/agent-status.test.ts
git commit -m "feat: add AgentStatusManager for caching agent state"
```

---

## Task 2: Add buildAgentStatusCard to cards.ts

**Files:**
- Modify: `src/adapters/lark/cards.ts:140-180`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/adapters/lark/cards.test.ts (add to existing or create new)
// Test buildAgentStatusCard produces correct card structure
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL - buildAgentStatusCard not found

- [ ] **Step 3: Write minimal implementation**

Add to `src/adapters/lark/cards.ts` after `buildBridgeStatusCard` (around line 140):

```typescript
export function buildAgentStatusCard(input: {
  projectId: string;
  statusLabel: string;
  rateBar: string;
  ratePercent: number;
  cwd: string;
  model: string;
  sessionId: string;
  gitStatus: 'modified' | 'clean' | 'unknown';
  gitBranch: string;
  gitDiffStat: string;
  backgroundTasks?: Array<{ id: string; name: string; status: string }>;
  footerItems?: CardFooterItem[];
  template?: 'blue' | 'turquoise' | 'green' | 'yellow' | 'red' | 'grey';
}): FeishuInteractiveCardMessage {
  const gitStatusIcon = input.gitStatus === 'modified' ? '✗' : input.gitStatus === 'clean' ? '✓' : '?';
  const gitLine = `git: ${gitStatusIcon} | branch: ${input.gitBranch || '?'} | ${input.gitDiffStat || ''}`;

  const bodyLines = [
    `Rate: ${input.rateBar} ${input.ratePercent}% left`,
    '',
    `${input.cwd} | ${input.model} | ${input.sessionId}`,
    gitLine,
  ];

  if (input.backgroundTasks && input.backgroundTasks.length > 0) {
    const taskSummary = input.backgroundTasks
      .map(t => `${t.name} [${t.status}]`)
      .join(' | ');
    bodyLines.push(taskSummary);
  }

  const elements: Array<Record<string, unknown>> = [
    { tag: 'markdown', content: bodyLines.join('\n') },
  ];

  if (input.footerItems !== undefined && input.footerItems.length > 0) {
    elements.push({ tag: 'hr' });
    elements.push(buildFooterMarkdown(input.footerItems));
  }

  return buildInteractiveCardMessage({
    schema: '2.0',
    config: {
      enable_forward: true,
      wide_screen_mode: true,
      update_multi: true,
      width_mode: 'fill',
    },
    header: {
      template: input.template ?? 'blue',
      title: plainText(`${input.projectId} | 🤖 Claude Code`),
      subtitle: plainText(input.statusLabel),
    },
    body: { elements },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/adapters/lark/cards.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/adapters/lark/cards.ts
git commit -m "feat: add buildAgentStatusCard for rich agent status display"
```

---

## Task 3: Update ClaudeCodeClient to parse system/init

**Files:**
- Modify: `src/adapters/claude-code/claude-code-client.ts`
- Requires: AgentStatusManager passed via constructor or callback

- [ ] **Step 1: Add agentStatusManager to constructor options**

Modify `ClaudeCodeClientOptions` interface to add:
```typescript
onSystemInit?: (data: { model: string; sessionId: string; cwd: string; permissionMode: string }) => void;
```

- [ ] **Step 2: Update handleMessage to emit system/init**

In `handleMessage`, update the system/init case:
```typescript
case 'system':
  if (msg.subtype === 'init') {
    // ... existing init handling ...
    this.onSystemInit?.({
      model: msg.model ?? 'unknown',
      sessionId: msg.session_id ?? 'unknown',
      cwd: msg.cwd ?? '',
      permissionMode: msg.request?.mode ?? 'default',
    });
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/adapters/claude-code/claude-code-client.ts
git commit -m "feat: emit system/init data from ClaudeCodeClient"
```

---

## Task 4: Update CodexAppServerClient to parse system/init

**Files:**
- Modify: `src/adapters/codex/app-server-client.ts`

- [ ] **Step 1: Add onSystemInit callback option**

Add to `CodexAppServerClientOptions`:
```typescript
onSystemInit?: (data: { model: string; sessionId: string; cwd: string; permissionMode: string }) => void;
```

- [ ] **Step 2: Find where system/init is handled and emit callback**

Search for where `system`/`init` messages are processed in the stdio reader or websocket handler, add the callback invocation.

- [ ] **Step 3: Commit**

```bash
git add src/adapters/codex/app-server-client.ts
git commit -m "feat: emit system/init data from CodexAppServerClient"
```

---

## Task 5: Integrate AgentStatusManager into BridgeRuntime

**Files:**
- Modify: `src/app.ts` - BridgeRuntime creation and reportProjectStatus

- [ ] **Step 1: Create AgentStatusManager instance**

```typescript
const agentStatusManager = new AgentStatusManager();
```

- [ ] **Step 2: Wire up onSystemInit in client creation**

When creating clients (ClaudeCodeClient, CodexAppServerClient), pass:
```typescript
onSystemInit: (data) => agentStatusManager.updateFromSystemInit(projectId, data),
```

- [ ] **Step 3: Modify reportProjectStatus to use buildAgentStatusCard**

Replace `buildBridgeStatusCard` with `buildAgentStatusCard` using data from:
- `agentStatusManager.getStatus(projectId)` for model/session/cwd
- `readCodexStatusLines()` for rate limit

- [ ] **Step 4: Update Git state on each inbound message**

In `handleInboundMessage`, before routing:
```typescript
const projectConfig = options.projectRegistry.getProjectConfig?.(boundProjectId);
if (projectConfig?.cwd) {
  await agentStatusManager.updateGitState(boundProjectId, projectConfig.cwd);
}
```

- [ ] **Step 5: Wire up background tasks from listThreads**

Before building status card, fetch:
```typescript
const threads = await options.projectRegistry.listThreads?.(boundProjectId) ?? [];
agentStatusManager.setBackgroundTasks(
  boundProjectId,
  threads.map(t => ({ id: t.id, name: t.name, status: t.status }))
);
```

- [ ] **Step 6: Commit**

```bash
git add src/app.ts
git commit -m "feat: integrate AgentStatusManager into BridgeRuntime"
```

---

## Task 6: Update rate limit parsing in readCodexStatusLines

**Files:**
- Modify: `src/runtime/codex-status.ts`

The existing `readCodexStatusLines` already parses rate limits. Ensure it returns the bar and percent in a format usable by `buildAgentStatusCard`.

- [ ] **Step 1: Review existing implementation**

Check `formatLimitBar` and `formatLimitLine` already return usable strings.

- [ ] **Step 2: Export helper for rate bar parsing**

If needed, add export for `formatLimitBar(remainingPercent: number): string`

- [ ] **Step 3: Commit**

```bash
git add src/runtime/codex-status.ts
git commit -m "refactor: export rate limit helpers from codex-status"
```

---

## Task 7: Add integration test

**Files:**
- Create: `tests/integration/agent-status-card.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
import { describe, it, expect } from 'node:test';
import assert from 'node:assert';

describe('Agent Status Card Integration', () => {
  it('should render card with all fields populated', async () => {
    // Integration test - verify card rendering end-to-end
  });
});
```

- [ ] **Step 2: Run test**

Run: `node --experimental-strip-types --test tests/integration/agent-status-card.test.ts`

- [ ] **Step 3: Commit**

```bash
git add tests/integration/agent-status-card.test.ts
git commit -m "test: add integration test for agent status card"
```

---

## Verification

After all tasks, verify:
1. `npm test` passes
2. Status card shows model, session, cwd, git status, rate limit
3. Git state updates on each message
4. Background tasks display when present
