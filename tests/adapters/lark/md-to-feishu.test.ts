import assert from 'node:assert/strict';
import test from 'node:test';

import { markdownToFeishuPost } from '../../../src/adapters/lark/md-to-feishu.ts';

test('splits markdown line breaks into separate feishu post rows', () => {
  const post = markdownToFeishuPost('Modified:\n- a\n- b');
  const rows = post.post.zh_cn.content;

  assert.deepEqual(rows, [
    [{ tag: 'md', text: 'Modified:\n- a\n- b' }],
  ]);
});
