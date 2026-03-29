import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseChannelMessage,
  serializeChannelMessage,
} from '../../src/channel/protocol.ts';

test('serializes and parses a ready status message', () => {
  const encoded = serializeChannelMessage({
    type: 'status',
    state: 'ready',
  });

  assert.equal(encoded, '{"type":"status","state":"ready"}');
  assert.deepEqual(parseChannelMessage(encoded), {
    type: 'status',
    state: 'ready',
  });
});

test('serializes and parses an inbound event message', () => {
  const encoded = serializeChannelMessage({
    type: 'event',
    chatId: 'chat-123',
    messageId: 'message-1',
    text: 'hi',
    senderId: 'user-1',
    timestamp: '2026-03-29T10:00:00.000Z',
  });

  assert.deepEqual(parseChannelMessage(encoded), {
    type: 'event',
    chatId: 'chat-123',
    messageId: 'message-1',
    text: 'hi',
    senderId: 'user-1',
    timestamp: '2026-03-29T10:00:00.000Z',
  });
});

test('serializes and parses an outbound send command', () => {
  const encoded = serializeChannelMessage({
    type: 'send',
    chatId: 'chat-123',
    text: 'reply',
  });

  assert.deepEqual(parseChannelMessage(encoded), {
    type: 'send',
    chatId: 'chat-123',
    text: 'reply',
  });
});

test('rejects malformed protocol payloads', () => {
  assert.throws(() => parseChannelMessage('{"type":"event"}'));
  assert.throws(() => parseChannelMessage('not json'));
});
