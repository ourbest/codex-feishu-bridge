# Project Agent Restart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `//restart <provider>` command to hot-restart a specific provider agent for a bound project without restarting the bridge.

**Architecture:** Extend `ProviderManager` with `updateProjectConfig()` and `restartProvider()`. Add `restartProjectProvider()` to `ProjectRegistry` that updates config, restarts the target provider, and re-attaches output handlers. Wire it through `ChatCommandService` as a new branch under the existing `//restart` command.

**Tech Stack:** Node.js 24, TypeScript (ES modules, `--experimental-strip-types`), Node native test runner.

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/runtime/provider-manager.ts` | Provider lifecycle: add `updateProjectConfig()`, `restartProvider()`, make `stopProvider` accessible |
| `src/runtime/project-registry.ts` | Project lifecycle: add `restartProjectProvider()` interface + implementation |
| `src/commands/chat-command-service.ts` | Command parsing: update `//restart` branch, add `restartProjectProvider` to deps, update help text |
| `src/app.ts` | Bridge runtime: update `HELP_CARD_BRIDGE_COMMANDS` |
| `src/main.ts` | Bootstrap: add `restartProjectProvider` to projectRegistry proxy |
| `tests/runtime/provider-manager.test.ts` | ProviderManager tests |
| `tests/runtime/project-registry.test.ts` | ProjectRegistry tests |
| `tests/commands/chat-command-service.test.ts` | ChatCommandService tests |

---

## Task 1: ProviderManager — updateProjectConfig

**Files:**
- Modify: `src/runtime/provider-manager.ts`
- Test: `tests/runtime/provider-manager.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/runtime/provider-manager.test.ts` after the last existing test:

```ts
test('updateProjectConfig replaces the config used by createStartedClient', async () => {
  const createConfigs: Array<{ model?: string; cwd?: string }> = [];
  const manager = new ProviderManager({
    projectInstanceId: 'project-a',
    cwd: '/repo/project-a',
    model: 'gpt-4',
    createClient: ({ provider, model, cwd }) => {
      createConfigs.push({ model, cwd });
      return {
        generateReply: async () => 'ok',
        stop: async () => {},
      };
    },
  });

  await manager.ensureProviderClient('codex');
  assert.deepEqual(createConfigs, [{ model: 'gpt-4', cwd: '/repo/project-a' }]);

  manager.updateProjectConfig({
    projectInstanceId: 'project-a',
    cwd: '/repo/project-b',
    model: 'gpt-4o',
  });

  await manager.restartProvider('codex');
  assert.deepEqual(createConfigs, [
    { model: 'gpt-4', cwd: '/repo/project-a' },
    { model: 'gpt-4o', cwd: '/repo/project-b' },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
node --experimental-strip-types --test tests/runtime/provider-manager.test.ts
```

Expected: FAIL with `TypeError: manager.updateProjectConfig is not a function` or `manager.restartProvider is not a function`.

- [ ] **Step 3: Add updateProjectConfig to ProviderManager**

In `src/runtime/provider-manager.ts`, change:

```ts
// Line ~148
  private readonly projectConfig: ProviderManagerProjectConfig;
```

to:

```ts
  private projectConfig: ProviderManagerProjectConfig;
```

Then add the method after `buildBaseProjectConfig` (or near the constructor, before `buildClientProxy`):

```ts
  updateProjectConfig(config: ProviderManagerProjectConfig): void {
    this.projectConfig = buildBaseProjectConfig({
      projectConfig: config,
    });
  }
```

Wait — `buildBaseProjectConfig` is a module-level function that expects `ProviderManagerOptions`. It checks `options.projectConfig` first. Since we're passing `{ projectConfig: config }`, it will use that branch. But `buildBaseProjectConfig` also needs either `projectInstanceId` or `projectConfig`. Since we pass `projectConfig`, it should work.

Actually, looking at the code, `buildBaseProjectConfig` signature is:
```ts
function buildBaseProjectConfig(options: ProviderManagerOptions): ProviderManagerProjectConfig
```

