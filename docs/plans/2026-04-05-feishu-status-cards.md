# Feishu Status Cards Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Send bridge failures as Feishu cards and add a single updatable status card for normal routed Codex requests.

**Architecture:** Keep existing command/help/approval cards unchanged. For normal inbound chat messages routed to a bound project, send one initial "processing" card, store the returned Feishu `message_id`, then update that same card to a terminal state when routing completes or fails. Preserve the existing final reply card for completed Codex responses so output formatting stays stable.

**Tech Stack:** Node.js 24, TypeScript via `--experimental-strip-types`, Feishu/Lark IM SDK, existing `LarkAdapter` and card builders, Node test runner.

### Task 1: Lock down status-card behavior with failing tests

**Files:**
- Modify: `tests/smoke/app.test.ts`
- Test: `tests/smoke/app.test.ts`

**Step 1: Write the failing tests**

Add tests that assert:
- Normal routed messages send one initial status card, then update it, then send the existing final reply card.
- Unavailable bound-project failures no longer send plain text; instead they update the initial status card to a failure card.

**Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test tests/smoke/app.test.ts`

Expected: FAIL because there is no update-card plumbing and unavailable errors still use `send`.

### Task 2: Add message-id aware send/update card plumbing

**Files:**
- Modify: `src/adapters/lark/adapter.ts`
- Modify: `src/adapters/lark/feishu-websocket.ts`
- Modify: `src/runtime/bootstrap.ts`
- Modify: `src/main.ts`
- Test: `tests/adapters/lark/feishu-websocket.test.ts`

**Step 1: Write the failing transport tests**

Add tests that assert:
- `sendCard` can surface a returned `messageId`.
- `updateCard` calls through to the Feishu message update API with the provided `messageId`.

**Step 2: Run the transport tests to verify they fail**

Run: `node --experimental-strip-types --test tests/adapters/lark/feishu-websocket.test.ts`

Expected: FAIL because the transport does not expose update methods or return message metadata.

**Step 3: Write the minimal implementation**

Add optional adapter/transport result types and an `updateCard` method. Wire Feishu transport to return `message_id` from create calls and invoke the SDK message update method for card updates. Keep local-dev transport behavior simple with synthetic IDs or empty results.

**Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/adapters/lark/feishu-websocket.test.ts`

Expected: PASS.

### Task 3: Build reusable status/error cards

**Files:**
- Modify: `src/adapters/lark/cards.ts`
- Test: `tests/adapters/lark/cards.test.ts`

**Step 1: Write the failing card-builder tests**

Add tests for:
- Processing status card shape.
- Failure status card body containing status, reason, and recovery details.

**Step 2: Run card tests to verify they fail**

Run: `node --experimental-strip-types --test tests/adapters/lark/cards.test.ts`

Expected: FAIL because no status card builders exist.

**Step 3: Write the minimal implementation**

Add builders for a generic bridge status card and an unavailable-project card using the existing interactive-card style.

**Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/adapters/lark/cards.test.ts`

Expected: PASS.

### Task 4: Connect request lifecycle to the status card

**Files:**
- Modify: `src/app.ts`
- Test: `tests/smoke/app.test.ts`

**Step 1: Write or extend failing smoke assertions**

Use the tests from Task 1 as the red state.

**Step 2: Write the minimal implementation**

For normal non-command inbound messages:
- If the chat is bound, send a processing status card before routing.
- On success, update the status card to completed and then send the existing reply card.
- On unavailable/failure, update the status card to failed with detailed diagnostics.
- Fall back safely when `messageId` is unavailable or `updateCard` is unsupported.

**Step 3: Run smoke tests to verify they pass**

Run: `node --experimental-strip-types --test tests/smoke/app.test.ts`

Expected: PASS.

### Task 5: Final verification

**Files:**
- Modify: none expected
- Test: multiple targeted suites

**Step 1: Run the focused verification set**

Run: `node --experimental-strip-types --test tests/adapters/lark/cards.test.ts tests/adapters/lark/feishu-websocket.test.ts tests/smoke/app.test.ts`

Run: `node --experimental-strip-types --test tests/adapters/codex/websocket-app-server-client.test.ts tests/adapters/codex/app-server-client.test.ts tests/adapters/codex/app-server-client-approval.test.ts`

Expected: PASS.
