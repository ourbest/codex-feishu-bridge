export interface InboundMessage {
  source: 'lark';
  sessionId: string;
  messageId: string;
  text: string;
  senderId: string;
  timestamp: string;
}

export interface OutboundMessage {
  targetSessionId: string;
  text: string;
}

export interface OutboundReaction {
  targetMessageId: string;
  emojiType: string;
}

export interface ProjectReply {
  text: string;
}
