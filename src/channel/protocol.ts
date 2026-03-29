export type ChannelStatusState = 'ready' | 'reconnecting' | 'stopped';

export interface ChannelStatusMessage {
  type: 'status';
  state: ChannelStatusState;
}

export interface ChannelEventMessage {
  type: 'event';
  chatId: string;
  messageId: string;
  text: string;
  senderId: string;
  timestamp: string;
}

export interface ChannelErrorMessage {
  type: 'error';
  message: string;
}

export interface ChannelSendMessage {
  type: 'send';
  chatId: string;
  text: string;
}

export interface ChannelStopMessage {
  type: 'stop';
}

export type ChannelInboundMessage = ChannelStatusMessage | ChannelEventMessage | ChannelErrorMessage;
export type ChannelOutboundMessage = ChannelSendMessage | ChannelStopMessage;
export type ChannelMessage = ChannelInboundMessage | ChannelOutboundMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid ${fieldName}`);
  }

  return value;
}

export function serializeChannelMessage(message: ChannelMessage): string {
  return JSON.stringify(message);
}

export function parseChannelMessage(line: string): ChannelMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error('Invalid channel message: not valid JSON');
  }

  if (!isRecord(parsed) || typeof parsed.type !== 'string') {
    throw new Error('Invalid channel message: missing type');
  }

  if (parsed.type === 'status') {
    const state = readString(parsed.state, 'state') as ChannelStatusState;
    if (state !== 'ready' && state !== 'reconnecting' && state !== 'stopped') {
      throw new Error(`Invalid state: ${state}`);
    }

    return {
      type: 'status',
      state,
    };
  }

  if (parsed.type === 'event') {
    return {
      type: 'event',
      chatId: readString(parsed.chatId, 'chatId'),
      messageId: readString(parsed.messageId, 'messageId'),
      text: readString(parsed.text, 'text'),
      senderId: readString(parsed.senderId, 'senderId'),
      timestamp: readString(parsed.timestamp, 'timestamp'),
    };
  }

  if (parsed.type === 'error') {
    return {
      type: 'error',
      message: readString(parsed.message, 'message'),
    };
  }

  if (parsed.type === 'send') {
    return {
      type: 'send',
      chatId: readString(parsed.chatId, 'chatId'),
      text: readString(parsed.text, 'text'),
    };
  }

  if (parsed.type === 'stop') {
    return {
      type: 'stop',
    };
  }

  throw new Error(`Unsupported channel message type: ${parsed.type}`);
}
