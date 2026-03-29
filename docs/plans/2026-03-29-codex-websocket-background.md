# Codex WebSocket Background Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Run Codex app-server as a persistent background WebSocket server and drive it from the bridge over WebSocket instead of stdio.

**Architecture:** Keep the existing JSON-RPC request/notification handling, but split transport concerns from protocol handling. The bridge will spawn `codex app-server --listen ws://127.0.0.1:<port>` for each project, connect to that server over WebSocket, and keep the child process alive across turns. Stdio remains available as a fallback transport for compatibility.

**Tech Stack:** Node.js 24, TypeScript strips-at-runtime, built-in `WebSocket`, built-in `net`, existing test runner.

### Task 1: Add transport mode configuration

**Files:**
- Modify: `src/runtime/codex-config.ts`
- Modify: `tests/runtime/codex-config.test.ts`

**Step 1: Write the failing test**

Add a test that resolves `BRIDGE_CODEX_TRANSPORT=websocket` and defaults to websocket mode for Codex runtime config.

**Step 2: Run test to verify it fails**

Run: `/Users/yonghui/.nvm/versions/node/v24.0.2/bin/node --experimental-strip-types --test tests/runtime/codex-config.test.ts`
Expected: fail because transport mode is not parsed yet.

**Step 3: Write minimal implementation**

Add transport mode parsing and include it in resolved Codex runtime config.

**Step 4: Run test to verify it passes**

Run: `/Users/yonghui/.nvm/versions/node/v24.0.2/bin/node --experimental-strip-types --test tests/runtime/codex-config.test.ts`
Expected: PASS.

### Task 2: Implement WebSocket-backed Codex transport

**Files:**
- Modify: `src/adapters/codex/app-server-client.ts`
- Create: `src/adapters/codex/websocket-port.ts`
- Create: `tests/adapters/codex/websocket-app-server-client.test.ts`

**Step 1: Write the failing test**

Add a test that proves the client can send `initialize`, `thread/start`, and `turn/start` through a WebSocket transport and collect streamed text from `item/agentMessage/delta`.

**Step 2: Run test to verify it fails**

Run: `/Users/yonghui/.nvm/versions/node/v24.0.2/bin/node --experimental-strip-types --test tests/adapters/codex/websocket-app-server-client.test.ts`
Expected: fail because websocket transport does not exist yet.

**Step 3: Write minimal implementation**

Add websocket connection support, including port allocation, request/notification framing, and close/error handling.

**Step 4: Run test to verify it passes**

Run: `/Users/yonghui/.nvm/versions/node/v24.0.2/bin/node --experimental-strip-types --test tests/adapters/codex/websocket-app-server-client.test.ts`
Expected: PASS.

### Task 3: Switch bridge runtime to WebSocket by default

**Files:**
- Modify: `src/main.ts`
- Modify: `src/runtime/codex-console.ts`
- Modify: `tests/runtime/codex-console.test.ts`

**Step 1: Write the failing test**

Add a runtime test that uses websocket transport for the console path and still prints output or errors correctly.

**Step 2: Run test to verify it fails**

Run: `/Users/yonghui/.nvm/versions/node/v24.0.2/bin/node --experimental-strip-types --test tests/runtime/codex-console.test.ts`
Expected: fail until the runtime passes transport mode through.

**Step 3: Write minimal implementation**

Select websocket transport in the bridge runtime when requested, keep the Codex process alive in the background, and wire stderr/notifications into terminal output.

**Step 4: Run test to verify it passes**

Run: `/Users/yonghui/.nvm/versions/node/v24.0.2/bin/node --experimental-strip-types --test tests/runtime/codex-console.test.ts`
Expected: PASS.

### Task 4: Verify the whole bridge

**Files:**
- No new files

**Step 1: Run full test suite**

Run: `/Users/yonghui/.nvm/versions/node/v24.0.2/bin/node --experimental-strip-types --test tests/all.test.ts`
Expected: all tests pass.

**Step 2: Manual smoke test**

Run the bridge in console mode and confirm the Codex process starts with websocket transport and responds to input.

**Step 3: Commit**

Commit once the suite is green and the smoke test confirms the runtime behavior.
