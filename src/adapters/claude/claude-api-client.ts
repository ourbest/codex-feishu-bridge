import type { CodexProjectClient } from '../../runtime/codex-project.ts';

export interface ClaudeApiClientOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  systemPrompt?: string;
  cwd?: string;
  onTextDelta?: (text: string) => void | null;
  onTurnCompleted?: (() => void) | null;
  onThreadChanged?: ((threadId: string) => void) | null;
  onNotification?: ((message: { method: string; params?: Record<string, unknown> }) => void | Promise<void>) | null;
  onServerRequest?: never; // Not applicable for Claude API
  respondToServerRequest?: never; // Not applicable for Claude API
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeThreadState {
  threadId: string;
  conversationId: string | null;
}

export class ClaudeApiClient implements CodexProjectClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly systemPrompt?: string;
  private readonly cwd?: string;

  onTextDelta: ((text: string) => void | null) | null;
  onTurnCompleted: (() => void) | null;
  onThreadChanged: ((threadId: string) => void) | null;
  onNotification: ((message: { method: string; params?: Record<string, unknown> }) => void | Promise<void>) | null;
  onServerRequest: never = undefined;
  respondToServerRequest: never = undefined;

  private currentThread: ClaudeThreadState | null = null;
  private messageHistory: Message[] = [];
  private abortController: AbortController | null = null;

  constructor(options: ClaudeApiClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://api.anthropic.com';
    this.model = options.model ?? 'claude-sonnet-4-20250514';
    this.systemPrompt = options.systemPrompt;
    this.cwd = options.cwd;
    this.onTextDelta = options.onTextDelta ?? null;
    this.onTurnCompleted = options.onTurnCompleted ?? null;
    this.onThreadChanged = options.onThreadChanged ?? null;
    this.onNotification = options.onNotification ?? null;
  }

  async generateReply(input: { text: string; cwd?: string }): Promise<string> {
    this.abortController = new AbortController();

    this.messageHistory.push({ role: 'user', content: input.text });

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: 8192,
      stream: true,
      messages: this.messageHistory,
    };

    if (this.systemPrompt) {
      body.system = this.systemPrompt;
    }

    const url = `${this.baseUrl}/v1/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Claude API returned empty response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalReply = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            continue;
          }

          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '') continue;

            try {
              const event = JSON.parse(data) as { type: string; [key: string]: unknown };

              if (event.type === 'content_block_delta') {
                const delta = event.delta as { type: string; text: string } | undefined;
                if (delta?.type === 'text_delta') {
                  finalReply += delta.text;
                  this.onTextDelta?.(delta.text);
                }
              } else if (event.type === 'message_stop') {
                // Check if Claude returned a conversation_id for thread continuity
                const conversationId = (event as { conversation_uuid?: string }).conversation_uuid;
                if (conversationId && this.currentThread) {
                  this.currentThread.conversationId = conversationId;
                }
              }
            } catch {
              // Ignore parse errors for malformed events
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Store assistant response in history for multi-turn
    this.messageHistory.push({ role: 'assistant', content: finalReply });

    this.onTurnCompleted?.();
    return finalReply;
  }

  async startThread(input: { cwd?: string; force?: boolean }): Promise<string> {
    // Create a new internal thread ID
    const threadId = `thread_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    this.currentThread = {
      threadId,
      conversationId: null,
    };
    this.messageHistory = [];
    this.onThreadChanged?.(threadId);
    return threadId;
  }

  async resumeThread(input: { threadId: string; cwd?: string }): Promise<string> {
    // Find the thread - for now, we don't persist thread state across restarts
    // Each resumeThread starts fresh. In a production system, you'd load the conversation history.
    if (!this.currentThread || this.currentThread.threadId !== input.threadId) {
      this.currentThread = {
        threadId: input.threadId,
        conversationId: null,
      };
      this.messageHistory = [];
    }
    this.onThreadChanged?.(input.threadId);
    return input.threadId;
  }

  async stop(): Promise<void> {
    this.abortController?.abort();
    this.messageHistory = [];
    this.currentThread = null;
  }
}
