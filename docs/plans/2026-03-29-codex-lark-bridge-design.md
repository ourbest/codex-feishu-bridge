# Codex Lark Bridge Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Node.js + TypeScript bridge that connects Codex app-server project instances to IM sessions through a pluggable Lark adapter, with strict one-to-one project-instance/session binding.

**Architecture:** The system is split into a core bridge service, a plugin-style IM adapter layer, and a small runtime/API layer. The core owns binding state, routing, and persistence; adapters only translate provider events into normalized events and send normalized outbound messages. A binding registry enforces a global one-to-one mapping in both directions, so rebinding a project instance automatically detaches the previous session before attaching the new one.

**Tech Stack:** Node.js, TypeScript, Fastify or Express, Zod, SQLite or local file storage, `@larksuite/openclaw-lark`.

## Design Notes

- Each Codex project instance maps to exactly one Lark session at a time.
- Each Lark session maps to exactly one Codex project instance at a time.
- Rebinding is a replace operation, not a merge.
- The bridge should be adapter-driven so the Lark implementation is optional and replaceable.
- Persistence should be simple for the first version, but the storage boundary must be isolated so SQLite or another backend can be swapped later.

## Core Modules

- `src/core/binding`: one-to-one binding rules and replace semantics.
- `src/core/session`: session entity and lifecycle helpers.
- `src/core/instance`: Codex project instance entity and metadata.
- `src/core/router`: message routing from session to instance and back.
- `src/core/events`: normalized inbound and outbound event contracts.
- `src/adapters/lark`: wrapper around `@larksuite/openclaw-lark`.
- `src/storage`: binding persistence and lookup.
- `src/api`: management endpoints for bind, unbind, replace, and inspect.
- `src/config`: runtime configuration loading and validation.
- `src/types`: shared TypeScript types.

## Event Flow

1. Lark receives a message event.
2. The Lark adapter normalizes the event into an internal `InboundMessage`.
3. The router looks up `sessionId -> projectInstanceId`.
4. If a binding exists, the message is delivered to the Codex project instance handler.
5. The Codex handler emits a reply as an `OutboundMessage`.
6. The adapter sends the reply back to the original Lark session.

If a session is unbound, the bridge should either ignore the event or reply with a clear "not bound" message, depending on configuration.

## Binding Rules

- `bind(projectInstanceId, sessionId)` must reject partial state.
- If the project instance is already bound, the old session is detached first.
- If the session is already bound to another project instance, that old binding is removed first.
- After the operation completes, both lookup directions must agree.
- The storage update should be atomic from the perspective of the bridge API.

## Error Handling

- `UNBOUND_SESSION`: no project instance is attached to the session.
- `BINDING_CONFLICT`: a requested bind would violate one-to-one rules without replacement.
- `ADAPTER_FAILURE`: upstream provider send/receive failed.
- `PERSISTENCE_FAILURE`: binding state could not be stored or loaded.

## Testing Strategy

- Unit test one-to-one binding replacement semantics.
- Unit test lookup symmetry for both directions.
- Unit test routing for bound and unbound sessions.
- Unit test adapter normalization from Lark event payloads.
- Integration test the bind -> receive -> reply cycle with a fake adapter.

## Implementation Plan

### Task 1: Bootstrap the Node.js project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts`
- Create: `src/config/env.ts`
- Create: `src/types/index.ts`

**Step 1: Write the failing test**

Create a minimal test that imports the entrypoint and config loader.

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: fail because the project scaffold does not exist yet.

**Step 3: Write minimal implementation**

Add TypeScript bootstrap code and config validation.

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: pass once the scaffold is in place.

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

### Task 4: Implement the Lark adapter boundary

**Files:**
- Create: `src/adapters/lark/index.ts`
- Create: `src/adapters/lark/adapter.ts`
- Create: `tests/adapters/lark/adapter.test.ts`

**Step 1: Write the failing test**

Cover event normalization and outbound send behavior.

**Step 2: Run test to verify it fails**

Run: `npm test -- lark`
Expected: fail.

**Step 3: Write minimal implementation**

Wrap `@larksuite/openclaw-lark` behind the adapter interface.

**Step 4: Run test to verify it passes**

Run: `npm test -- lark`
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
- Create: `tests/smoke/app.test.ts`

**Step 1: Write the failing test**

Verify the app boots with config, storage, API, and adapter wiring.

**Step 2: Run test to verify it fails**

Run: `npm test -- smoke`
Expected: fail.

**Step 3: Write minimal implementation**

Wire all modules together behind a single entrypoint.

**Step 4: Run test to verify it passes**

Run: `npm test -- smoke`
Expected: pass.