But `ProviderManagerOptions` has many optional fields. The function checks `options.projectConfig !== undefined` first, then falls back to individual fields. So we can call it with `{ projectConfig: config }`.

But wait, we need to preserve `providers` from the config. Looking at `buildBaseProjectConfig`:
```ts
if (options.projectConfig !== undefined) {
  return {
    ...options.projectConfig,
    providers: Array.isArray(options.projectConfig.providers) && options.projectConfig.providers.length > 0
      ? options.projectConfig.providers.map(cloneDescriptor)
      : defaultProviderDescriptors(),
  };
}
```

This should work.

- [ ] **Step 4: Run test to verify updateProjectConfig passes**

Run:
```bash
node --experimental-strip-types --test tests/runtime/provider-manager.test.ts
```

Expected: The `updateProjectConfig` test should now pass (though `restartProvider` will still fail).

Actually wait, the test calls `manager.restartProvider('codex')` which doesn't exist yet. The test will fail on that. Let me restructure — I should implement `restartProvider` in the same step, or write a test that only tests `updateProjectConfig`.

Let me adjust: combine Step 3 and the restartProvider implementation into one step, since the test tests both.

- [ ] **Step 3 (revised): Add updateProjectConfig and restartProvider**

In `src/runtime/provider-manager.ts`:

1. Change `private readonly projectConfig` to `private projectConfig` (line ~148).

2. Add public method after `buildClientProxy`:

```ts
  updateProjectConfig(config: ProviderManagerProjectConfig): void {
    this.projectConfig = buildBaseProjectConfig({
      projectConfig: config,
    });
  }
```

3. Make `stopProvider` public by removing `private` keyword (line ~432):

Change:
```ts
  private async stopProvider(provider: string): Promise<void> {
```

to:
```ts
  async stopProvider(provider: string): Promise<void> {
```

4. Add `restartProvider` after `stopProvider`:

```ts
  async restartProvider(providerId: string): Promise<void> {
    await this.stopProvider(providerId);
    await this.createStartedClient(providerId);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
node --experimental-strip-types --test tests/runtime/provider-manager.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/provider-manager.ts tests/runtime/provider-manager.test.ts
git commit -m "feat(provider-manager): add updateProjectConfig and restartProvider"
```

---

## Task 2: ProjectRegistry — restartProjectProvider

**Files:**
- Modify: `src/runtime/project-registry.ts`
- Test: `tests/runtime/project-registry.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/runtime/project-registry.test.ts` after the last existing test:

```ts
test('restartProjectProvider stops and respawns the specified provider with latest config', async () => {
  const stopCalls: string[] = [];
  const createCalls: Array<{ provider: string; model?: string }> = [];
  const registry = createProjectRegistry({
    getProjectConfig: (id) =>
      id === 'project-a'
        ? { projectInstanceId: 'project-a', websocketUrl: 'ws://localhost:4000', model: 'gpt-4' }
        : null,
    createClient: (projectId, config, provider) => {
      createCalls.push({ provider: provider?.id ?? 'unknown', model: config.model });
      return {
        generateReply: async ({ text }) => `${provider?.id ?? 'unknown'}:${text}`,
        stop: async () => {
          stopCalls.push(provider?.id ?? 'unknown');
        },
      };
    },
  });

  await registry.onBindingChanged({ type: 'bound', projectId: 'project-a', sessionId: 'chat-1' });

  // Start the codex provider
  const handler = registry.getHandler('project-a');
  assert.ok(handler !== null);
  await handler!({ projectInstanceId: 'project-a', message: { text: 'hello' } });

  assert.ok(createCalls.some((c) => c.provider === 'codex'));
  assert.deepEqual(stopCalls, []);

  // Update config
  const updatedConfig = { projectInstanceId: 'project-a', websocketUrl: 'ws://localhost:4000', model: 'gpt-4o' };

  // Restart the codex provider
  await registry.restartProjectProvider('project-a', 'codex');

  assert.ok(stopCalls.includes('codex'));
  assert.ok(createCalls.some((c) => c.provider === 'codex' && c.model === 'gpt-4o'));
});

test('restartProjectProvider throws when project is not active', async () => {
  const registry = createProjectRegistry({
    getProjectConfig: (id) =>
      id === 'project-a'
        ? { projectInstanceId: 'project-a', websocketUrl: 'ws://localhost:4000' }
        : null,
    createClient: () => ({ generateReply: async () => 'ok', stop: async () => {} }),
  });

  await assert.rejects(
    async () => await registry.restartProjectProvider('project-a', 'codex'),
    /Project project-a is not active/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
node --experimental-strip-types --test tests/runtime/project-registry.test.ts
```

