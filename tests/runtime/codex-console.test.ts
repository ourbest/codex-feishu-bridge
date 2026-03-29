import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { runCodexConsoleSession } from '../../src/runtime/codex-console.ts';

test('prints codex replies for each console line in order', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: string[] = [];
  output.on('data', (chunk) => {
    chunks.push(String(chunk));
  });

  const replies: string[] = [];
  const session = runCodexConsoleSession({
    projectInstanceId: 'project-a',
    cwd: '/Users/yonghui/git/codex-bridge',
    input,
    output,
    client: {
      async generateReply({ text }) {
        replies.push(text);
        return `codex:${text}`;
      },
      async stop() {},
    },
  });

  input.write('hello\n');
  input.write('second\n');
  input.end();

  await session;

  assert.deepEqual(replies, ['hello', 'second']);
  assert.match(chunks.join(''), /connected to codex project project-a/);
  assert.match(chunks.join(''), /codex:hello/);
  assert.match(chunks.join(''), /codex:second/);
});

test('prints codex errors when a reply generation fails', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: string[] = [];
  output.on('data', (chunk) => {
    chunks.push(String(chunk));
  });

  const session = runCodexConsoleSession({
    projectInstanceId: 'project-a',
    cwd: '/Users/yonghui/git/codex-bridge',
    input,
    output,
    client: {
      async generateReply() {
        throw new Error('boom');
      },
      async stop() {},
    },
  });

  input.write('hello\n');
  input.end();

  await session;

  assert.match(chunks.join(''), /codex error> boom/);
});

test('prints the final codex reply when no streamed deltas arrive', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: string[] = [];
  output.on('data', (chunk) => {
    chunks.push(String(chunk));
  });

  const session = runCodexConsoleSession({
    projectInstanceId: 'project-a',
    cwd: '/Users/yonghui/git/codex-bridge',
    input,
    output,
    client: {
      async generateReply() {
        return 'final answer';
      },
      async stop() {},
    },
  });

  input.write('hello\n');
  input.end();

  await session;

  assert.match(chunks.join(''), /codex> final answer/);
});
