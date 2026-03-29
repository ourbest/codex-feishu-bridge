import type { OutboundMessage } from '../../core/events/message.ts';

export interface OpenClawLarkModule {
  sendMessageFeishu(params: {
    cfg: unknown;
    to: string;
    text: string;
    accountId?: string;
  }): Promise<unknown>;
  monitorFeishuProvider?(opts: {
    config: unknown;
    accountId?: string;
    abortSignal?: AbortSignal;
    runtime?: unknown;
  }): Promise<unknown>;
}

export interface OpenClawLarkOutboundInput {
  config: unknown;
  message: OutboundMessage;
  accountId?: string;
  openclawLark?: OpenClawLarkModule;
}

export async function sendOutboundViaOpenClawLark(input: OpenClawLarkOutboundInput): Promise<void> {
  const module = input.openclawLark ?? (await import('@larksuite/openclaw-lark')) as unknown as OpenClawLarkModule;

  await module.sendMessageFeishu({
    cfg: input.config,
    to: input.message.targetSessionId,
    text: input.message.text,
    accountId: input.accountId,
  });
}

export interface OpenClawLarkMonitorInput {
  config: unknown;
  accountId?: string;
  abortSignal?: AbortSignal;
  runtime?: unknown;
  openclawLark?: OpenClawLarkModule;
}

export async function startOpenClawLarkMonitor(input: OpenClawLarkMonitorInput): Promise<void> {
  const module = input.openclawLark ?? (await import('@larksuite/openclaw-lark')) as unknown as OpenClawLarkModule;
  if (module.monitorFeishuProvider === undefined) {
    throw new Error('openclaw-lark monitorFeishuProvider is unavailable');
  }

  await module.monitorFeishuProvider({
    config: input.config,
    accountId: input.accountId,
    abortSignal: input.abortSignal,
    runtime: input.runtime,
  });
}