Expected: FAIL with `TypeError: registry.restartProjectProvider is not a function`.

- [ ] **Step 3: Add restartProjectProvider to interface and implementation**

In `src/runtime/project-registry.ts`:

1. Add to `ProjectRegistry` interface (after `stop(): Promise<void>;`):

```ts
  restartProjectProvider(projectInstanceId: string, provider: string): Promise<void>;
```

2. Add the implementation in the returned object (after `stop()` and before `activeProjects`):

```ts
    async restartProjectProvider(projectInstanceId: string, provider: string): Promise<void> {
      const entry = activeProjects.get(projectInstanceId);
      if (!entry) {
        throw new Error(`Project ${projectInstanceId} is not active`);
      }

      const config = options.getProjectConfig(projectInstanceId);
      if (!config) {
        throw new Error(`Project ${projectInstanceId} is no longer configured`);
      }

      entry.config = config;
      entry.providerManager.updateProjectConfig(config);
      await entry.providerManager.restartProvider(provider);

      const restartedClient = entry.providerManager.getStartedClient(provider);
      if (restartedClient !== null) {
        attachServerRequestHandler(projectInstanceId, provider, restartedClient);
        attachStatusHandler(projectInstanceId, provider, restartedClient);
        attachTextDeltaHandler(projectInstanceId, provider, restartedClient);
        attachThreadChangedHandler(projectInstanceId, provider, restartedClient);
        attachSystemInitHandler(projectInstanceId, provider, restartedClient);
      }
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
node --experimental-strip-types --test tests/runtime/project-registry.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/project-registry.ts tests/runtime/project-registry.test.ts
git commit -m "feat(project-registry): add restartProjectProvider"
```

---

## Task 3: ChatCommandService — //restart <provider>

**Files:**
- Modify: `src/commands/chat-command-service.ts`
- Test: `tests/commands/chat-command-service.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/commands/chat-command-service.test.ts` after the existing `//restart` test (after line ~623):

