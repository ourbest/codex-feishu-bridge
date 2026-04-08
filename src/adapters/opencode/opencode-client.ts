import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import type { CodexProjectClient } from '../../runtime/codex-project.ts';
import type { CodexServerRequest } from '../codex/app-server-client.ts';

export interface OpencodeClientOptions {
  projectInstanceId: string;
  cwd?: string;
  /**
   * opencode 可执行文件（默认：opencode）
   */
  command?: string;
  /**
   * server 监听地址（默认：127.0.0.1）
   */
  hostname?: string;
  /**
   * server 端口；不填则自动分配一个空闲端口（仅在进程存活期内固定）。
   */
  port?: number;
  /**
   * 额外的 `opencode serve` 参数（例如 cors）。
   */
  extraArgs?: string[];
  /**
   * HTTP Basic Auth（可选）。若设置，同时会注入到 `opencode serve` 进程的环境变量中。
   */
  username?: string;
  password?: string;

  /**
   * 依赖注入：用于单元测试（避免真的拉起 opencode / 发真实 HTTP）。
   */
  testing?: {
    allocatePort?: () => Promise<number>;
    spawnServe?: (command: string, args: string[], options: { cwd?: string; env: Record<string, string> }) => ChildProcess;
    fetch?: typeof fetch;
  };
}

/**
 * 获取一个当前可用的本地空闲端口。
 */
async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        server.close(() => resolve(port));
        return;
      }
      server.close(() => reject(new Error('failed to allocate port')));
    });
  });
}

/**
 * 等待指定毫秒数。
 */
async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * OpenCode（`opencode serve`）HTTP/SSE 客户端，实现 CodexProjectClient 接口以接入现有 project-registry。
 */
export class OpencodeClient implements CodexProjectClient {
  private readonly projectInstanceId: string;
  private readonly cwd?: string;
  private readonly command: string;
  private readonly hostname: string;
  private port: number | null;
  private readonly extraArgs: string[];
  private readonly username?: string;
  private readonly password?: string;

  private proc: ChildProcess | null = null;
  private sessionId: string | null = null;
  private baseUrl: string | null = null;
  private serverFetch: typeof fetch | null = null;
  private abortEvents: AbortController | null = null;
  private pendingPermissionRequests = new Map<string, { permissionId: string; sessionId: string; tool?: string; action?: string }>();
  private readonly allocatePort: () => Promise<number>;
  private readonly spawnServe: (command: string, args: string[], options: { cwd?: string; env: Record<string, string> }) => ChildProcess;
  private readonly fetchImpl: typeof fetch;

  // CodexProjectClient callbacks
  onTextDelta: ((text: string) => void | null) | null = null;
  onTurnCompleted: (() => void) | null = null;
  onNotification: ((message: { method: string; params?: Record<string, unknown> }) => void | Promise<void>) | null = null;
  onServerRequest: ((request: CodexServerRequest) => void | Promise<void>) | null = null;
  onThreadChanged: ((threadId: string) => void) | null = null;
  respondToServerRequest: (requestId: number | string, result: unknown) => Promise<void>;

  constructor(options: OpencodeClientOptions) {
    this.projectInstanceId = options.projectInstanceId;
    this.cwd = options.cwd;
    this.command = options.command ?? 'opencode';
    this.hostname = options.hostname ?? '127.0.0.1';
    this.port = typeof options.port === 'number' ? options.port : null;
    this.extraArgs = options.extraArgs ?? [];
    this.username = options.username;
    this.password = options.password;

    this.allocatePort = options.testing?.allocatePort ?? getFreePort;
    this.spawnServe = options.testing?.spawnServe ?? ((command, args, spawnOptions) => spawn(command, args, {
      cwd: spawnOptions.cwd,
      env: spawnOptions.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    }));
    this.fetchImpl = options.testing?.fetch ?? globalThis.fetch;

    // 绑定 this，避免在 createProjectRegistry 的闭包里丢失上下文
    this.respondToServerRequest = async (requestId, result) => {
      await this.handlePermissionResponse(requestId, result);
    };
  }

  private buildBaseUrl(): string {
    if (this.port === null) {
      throw new Error('opencode port is not initialized');
    }
    return `http://${this.hostname}:${this.port}`;
  }

