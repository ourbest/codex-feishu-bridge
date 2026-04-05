# codex-bridge

Bridge service for connecting Codex project instances to Feishu/Lark chats.

## Overview

- Manages one-to-one bindings between `projectInstanceId` and `chatId`
- Routes inbound IM messages to the bound Codex project
- Sends Codex replies, command results, and approval prompts back to the originating chat
- Supports both local dev transport and real Feishu WebSocket transport
- Connects to Codex projects lazily from `projects.json`

## Requirements

- Node.js 24
- `codex` available locally if you want to run Codex app-server projects
- `pm2` if you want process supervision and in-chat `//restart`

## Scripts

```bash
npm test
npm run dev
npm start
```

## Quick Start

1. Copy [projects.json.example](/Users/yonghui/git/codex-bridge/projects.json.example) to `projects.json` and edit the project entries.
2. Add a `.env` file if you want Feishu WebSocket transport.
3. Start the bridge:

```bash
npm start
```

By default the bridge listens on `http://127.0.0.1:3000` and stores bindings in `./data/bridge.json`.

## Project Configuration

The bridge loads available Codex projects from `projects.json` or `BRIDGE_PROJECTS_FILE`.

Example:

```json
{
  "projects": [
    {
      "projectInstanceId": "project-a",
      "command": "codex",
      "args": ["app-server"],
      "cwd": "/absolute/path/to/project-a",
      "serviceName": "project-a",
      "transport": "stdio"
    }
  ]
}
```

Supported fields:

- `projectInstanceId`
- `command`
- `args`
- `cwd`
- `serviceName`
- `transport`: `stdio` or `websocket`
- `websocketUrl`: only used for `websocket`

## Transport Modes

### Local Dev

If `BRIDGE_FEISHU_WS_ENABLED` is not set, the bridge uses the local dev transport and logs outbound messages to stdout.

### Feishu WebSocket

To use the real Feishu transport, set:

```bash
FEISHU_APP_ID=...
FEISHU_APP_SECRET=...
BRIDGE_FEISHU_WS_ENABLED=1
```

Then start the bridge with `npm start`.

## Run with pm2

For production-style runs, manage the bridge with pm2:

```bash
pm2 start ecosystem.config.cjs
pm2 logs codex-bridge
pm2 save
```

Useful lifecycle commands:

```bash
pm2 restart codex-bridge
pm2 stop codex-bridge
pm2 delete codex-bridge
```

The bundled [ecosystem.config.cjs](/Users/yonghui/git/codex-bridge/ecosystem.config.cjs) starts the bridge via `npm start`, loads `.env`, and enables automatic restart. The in-chat `//restart` command exits the current process with code `0`, and pm2 starts a fresh bridge process immediately.

## Bind a project to a chat

```bash
curl -X POST http://127.0.0.1:3000/bindings \
  -H 'content-type: application/json' \
  -d '{"projectInstanceId":"project-a","sessionId":"chat-a"}'
```

Lookups:

```bash
curl http://127.0.0.1:3000/bindings/project/project-a
curl http://127.0.0.1:3000/bindings/session/chat-a
```

## Chat Commands

In Feishu/Lark chats, the bridge understands:

```text
//bind <projectId>
//unbind
//list
//sessions
//read <path>
//restart
//reload projects
//resume <threadId|last>
//help
app/list
session/list
session/get <id>
thread/list
thread/start
thread/read <id>
```

Notes:

- `//help`, `//sessions`, `//read`, `app/list`, `session/*`, and `thread/*` render as interactive cards when card transport is available.
- `//sessions` shows the bridge binding plus current Codex project state.
- `//read <path>` reads a file under the bound project's `cwd` and returns it as a Markdown card.
- `//reload projects` reloads `projects.json` immediately.
- `//resume <threadId|last>` resumes the last or explicit Codex thread for the current chat.
- `//restart` is intended for pm2-managed runs.

## Console Mode

Console mode lets you talk to one project directly in the terminal:

```bash
BRIDGE_CONSOLE=1 \
BRIDGE_CONSOLE_PROJECT_INSTANCE_ID=project-a \
BRIDGE_CODEX_CWD=/absolute/path/to/project-a \
npm start
```

## HTTP API

- `POST /bindings`
- `GET /bindings/project/:id`
- `GET /bindings/session/:id`
- `DELETE /bindings/project/:id`
- `DELETE /bindings/session/:id`
- `GET /health`

## Key Environment Variables

- `BRIDGE_HOST`
- `BRIDGE_PORT`
- `BRIDGE_STORAGE_PATH`
- `BRIDGE_PROJECTS_FILE`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `BRIDGE_FEISHU_WS_ENABLED`
- `BRIDGE_CODEX_PROJECTS_JSON`
- `BRIDGE_CODEX_PROJECT_INSTANCE_ID`
- `BRIDGE_CODEX_COMMAND`
- `BRIDGE_CODEX_ARGS_JSON`
- `BRIDGE_CODEX_CWD`
- `BRIDGE_CODEX_SERVICE_NAME`
- `BRIDGE_CODEX_TRANSPORT`
- `BRIDGE_CODEX_WEBSOCKET_URL`
