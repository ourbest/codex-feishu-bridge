import assert from 'node:assert/strict';
import test from 'node:test';

import { LarkChatInfoService } from '../../src/services/lark-chat-info-service.ts';

const mockClient = {
  im: {
    v1: {
      chat: {
        async get({ path }: { path: { chat_id: string } }) {
          if (path.chat_id === 'chat_group') {
            return { data: { name: 'Dev Team', chat_type: 'group' } };
          }

          if (path.chat_id === 'chat_p2p') {
            return { data: { name: '', chat_type: 'p2p' } };
          }

          throw new Error('not found');
        },
      },
    },
  },
};

test('returns the chat name for a group chat', async () => {
  const service = new LarkChatInfoService(mockClient as any);

  const name = await service.getChatName('chat_group');

  assert.equal(name, 'Dev Team');
});

test('returns [P2P] for a p2p chat', async () => {
  const service = new LarkChatInfoService(mockClient as any);

  const name = await service.getChatName('chat_p2p');

  assert.equal(name, '[P2P]');
});

test('returns null when the chat lookup fails', async () => {
  const service = new LarkChatInfoService(mockClient as any);

  const name = await service.getChatName('chat_missing');

  assert.equal(name, null);
});
