import type { ChannelEventMessage, ChannelOutboundMessage } from '../../channel/protocol.ts';
import { JsonLineProcessManager, type JsonLineProcessManagerOptions } from '../../channel/process-manager.ts';
import type { LarkEventPayload, LarkTransport } from './adapter.ts';

export interface OpenClawLiteTransportOptions extends JsonLineProcessManagerOptions {
  onSend?: (message: { sessionId: string; text: string }) => void;
}

export interface OpenClawLiteTransport extends LarkTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  isReady(): boolean;
}

export function createOpenClawLiteTransport(options: OpenClawLiteTransportOptions): OpenClawLiteTransport {
  const processManager = new JsonLineProcessManager(options);
  let eventHandler: ((event: LarkEventPayload) => void | Promise<void>) | null = null;

  processManager.onEvent((message) => {
    if (message.type === 'event') {
      const normalized: LarkEventPayload = {
        sessionId: message.chatId,
        messageId: message.messageId,
        text: message.text,
        senderId: message.senderId,
        timestamp: message.timestamp,
      };
      void eventHandler?.(normalized);
      return;
    }

    if (message.type === 'error') {
      options.onStderr?.(`[openclaw-lite] ${message.message}\n`);
    }
  });

  return {
    onEvent(handler) {
      eventHandler = handler;
    },
    async start() {
      await processManager.start();
    },
    async stop() {
      await processManager.stop();
    },
    isReady() {
      return processManager.isReady();
    },
    async sendMessage(message) {
      options.onSend?.(message);
      const outbound: ChannelOutboundMessage = {
        type: 'send',
        chatId: message.sessionId,
        text: message.text,
      };
      await processManager.send(outbound);
    },
  };
}
