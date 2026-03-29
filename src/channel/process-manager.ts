import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

import {
  parseChannelMessage,
  serializeChannelMessage,
  type ChannelMessage,
  type ChannelOutboundMessage,
} from './protocol.ts';

export interface JsonLineProcessManagerOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  onStderr?: (text: string) => void;
}

type EventHandler = (message: ChannelMessage) => void | Promise<void>;

export class JsonLineProcessManager {
  private readonly options: JsonLineProcessManagerOptions;
  private child: ChildProcessWithoutNullStreams | null = null;
  private eventHandler: EventHandler | null = null;
  private started = false;
  private ready = false;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;

  constructor(options: JsonLineProcessManagerOptions) {
    this.options = options;
  }

  onEvent(handler: EventHandler): void {
    this.eventHandler = handler;
  }

  isReady(): boolean {
    return this.ready;
  }

  async start(): Promise<void> {
    if (this.started) {
      await this.readyPromise;
      return;
    }

    this.started = true;
    this.ready = false;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    const child = spawn(this.options.command, this.options.args ?? [], {
      cwd: this.options.cwd,
      env: {
        ...process.env,
        ...this.options.env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child = child;

    const stdout = createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });
    stdout.on('line', (line) => {
      let message: ChannelMessage;
      try {
        message = parseChannelMessage(line);
      } catch (error) {
        this.dispatchMessage({
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      if (message.type === 'status' && message.state === 'ready' && !this.ready) {
        this.ready = true;
        this.readyResolve?.();
      }

      if (message.type === 'status' && message.state === 'stopped') {
        this.ready = false;
      }

      this.dispatchMessage(message);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      this.options.onStderr?.(chunk.toString());
    });

    child.once('error', (error) => {
      if (!this.ready) {
        this.readyReject?.(error instanceof Error ? error : new Error(String(error)));
      }
    });

    child.once('exit', (code, signal) => {
      this.started = false;
      this.ready = false;
      if (!this.readyResolve) {
        return;
      }

      if (!this.child) {
        return;
      }

      if (code !== 0 && signal === null && !this.ready) {
        this.readyReject?.(new Error(`Channel process exited before ready (code ${code ?? 'unknown'})`));
      }
    });

    await this.readyPromise;
  }

  async send(message: ChannelOutboundMessage): Promise<void> {
    if (this.child === null || this.child.stdin.destroyed) {
      throw new Error('Channel process is not running');
    }

    this.child.stdin.write(`${serializeChannelMessage(message)}\n`);
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (child === null) {
      return;
    }

    this.child = null;
    this.started = false;

    if (!child.stdin.destroyed) {
      child.stdin.write(`${serializeChannelMessage({ type: 'stop' })}\n`);
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 1000);

      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  private dispatchMessage(message: ChannelMessage): void {
    if (this.eventHandler === null) {
      return;
    }

    void this.eventHandler(message);
  }
}