```ts
test('restarts a specific provider with //restart <provider>', async () => {
  const bindingService = createBindingService();
  const restartCalls: Array<{ projectId: string; provider: string }> = [];

  const registry = createProjectRegistry({
    getProjectConfig: (id) =>
      id === 'project-a'
        ? { projectInstanceId: 'project-a', websocketUrl: 'ws://localhost:4000' }
        : null,
    createClient: () => ({ generateReply: async () => 'ok', stop: async () => {} }),
  });

  await bindingService.bindProjectToSession('project-a', 'chat-a');
  await registry.onBindingChanged({ type: 'bound', projectId: 'project-a', sessionId: 'chat-a' });

  const service = createChatCommandService({
    bindingService,
    projectRegistry: {
      ...registry,
      async restartProjectProvider(projectId, provider) {
        restartCalls.push({ projectId, provider });
      },
    },
  });

  const lines = await service.execute({
    sessionId: 'chat-a',
    senderId: 'user-a',
    text: '//restart codex',
  });

  assert.deepEqual(restartCalls, [{ projectId: 'project-a', provider: 'codex' }]);
  assert.deepEqual(lines, ['[lark-agent-bridge] restarted codex for project-a']);
});

test('rejects //restart <provider> when no project is bound', async () => {
  const bindingService = createBindingService();
  const service = createChatCommandService({
    bindingService,
    projectRegistry: {},
  });

  const lines = await service.execute({
    sessionId: 'chat-a',
    senderId: 'user-a',
    text: '//restart codex',
  });

  assert.deepEqual(lines, ['[lark-agent-bridge] no project bound to this chat']);
});

test('rejects //restart <provider> when provider does not exist', async () => {
  const bindingService = createBindingService();
  const registry = createProjectRegistry({
    getProjectConfig: (id) =>
      id === 'project-a'
        ? { projectInstanceId: 'project-a', websocketUrl: 'ws://localhost:4000' }
        : null,
    createClient: () => ({ generateReply: async () => 'ok', stop: async () => {} }),
  });

  await bindingService.bindProjectToSession('project-a', 'chat-a');
  await registry.onBindingChanged({ type: 'bound', projectId: 'project-a', sessionId: 'chat-a' });

  const service = createChatCommandService({
    bindingService,
    projectRegistry: registry,
  });

  const lines = await service.execute({
    sessionId: 'chat-a',
    senderId: 'user-a',
    text: '//restart nonexistent',
  });

  assert.ok(lines?.[0]?.includes("provider 'nonexistent' not found"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
node --experimental-strip-types --test tests/commands/chat-command-service.test.ts
```

Expected: FAIL with `TypeError: projectRegistry.restartProjectProvider is not a function` or assertion failures.

- [ ] **Step 3: Update ChatCommandService dependencies and //restart branch**

In `src/commands/chat-command-service.ts`:

1. Add `restartProjectProvider` to `ChatCommandServiceDependencies.projectRegistry` (around line 60):

```ts
    restartProjectProvider?(projectInstanceId: string, provider: string): Promise<void>;
```

2. Update the `//restart` branch in the command switch (around line 759):

Replace:
```ts
          case 'restart':
            return ['[lark-agent-bridge] restarting bridge process...'];
```

With:
```ts
          case 'restart': {
            if (parsed.args.length === 0) {
              return ['[lark-agent-bridge] restarting bridge process...'];
            }

            const provider = parsed.args[0];
            const projectId = await dependencies.bindingService.getProjectBySession(input.sessionId);
            if (!projectId) {
              return ['[lark-agent-bridge] no project bound to this chat'];
            }

            if (!dependencies.projectRegistry?.restartProjectProvider) {
              return ['[lark-agent-bridge] provider restart is not configured'];
            }

            const providers = await dependencies.projectRegistry.listProjectProviders?.(projectId) ?? [];
            const providerExists = providers.some((p) => p.id === provider);
            if (!providerExists) {
              const available = providers.map((p) => p.id).join(', ') || 'none';
              return [`[lark-agent-bridge] provider '${provider}' not found. Available: ${available}`];
            }

            try {
              await dependencies.projectRegistry.restartProjectProvider(projectId, provider);
              return [`[lark-agent-bridge] restarted ${provider} for ${projectId}`];
            } catch (error) {
              return [`[lark-agent-bridge] failed to restart ${provider}: ${error instanceof Error ? error.message : String(error)}`];
            }
          }
```

3. Update help text: find the line `'  //restart           - restart the bridge process'` (appears in multiple places in the help arrays) and update to:

```ts
    '  //restart           - restart the bridge process',
    '  //restart <provider> - restart a provider for the bound project',
```

There are three places where help text arrays are defined in the test file. We need to update the source `HELP_CARD_BRIDGE_COMMANDS` in `app.ts` as well (Task 4).

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
node --experimental-strip-types --test tests/commands/chat-command-service.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/commands/chat-command-service.ts tests/commands/chat-command-service.test.ts
git commit -m "feat(chat-command-service): support //restart <provider> for hot provider restart"
```

---

## Task 4: App Layer — update help text

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: Update HELP_CARD_BRIDGE_COMMANDS**

In `src/app.ts`, find `HELP_CARD_BRIDGE_COMMANDS` (around line 71-93). Add the new help entry after the existing `//restart` line:

