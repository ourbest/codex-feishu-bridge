# Bridge Restart Command Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a bridge-level `//restart` command that acknowledges the request in chat and then exits the process so pm2 can restart it.

**Architecture:** Keep restart handling out of command parsing. `chat-command-service` should recognize `//restart`, `app.ts` should send an acknowledgement before invoking a restart callback, and `main.ts` should guard against duplicate restarts, stop local resources, and call `process.exit(0)`.

**Tech Stack:** Node.js 24, native test runner, ES modules, Feishu/Lark transport, pm2-managed process restart.

### Task 1: Add restart command coverage

**Files:**
- Modify: `tests/commands/chat-command-service.test.ts`
- Modify: `tests/smoke/app.test.ts`

**Step 1: Write the failing test**

Add:
- a command-service test proving `//restart` is recognized as a bridge command and returns an acknowledgement
- a smoke test proving the app sends the acknowledgement before invoking the restart callback

**Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/commands/chat-command-service.test.ts tests/smoke/app.test.ts`
Expected: FAIL because `restart` is not recognized and no restart callback exists yet.

**Step 3: Write minimal implementation**

Implement just enough parsing and app wiring for the tests to pass.

**Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/commands/chat-command-service.test.ts tests/smoke/app.test.ts`
Expected: PASS

### Task 2: Wire hard restart in runtime

**Files:**
- Modify: `src/app.ts`
- Modify: `src/main.ts`
- Modify: `src/commands/chat-command-service.ts`

**Step 1: Write the failing test**

Extend smoke coverage or add runtime-focused coverage for duplicate restart suppression and acknowledgement-first behavior.

**Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/smoke/app.test.ts`
Expected: FAIL because runtime does not yet coordinate restart requests.

**Step 3: Write minimal implementation**

Add:
- `restart` bridge command support
- app-level `onRestartRequested`
- main-level guarded hard restart handler that stops resources and exits

**Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/smoke/app.test.ts`
Expected: PASS

### Task 3: Verify full suite

**Files:**
- No code changes expected

**Step 1: Run targeted verification**

Run: `node --experimental-strip-types --test tests/commands/chat-command-service.test.ts tests/smoke/app.test.ts`
Expected: PASS

**Step 2: Run full verification**

Run: `npm test`
Expected: PASS
