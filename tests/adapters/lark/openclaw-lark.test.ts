import assert from 'node:assert/strict';
import test from 'node:test';

import { sendOutboundViaOpenClawLark } from '../../../src/adapters/lark/openclaw-lark.ts';

test('maps outbound bridge messages to openclaw lark sendMessageFeishu params', async () => {
  const calls: Array<Record<string, unknown>> = [];

  await sendOutboundViaOpenClawLark({
    config: { openclaw: true },
    accountId: 'account-a',
    message: {
      targetSessionId: 'session-a',
      text: 'reply:hello',
    },
    openclawLark: {
      async sendMessageFeishu(params) {
        calls.push(params);
        return { messageId: 'message-1', chatId: 'session-a' };
      },
    },
  });

  assert.deepEqual(calls, [
    {
      cfg: { openclaw: true },
      to: 'session-a',
      text: 'reply:hello',
      accountId: 'account-a',
    },
  ]);
});
