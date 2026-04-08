# codex-bridge

Bridge service connecting Codex project instances to Feishu/Lark chat sessions. Send messages to a chat, and the bound Codex project responds.

## Prerequisites

- **Node.js 24**
- **codex CLI** (if running Codex app-server projects locally)
- **Qwen Code + `@qwen-code/sdk`** (if running Qwen-backed projects locally)
- **pm2** (optional, for production deployment with `//restart` support)
- **Feishu bot app** (if using Feishu transport)

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure projects

Copy the example config and edit:

```bash
cp projects.json.example projects.json
```

Edit `projects.json` with your project paths:

```json
{
  "projects": [
    {
      "projectInstanceId": "my-project",
      "command": "codex",
      "args": ["app-server"],
      "cwd": "/path/to/your/project",
      "serviceName": "my-project",
      "transport": "stdio",
      "adapterType": "codex"
    },
    {
      "projectInstanceId": "my-qwen-project",
      "cwd": "/path/to/your/project",
      "serviceName": "my-qwen-project",
      "transport": "websocket",
      "adapterType": "qwen-code",
      "qwenExecutable": "/opt/homebrew/bin/qwen"
    }
  ]
}
```

### OpenCode (opencode serve) 项目示例

如果你想把 Feishu 会话绑定到 **OpenCode**（每个 repo 启一个 `opencode serve`），可以配置：

```json
{
  "projects": [
    {
      "projectInstanceId": "repo-a",
      "adapterType": "opencode",
      "cwd": "/path/to/repo-a",
      "serviceName": "repo-a",
      "transport": "stdio",
      "opencodeHostname": "127.0.0.1",
      "opencodePort": 4101
    }
  ]
}
```

### 3. Configure Feishu (optional)

Create a `.env` file for Feishu WebSocket transport:

```bash
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret
BRIDGE_FEISHU_WS_ENABLED=1
```

If `BRIDGE_FEISHU_WS_ENABLED` is not set, the bridge runs in local dev mode - messages are logged to stdout instead of sent to Feishu.

### 4. Start the bridge

```bash
npm start
```

The bridge listens on `http://127.0.0.1:3000` and stores bindings in `./data/bridge.json`.

## Project Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `projectInstanceId` | Yes | Unique identifier for the project |
| `command` | Yes | Command to start Codex (e.g., `codex`) |
| `args` | Yes | Arguments, typically `["app-server"]` |
| `cwd` | Yes | Working directory for the project |
| `serviceName` | Yes | Display name for pm2/logs |
| `transport` | Yes | `stdio` or `websocket` |
| `websocketUrl` | No | Required for `websocket` transport |
| `adapterType` | No | `codex` (default), `claude-code`, `qwen-code`, `opencode` |
| `qwenExecutable` | No | Full path to the Qwen binary for Qwen-backed projects |
| `opencodeHostname` | No | OpenCode server hostname (default `127.0.0.1`) |
| `opencodePort` | No | OpenCode server port (recommended to set per repo) |
| `opencodeCommand` | No | OpenCode executable (default `opencode`) |
| `opencodeExtraArgs` | No | Extra args for `opencode serve` (array of strings) |
| `opencodeUsername` | No | HTTP basic auth username (optional) |
| `opencodePassword` | No | HTTP basic auth password (optional) |

## Bridge Commands

In a bound Feishu chat, use these commands:

| Command | Description |
|---------|-------------|
| `//bind <projectId>` | Bind this chat to a project |
| `//unbind` | Unbind this chat |
| `//list` | Show current binding |
| `//status` | Show bridge and Codex state |
| `//sessions` | Alias for `//status` |
| `//read <path>` | Read a file from the project's `cwd` |
| `//restart` | Restart the bridge (pm2 only) |
| `//reload projects` | Reload `projects.json` |
| `//resume <threadId\|last>` | Resume a Codex thread |
| `//new` | Start a fresh Codex thread for this chat |
| `//model <name>` | Update the bound project's model |
| `//help` | Show help |

## Approval Commands

Use these commands while the bridge is waiting for approval:

| Command | Description |
|---------|-------------|
| `//approvals` | List pending approval requests for this chat |
| `//approve <id>` | Approve one request |
| `//approve-all <id>` | Approve one request and remember it for this session |
| `//approve-auto <minutes>` | Auto-approve approval requests in this chat for N minutes |
| `//deny <id>` | Deny one request |

## Codex Commands

These commands are forwarded to the bound Codex project:

| Command | Description |
|---------|-------------|
| `//session/list` | List Codex sessions |
| `//session/get <id>` | Inspect one Codex session |
| `//thread/list` | List Codex threads |
| `//thread/get <id>` | Inspect one Codex thread |
| `//thread/read <id>` | Read a thread with richer summary output |
| `//review` | Review the current working tree |
| `//review --base <branch>` | Review against a branch |
| `//review --commit <sha>` | Review a specific commit |
| `//review <instructions>` | Review with custom instructions |

Interactive commands also render as cards:

```
app/list
session/list
session/get <id>
thread/list
thread/start
thread/get <id>
thread/read <id>
review
```

## HTTP API

```
POST   /bindings                    # Create binding
GET    /bindings/project/:id        # Lookup session by project
GET    /bindings/session/:id        # Lookup project by session
DELETE /bindings/project/:id        # Unbind project
DELETE /bindings/session/:id        # Unbind session
GET    /health                     # Health check
```

Example:

```bash
curl -X POST http://127.0.0.1:3000/bindings \
  -H 'content-type: application/json' \
  -d '{"projectInstanceId":"my-project","sessionId":"chat-id-from-feishu"}'
```

## Production Deployment with pm2

```bash
pm2 start ecosystem.config.cjs
pm2 logs codex-bridge
pm2 save
```

Lifecycle commands:

```bash
pm2 restart codex-bridge
pm2 stop codex-bridge
pm2 delete codex-bridge
```

The `//restart` command exits with code 0, and pm2 automatically starts a fresh process.

## Environment Variables

### Bridge server

| Variable | Default | Description |
|----------|---------|-------------|
| `BRIDGE_HOST` | `127.0.0.1` | Server bind host |
| `BRIDGE_PORT` | `3000` | Server port |
| `BRIDGE_STORAGE_PATH` | `./data/bridge.json` | Binding store path |
| `BRIDGE_PROJECTS_FILE` | `./projects.json` | Projects config path |

### Feishu

| Variable | Description |
|----------|-------------|
| `FEISHU_APP_ID` | Feishu application App ID |
| `FEISHU_APP_SECRET` | Feishu application App Secret |
| `BRIDGE_FEISHU_WS_ENABLED` | Set to `1` to enable Feishu WebSocket transport |

### Codex project override

For single-project console mode:

| Variable | Description |
|----------|-------------|
| `BRIDGE_CONSOLE` | Set to `1` for console mode |
| `BRIDGE_CONSOLE_PROJECT_INSTANCE_ID` | Project to bind |
| `BRIDGE_CODEX_CWD` | Project working directory |
| `BRIDGE_CODEX_QWEN_EXECUTABLE` | Full path to the Qwen binary for Qwen-backed projects |

## Notes

- Each chat can only be bound to **one** project at a time
- Each project can be bound to **multiple** chats
- Codex connections are established **lazily** when a chat first binds to a project
- Connections are released when **all** bound chats are unbound
- Internal plan documents are excluded from git (see `docs/` in `.gitignore`)