```ts
const HELP_CARD_BRIDGE_COMMANDS = [
  { command: '//bind <projectId>', description: 'Bind this chat to a project.' },
  // ... existing entries ...
  { command: '//restart', description: 'Restart the bridge process.' },
  { command: '//restart <provider>', description: 'Restart a provider for the bound project.' },
  // ... rest of entries ...
] as const;
```

- [ ] **Step 2: Run tests**

Run:
```bash
node --experimental-strip-types --test tests/commands/chat-command-service.test.ts
```

Expected: Tests pass (the help text test checks exact strings, so this may need updating if the test asserts exact help text content).

Actually, the help text tests in `chat-command-service.test.ts` check the exact output of `//help`. We need to check if those tests will break. Looking at the test file, there are assertions like:

```ts
assert.ok(lines.some((l) => l.includes('//restart')));
```

or exact array comparisons. Let me check what the help text test looks like.

Looking at the grep results, there were multiple occurrences of `'  //restart           - restart the bridge process'` in the test file at lines 655, 1708, 1771. These are likely in test assertions for `//help`. The tests probably do exact array comparisons.

So we need to update the test assertions too. Let's add that to the plan.

- [ ] **Step 3: Update help text test assertions**

In `tests/commands/chat-command-service.test.ts`, find all occurrences of:
```
'  //restart           - restart the bridge process',
```

Add after each occurrence:
```
'  //restart <provider> - restart a provider for the bound project',
```

There should be 3 places (based on the grep results: lines ~655, ~1708, ~1771).

- [ ] **Step 4: Run tests**

Run:
```bash
node --experimental-strip-types --test tests/commands/chat-command-service.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app.ts tests/commands/chat-command-service.test.ts
git commit -m "feat(app): add //restart <provider> to help text"
```

---

## Task 5: Main Layer — wire restartProjectProvider

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add restartProjectProvider to the projectRegistry proxy**

In `src/main.ts`, find the `projectRegistry` object passed to `createBridgeApp` (around line 322). Add after `restoreBinding`:

```ts
      async restartProjectProvider(projectInstanceId: string, provider: string): Promise<void> {
        if (projectRegistryImpl === null) {
          throw new Error('project registry is not initialized');
        }
        await projectRegistryImpl.restartProjectProvider(projectInstanceId, provider);
      },
```

- [ ] **Step 2: Run smoke test**

Run:
```bash
node --experimental-strip-types --test tests/smoke/app.test.ts
```

Expected: Tests pass (or at least don't fail due to our changes).

Also run the full test suite:
```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(main): wire restartProjectProvider through projectRegistry proxy"
```

---

## Self-Review

### Spec Coverage

| Spec Requirement | Task |
|-----------------|------|
| ProviderManager `updateProjectConfig` | Task 1 |
| ProviderManager `restartProvider` | Task 1 |
| ProjectRegistry `restartProjectProvider` | Task 2 |
| Re-attach handlers after restart | Task 2 (Step 3) |
| `//restart` preserves existing behavior | Task 3 (bare `//restart` returns same message) |
| `//restart <provider>` triggers hot restart | Task 3 |
| Provider validation before restart | Task 3 (Step 3) |
| Help text update | Task 4 |
| Main.ts wiring | Task 5 |

### Placeholder Scan

No TBD/TODO/"implement later"/"similar to" found. Every step has concrete code and commands.

### Type Consistency

- `restartProjectProvider(projectInstanceId: string, provider: string): Promise<void>` — consistent across ProjectRegistry interface, implementation, and ChatCommandService deps.
- `updateProjectConfig(config: ProviderManagerProjectConfig): void` — consistent in ProviderManager.
- `restartProvider(providerId: string): Promise<void>` — consistent in ProviderManager.
