# 绑定会话名称记录方案

## 目标

在绑定项目时，记录群名或单聊用户名，便于 `//projects` 等命令展示；在收到事件时自动补全缺失的会话名称。

## 方案选择

**方案 B（宽松）**：绑定操作立即完成，名称异步获取，用 `[未知会话]` 占位，后续事件来了再补全。

## 存储层

### BindingRecord 新增字段

```typescript
export interface BindingRecord {
  projectInstanceId: string;
  sessionId: string;
  sessionName?: string; // 新增：群名或单聊用户名
}
```

### BindingStore 接口新增方法

```typescript
updateSessionName(sessionId: string, name: string): void;
```

### 存储实现

- **InMemoryBindingStore**：用 `Map<string, string>`（sessionId → name）存储会话名称
- **JsonBindingStore**：序列化时包含 `sessionName` 字段；读取旧数据时安全忽略缺失字段

## 异步获取会话名称

### LarkChatInfoService

新建 `src/services/lark-chat-info-service.ts`：

```typescript
class LarkChatInfoService {
  constructor(client: Client, logger?: Logger)
  async getChatName(chatId: string): Promise<string | null>
}
```

- 调用 `client.im.v1.chat.get({ path: { chat_id: chatId } })`
- `chat_type === 'p2p'` 时返回 `[P2P]`（单聊无明确用户名）
- 获取失败时返回 `null`，不抛错

## BindingService 变更

### 新增方法

```typescript
async enrichSessionName(sessionId: string): Promise<void>
```

- 查找该 sessionId 对应的 binding
- 若存在 binding 且 `sessionName` 为空，调用 `LarkChatInfoService.getChatName()` 并更新

### 绑定时触发

`bindProjectToSession()` 内部在绑定完成后，立即 fire-and-forget 调用 `enrichSessionName()`。

## 注入方式

`LarkChatInfoService` 在 `main.ts` 创建（`Client` 已在 `main.ts` 初始化），通过 `createBridgeApp` 的新选项传入：

```typescript
createBridgeApp({
  // ...existing options
  larkChatInfoService?: LarkChatInfoService;
})
```

## 事件补全路径

```
feishu-websocket 收到消息
  → LarkAdapter.normalizeInboundEvent()
  → BridgeRouter.routeInboundMessage()
    → 发现 binding.sessionName 为空
    → bindingService.enrichSessionName(sessionId) // 异步，不阻塞路由
```

## //projects 命令变更

当前输出格式不变，但当 project 有绑定时，新增 `session` 和 `session id` 字段：

```
## [lark-agent-bridge] projects
- project_a
  - session: 群名或[P2P]或未知
  - session id: chat_xxx
  - cwd: /path
  ...
```

通过 `bindingService.getSessionByProject(projectId)` 获取 sessionId，再从 store 查 `sessionName`。

## 文件变更清单

| 文件 | 变更类型 |
|------|---------|
| `src/storage/binding-store.ts` | BindingRecord + updateSessionName 接口 + InMemoryBindingStore 实现 |
| `src/storage/json-binding-store.ts` | updateSessionName 实现 + 持久化 |
| `src/services/lark-chat-info-service.ts` | **新建** |
| `src/core/binding/binding-service.ts` | enrichSessionName + 绑定时触发异步获取 |
| `src/app.ts` | createBridgeApp 接受 larkChatInfoService |
| `src/main.ts` | 创建 LarkChatInfoService 并传入 app |
| `src/commands/chat-command-service.ts` | //projects 显示 sessionName |
| `src/core/router/router.ts` | 路由时检查并补全 sessionName |
