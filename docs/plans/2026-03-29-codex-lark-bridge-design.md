# Codex IM Bridge Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Node.js + TypeScript bridge that connects Codex project instances to IM sessions through a pluggable channel runtime. The bridge owns project/session binding and routing. The IM channel runtime is a thin, separately launched process that only knows `chatId` and forwards messages between the IM platform and the bridge.

## Architecture

The system is split into three layers:

- `bridge core`
  - Owns `projectInstanceId <-> chatId` binding.
  - Routes messages to the correct Codex project instance.
  - Stores binding state and manages lifecycle.
  - Never talks to a specific IM vendor API directly.

- `channel runtime`
  - A child process spawned by the bridge.
  - Starts and maintains the IM connection.
  - Emits IM events to the bridge over `stdio`.
  - Receives bridge send commands over `stdio`.
  - Only knows `chatId`, not `projectInstanceId`.

- `IM connector`
  - The low-level implementation that actually speaks to the platform.
  - For this project, the first connector is a thin "openclaw lite" runtime that mimics the OpenClaw launch shape for Feishu.

This keeps the bridge independent from OpenClaw as a product while still allowing an OpenClaw-like startup model for Feishu.

## Design Notes

- Each Codex project instance maps to exactly one `chatId` at a time.
- Each `chatId` maps to exactly one Codex project instance at a time.
- Rebinding is a replace operation, not a merge.
- `openclaw lite` is intentionally thin:
  - It starts the Feishu connection.
  - It forwards inbound messages to the bridge.
  - It forwards bridge replies back to Feishu.
  - It does not know about Codex projects.
- The bridge is responsible for project/session binding and for deciding which project handles a given `chatId`.

## Core Modules

- `src/core/binding`
  - One-to-one binding rules and replace semantics.
- `src/core/router`
  - Message routing from `chatId` to `projectInstanceId` and back.
- `src/core/events`
  - Normalized inbound and outbound event contracts.
- `src/channel`
  - Child-process channel runtime interface and process manager.
- `src/channel/openclaw-lite`
  - Thin Feishu runtime wrapper launched by the bridge.
- `src/storage`
  - Binding persistence and lookup.
- `src/api`
  - Management endpoints for bind, unbind, replace, and inspect.
- `src/config`
  - Runtime configuration loading and validation.

## Event Flow

1. The channel runtime receives a Feishu message.
2. The runtime emits a normalized `event` line over `stdio`.
3. The bridge reads the event and looks up `chatId -> projectInstanceId`.
4. If a binding exists, the bridge delivers the message to the matching Codex project handler.
5. The Codex handler emits a reply as an outbound message.
6. The bridge writes a `send` line back to the channel runtime.
7. The channel runtime forwards the reply to the original `chatId`.

If a `chatId` is unbound, the bridge should either ignore the event or return a clear "not bound" response, depending on configuration.

## Channel Protocol

The bridge and the channel runtime communicate over `stdio` using one JSON object per line.

### Channel -> Bridge

```json
{ "type": "status", "state": "ready" }
{ "type": "event", "chatId": "chat-123", "messageId": "m-1", "text": "hi", "senderId": "u-1", "timestamp": "2026-03-29T10:00:00.000Z" }
{ "type": "error", "message": "feishu reconnect failed" }
```

### Bridge -> Channel

```json
{ "type": "send", "chatId": "chat-123", "text": "reply" }
{ "type": "stop" }
```

### Field Semantics

- `chatId`
  - The IM session identifier.
  - Used as the routing key and the binding key on the bridge side.
- `messageId`
  - Used for deduplication and tracing.
- `status.ready`
  - The channel has started successfully and can receive traffic.
- `status.reconnecting`
  - The channel is temporarily unavailable but trying to recover.
- `status.stopped`
  - The channel has exited or is shutting down.

## Binding Rules

- `bind(projectInstanceId, chatId)` must reject partial state.
- If the project instance is already bound, the old `chatId` is detached first.
- If the `chatId` is already bound to another project instance, that old binding is removed first.
- After the operation completes, both lookup directions must agree.
- The storage update should be atomic from the perspective of the bridge API.

## Channel Lifecycle

- Startup
  - The bridge reads configuration.
  - For each enabled channel runtime, the bridge spawns the child process.
  - The bridge injects environment variables and working directory as configured.
  - The bridge waits for `status: ready` before accepting traffic.

- Runtime
  - The bridge parses `stdio` JSON lines.
  - Inbound `event` messages are routed by `chatId`.
  - Outbound replies are written back as `send` messages.
  - `error` and `status` lines are logged and used for health tracking.

