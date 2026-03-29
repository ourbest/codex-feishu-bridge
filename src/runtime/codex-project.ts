import type { InboundMessage, ProjectReply } from '../core/events/message.ts';
import type { BridgeRouter } from '../core/router/router.ts';

export interface CodexProjectClient {
  generateReply(input: { text: string; cwd?: string }): Promise<string>;
  stop(): Promise<void>;
  onTextDelta?: ((text: string) => void) | null;
  onTurnCompleted?: (() => void) | null;
}

export interface CodexProjectSessionOptions {
  projectInstanceId: string;
  client: CodexProjectClient;
}

type ProjectMessageHandler = (input: {
  projectInstanceId: string;
  message: InboundMessage;
}) => Promise<ProjectReply | null>;

export class CodexProjectSession {
  private readonly projectInstanceId: string;
  private readonly client: CodexProjectClient;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: CodexProjectSessionOptions) {
    this.projectInstanceId = options.projectInstanceId;
    this.client = options.client;
  }

  attach(router: Pick<BridgeRouter, 'registerProjectHandler'>): void {
    const handler: ProjectMessageHandler = async ({ message }) => {
      const text = await this.enqueue(() => this.client.generateReply({ text: message.text }));
      return { text };
    };

    router.registerProjectHandler(this.projectInstanceId, handler);
  }

  async stop(): Promise<void> {
    await this.client.stop();
  }

  private async enqueue<T>(task: () => Promise<T>): Promise<T> {
    const execution = this.queue.then(task, task);
    this.queue = execution.then(
      () => undefined,
      () => undefined,
    );
    return execution;
  }
}

export function createCodexProjectSession(options: CodexProjectSessionOptions): CodexProjectSession {
  return new CodexProjectSession(options);
}