  private async ensureServer(): Promise<void> {
    if (this.proc !== null && this.baseUrl !== null && this.serverFetch !== null) {
      return;
    }

    if (this.port === null) {
      this.port = await this.allocatePort();
    }

    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    if (this.password?.trim()) {
      env.OPENCODE_SERVER_PASSWORD = this.password.trim();
      env.OPENCODE_SERVER_USERNAME = this.username?.trim() || 'opencode';
    }

    const args = [
      'serve',
      '--hostname',
      this.hostname,
      '--port',
      String(this.port),
      ...this.extraArgs,
    ];

    this.proc = this.spawnServe(this.command, args, { cwd: this.cwd, env });

    this.proc.stdout?.setEncoding('utf8');
    this.proc.stderr?.setEncoding('utf8');

    this.proc.stdout?.on('data', (chunk) => {
      // 注意：serve 模式原则上不应输出到 stdout（以免污染协议），但这里是子进程托管，不影响主进程。
      this.onNotification?.({ method: 'opencode/stdout', params: { chunk } });
    });

    this.proc.stderr?.on('data', (chunk) => {
      this.onNotification?.({ method: 'opencode/stderr', params: { chunk } });
    });

    this.proc.on('close', (code) => {
      this.onNotification?.({ method: 'opencode/exit', params: { code } });
      this.proc = null;
      if (this.abortEvents) {
        this.abortEvents.abort();
        this.abortEvents = null;
      }
      this.pendingPermissionRequests.clear();
      this.baseUrl = null;
      this.serverFetch = null;
      this.sessionId = null;
    });

    const baseUrl = this.buildBaseUrl();

    const authHeader =
      this.password?.trim()
        ? `Basic ${Buffer.from(`${this.username?.trim() || 'opencode'}:${this.password.trim()}`).toString('base64')}`
        : null;

    const fetchWithAuth: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers ?? undefined);
      if (authHeader) {
        headers.set('Authorization', authHeader);
      }
      return await this.fetchImpl(input, { ...init, headers });
    };

    this.baseUrl = baseUrl;
    this.serverFetch = authHeader ? fetchWithAuth : this.fetchImpl;

    await this.waitForHealth({ timeoutMs: 15_000, fetch: this.serverFetch });
    this.startEventListener({ baseUrl, fetchImpl: this.serverFetch });
  }

  private async waitForHealth(input: { timeoutMs: number; fetch: typeof fetch }): Promise<void> {
    const deadline = Date.now() + input.timeoutMs;
    const baseUrl = this.buildBaseUrl();
    let lastError: unknown = null;

    while (Date.now() < deadline) {
      try {
        const res = await input.fetch(`${baseUrl}/global/health`);
        if (res.ok) {
          return;
        }
        lastError = new Error(`healthcheck failed: HTTP ${res.status}`);
      } catch (err) {
        lastError = err;
      }
      await sleep(250);
    }

    throw new Error(
      `[opencode] server did not become healthy in time (project=${this.projectInstanceId}, baseUrl=${baseUrl}): ${String(
        (lastError as Error | null)?.message ?? lastError ?? 'unknown',
      )}`,
    );
  }

  async startThread(input?: { cwd?: string; force?: boolean }): Promise<string> {
    await this.ensureServer();
    if (this.baseUrl === null || this.serverFetch === null) {
      throw new Error('opencode server not initialized');
    }

    if (input?.force === true || this.sessionId === null) {
      const res = await this.serverFetch(`${this.baseUrl}/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: `${this.projectInstanceId}` }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`[opencode] create session failed: HTTP ${res.status} ${text}`.trim());
      }
      const data = await res.json() as { id?: string };
      if (!data?.id) {
        throw new Error('[opencode] create session failed: missing session id');
      }
      this.sessionId = data.id;
      this.onThreadChanged?.(this.sessionId);
    }
    return this.sessionId;
  }

  async resumeThread(input: { threadId: string; cwd?: string }): Promise<string> {
    await this.ensureServer();
    this.sessionId = input.threadId;
    this.onThreadChanged?.(this.sessionId);
    return input.threadId;
  }

  async generateReply(input: { text: string; cwd?: string }): Promise<string> {
    await this.ensureServer();
    if (this.baseUrl === null || this.serverFetch === null) {
      throw new Error('opencode server not initialized');
    }

    if (this.sessionId === null) {
      await this.startThread({ force: true });
    }
    if (this.sessionId === null) {
      throw new Error('opencode session not initialized');
    }

    const res = await this.serverFetch(`${this.baseUrl}/session/${encodeURIComponent(this.sessionId)}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        parts: [{ type: 'text', text: input.text }],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`[opencode] send message failed: HTTP ${res.status} ${text}`.trim());
    }

    const result = await res.json() as any;
    const parts: Array<{ type: string; text?: string }> = result?.parts ?? [];
    const text = parts
      .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text as string)
      .join('');

    // fallback：如果 parts 取不到，就把 data stringify（避免直接空回复）
    const finalText = text.trim() !== '' ? text : JSON.stringify(result);
    this.onTurnCompleted?.();
    return finalText;
  }

  private startEventListener(input: { baseUrl: string; fetchImpl: typeof fetch }): void {
    if (this.abortEvents !== null) {
      return;
    }
    this.abortEvents = new AbortController();

    const run = async () => {
      const eventUrl = `${input.baseUrl}/event`;
      try {
        const res = await input.fetchImpl(eventUrl, {
          method: 'GET',
          headers: { Accept: 'text/event-stream' },
          signal: this.abortEvents?.signal,
        });
        if (!res.ok || !res.body) {
          this.onNotification?.({ method: 'opencode/events_error', params: { status: res.status } });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE block delimiter: \n\n
          let idx = buffer.indexOf('\n\n');
          while (idx !== -1) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            idx = buffer.indexOf('\n\n');
            const parsed = this.parseSseBlock(block);
            if (parsed) {
              await this.handleSseEvent(parsed.event, parsed.data);
            }
          }
        }
      } catch (err) {
        if (this.abortEvents?.signal.aborted) return;
        this.onNotification?.({ method: 'opencode/events_error', params: { error: String((err as Error)?.message ?? err) } });
      }
    };

    // 不阻塞主流程
    void run();
  }

  private parseSseBlock(block: string): { event: string; data: unknown } | null {
    const lines = block.split('\n');
    let event: string | null = null;
    let dataStr: string | null = null;
    for (const line of lines) {
      if (line.startsWith('event:')) {
        event = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        // opencode 事件里 data 通常是一行 JSON
        dataStr = line.slice('data:'.length).trim();
      }
    }
    if (!event) return null;
    let data: unknown = null;
    if (dataStr && dataStr !== '') {
      try {
        data = JSON.parse(dataStr);
      } catch {
        data = dataStr;
      }
    }
    return { event, data };
  }

  private async handleSseEvent(event: string, data: unknown): Promise<void> {
    // 只做最关键的 permission.request，其它事件先透传
    if (event !== 'permission.request') {
      this.onNotification?.({ method: `opencode/event:${event}`, params: { data: data as any } });
      return;
    }

    // 参考 opencode.nvim：{ id, sessionID, tool, action, context }
    if (typeof data !== 'object' || data === null) {
      return;
    }
    const rec = data as Record<string, unknown>;
    const permissionId = typeof rec.id === 'string' ? rec.id : null;
    const sessionID = typeof rec.sessionID === 'string' ? rec.sessionID : null;
    const tool = typeof rec.tool === 'string' ? rec.tool : null;
    const action = typeof rec.action === 'string' ? rec.action : null;
    if (!permissionId || !sessionID) return;

    // 保存以便 respondToServerRequest 回写
    this.pendingPermissionRequests.set(permissionId, {
      permissionId,
      sessionId: sessionID,
      tool: tool ?? undefined,
      action: action ?? undefined,
    });

    // 将 OpenCode 的 permission 请求转换成 bridge 现有的“server request”模型
    const method =
      tool === 'edit'
        ? 'item/fileChange/requestApproval'
        : 'item/commandExecution/requestApproval';

    const request: CodexServerRequest = {
      id: permissionId,
      method,
      params: {
        tool,
        action,
        reason: action,
        command: action,
        threadId: sessionID,
        turnId: permissionId,
        itemId: permissionId,
        // 额外透传上下文
        context: rec.context,
        cwd: this.cwd ?? null,
      } as Record<string, unknown>,
    };

    try {
      await this.onServerRequest?.(request);
    } catch (err) {
      this.onNotification?.({ method: 'opencode/permission_handler_error', params: { error: String((err as Error)?.message ?? err) } });
    }
  }

  private async handlePermissionResponse(requestId: number | string, result: unknown): Promise<void> {
    const key = String(requestId);
    const pending = this.pendingPermissionRequests.get(key);
    if (!pending) {
      // 允许幂等/重复调用
      this.onNotification?.({ method: 'opencode/permission_response_missing', params: { requestId: key } });
      return;
    }

    // 从 ApprovalService 的结果映射到 OpenCode 的 { response, remember? }
    let response: 'allow' | 'deny' = 'deny';
    let remember: boolean | undefined = undefined;

    if (typeof result === 'object' && result !== null) {
      const r = result as Record<string, unknown>;
      if (typeof r.decision === 'string') {
        if (r.decision === 'accept' || r.decision === 'acceptForSession') {
          response = 'allow';
        } else {
          response = 'deny';
        }
        remember = r.decision === 'acceptForSession' ? true : undefined;
      } else if (r.permissions !== undefined && typeof r.scope === 'string') {
        // 兼容 ApprovalKind=permissions 的结果
        response = r.scope === 'turn' || r.scope === 'session' ? 'allow' : 'deny';
        remember = r.scope === 'session' ? true : undefined;
      }
    }

    const baseUrl = this.buildBaseUrl();
    const url = `${baseUrl}/session/${encodeURIComponent(pending.sessionId)}/permissions/${encodeURIComponent(pending.permissionId)}`;

    const authHeader =
      this.password?.trim()
        ? `Basic ${Buffer.from(`${this.username?.trim() || 'opencode'}:${this.password.trim()}`).toString('base64')}`
        : null;

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (authHeader) headers.authorization = authHeader;

    const body = JSON.stringify({
      response,
      ...(remember !== undefined ? { remember } : {}),
    });

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`[opencode] permission response failed: HTTP ${res.status} ${text}`.trim());
    }

    this.pendingPermissionRequests.delete(key);
    this.onNotification?.({ method: 'opencode/permission_replied', params: { requestId: key, response, remember } });
  }

  async stop(): Promise<void> {
    if (this.abortEvents) {
      this.abortEvents.abort();
      this.abortEvents = null;
    }
    this.pendingPermissionRequests.clear();
    if (this.proc) {
      this.proc.kill();
    }
    this.proc = null;
    this.baseUrl = null;
    this.serverFetch = null;
    this.sessionId = null;
  }
}

