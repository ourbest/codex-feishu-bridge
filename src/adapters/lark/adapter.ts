import type { InboundMessage, OutboundMessage } from '../../core/events/message.ts';

export interface LarkEventPayload {
  sessionId: string;
  messageId: string;
  text: string;
  senderId: string;
  timestamp: string;
}

export interface LarkTransport {
  onEvent(handler: (event: LarkEventPayload) => void | Promise<void>): void;
  sendMessage(message: { sessionId: string; text: string }): Promise<void>;
}

type MessageHandler = (message: InboundMessage) => Promise<void>;

export class LarkAdapter {
  private readonly transport: LarkTransport;
  private messageHandler: MessageHandler | null = null;
  private started = false;

  constructor(transport: LarkTransport) {
    this.transport = transport;
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;
    this.transport.onEvent(async (event) => {
      const normalized = this.normalizeInboundEvent(event);
      if (normalized === null || this.messageHandler === null) {
        return;
      }

      await this.messageHandler(normalized);
    });
  }

  async stop(): Promise<void> {
    this.started = false;
  }

  normalizeInboundEvent(event: LarkEventPayload): InboundMessage {
    return {
      source: 'lark',
      sessionId: event.sessionId,
      messageId: event.messageId,
      text: event.text,
      senderId: event.senderId,
      timestamp: event.timestamp,
    };
  }

  async send(message: OutboundMessage): Promise<void> {
    await this.transport.sendMessage({
      sessionId: message.targetSessionId,
      text: message.text,
    });
  }
}