- Shutdown
  - The bridge sends `stop` to the runtime.
  - The bridge waits for graceful exit.
  - If needed, the bridge force-kills the process after a timeout.

- Restart
  - If the runtime crashes or never becomes ready, the bridge may retry a configurable number of times.
  - After repeated failures, the channel enters a degraded state and stops accepting traffic.

## Error Handling

- `UNBOUND_CHAT`
  - No Codex project instance is attached to the incoming `chatId`.
- `BINDING_CONFLICT`
  - A requested bind would violate one-to-one rules without replacement.
- `CHANNEL_STARTUP_FAILURE`
  - The child process failed to start or never reported ready.
- `CHANNEL_PROTOCOL_FAILURE`
  - The runtime emitted malformed protocol data.
- `PERSISTENCE_FAILURE`
  - Binding state could not be stored or loaded.

## Testing Strategy

- Unit test one-to-one binding replacement semantics.
- Unit test lookup symmetry for both directions.
- Unit test routing for bound and unbound `chatId` values.
- Unit test channel protocol parsing and serialization.
- Integration test the bind -> receive -> reply cycle with a fake channel runtime.
- Integration test the child-process lifecycle for `openclaw lite`.

## Implementation Plan

### Task 1: Add channel runtime abstractions

**Files:**
- Create: `src/channel/runtime.ts`
- Create: `src/channel/protocol.ts`
- Create: `tests/channel/protocol.test.ts`

**Step 1: Write the failing test**

Cover protocol parsing, serialization, and ready/error status handling.

**Step 2: Run test to verify it fails**

Run: `npm test -- protocol`
Expected: fail because the channel runtime does not exist yet.

**Step 3: Write minimal implementation**

Implement the JSON line protocol and runtime interface.

**Step 4: Run test to verify it passes**

Run: `npm test -- protocol`
Expected: pass.

### Task 2: Implement binding registry

**Files:**
- Create: `src/core/binding/binding-service.ts`
- Create: `src/storage/binding-store.ts`
- Create: `tests/core/binding/binding-service.test.ts`

**Step 1: Write the failing test**

Cover bind, unbind, replace, and lookup symmetry.

**Step 2: Run test to verify it fails**

Run: `npm test -- binding-service`
Expected: fail because the service does not exist yet.

**Step 3: Write minimal implementation**

Implement the dual-index binding registry with replace semantics.

**Step 4: Run test to verify it passes**

Run: `npm test -- binding-service`
Expected: pass.

### Task 3: Add normalized event routing

**Files:**
- Create: `src/core/events/message.ts`
- Create: `src/core/router/router.ts`
- Create: `tests/core/router/router.test.ts`

**Step 1: Write the failing test**

Cover bound routing, unbound routing, and reply targeting.

**Step 2: Run test to verify it fails**

Run: `npm test -- router`
Expected: fail.

**Step 3: Write minimal implementation**

Implement the router and normalized message contracts.

**Step 4: Run test to verify it passes**

Run: `npm test -- router`
Expected: pass.

### Task 4: Implement the channel process manager

**Files:**
- Create: `src/channel/process-manager.ts`
- Create: `src/channel/openclaw-lite.ts`
- Create: `tests/channel/process-manager.test.ts`

**Step 1: Write the failing test**

Cover child-process startup, `ready` detection, `send`, `stop`, and restart behavior.

**Step 2: Run test to verify it fails**

Run: `npm test -- channel`
Expected: fail.

**Step 3: Write minimal implementation**

Spawn the runtime process and bridge stdin/stdout JSON lines.

**Step 4: Run test to verify it passes**

Run: `npm test -- channel`
Expected: pass.

### Task 5: Add management API

**Files:**
- Create: `src/api/server.ts`
- Create: `src/api/routes.ts`
- Create: `tests/api/routes.test.ts`

**Step 1: Write the failing test**

Cover bind, unbind, and lookup endpoints.

**Step 2: Run test to verify it fails**

Run: `npm test -- routes`
Expected: fail.

**Step 3: Write minimal implementation**

Expose the binding service through HTTP endpoints.

**Step 4: Run test to verify it passes**

Run: `npm test -- routes`
Expected: pass.

### Task 6: Add startup wiring and smoke test

**Files:**
- Create: `src/app.ts`
- Create: `src/main.ts`
- Create: `tests/smoke/app.test.ts`

**Step 1: Write the failing test**

Verify the app boots with config, storage, API, and channel wiring.

**Step 2: Run test to verify it fails**

Run: `npm test -- smoke`
Expected: fail.

**Step 3: Write minimal implementation**

Wire all modules together behind a single entrypoint.

**Step 4: Run test to verify it passes**

Run: `npm test -- smoke`
Expected: pass.
