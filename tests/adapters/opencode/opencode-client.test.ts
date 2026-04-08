import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { OpencodeClient } from '../../../src/adapters/opencode/opencode-client.ts';

function createFakeChildProcess() {
  const emitter = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  stdout.setEncoding('utf8');
  stderr.setEncoding('utf8');

  const proc = {
    stdout,
    stderr,
    kill() {
      emitter.emit('close', 0);
      return true;
    },
    on(event: string, listener: (...args: any[]) => void) {
      emitter.on(event, listener);
      return proc as any;
    },
    emit(event: string, ...args: any[]) {
      emitter.emit(event, ...args);
    },
  } as any;

  return proc;
}

function createSseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

async function tick(ms = 0) {
  await new Promise((r) => setTimeout(r, ms));
}

test('spawns opencode serve with configured hostname/port and env auth', async () => {
  const spawned: Array<{ command: string; args: string[]; cwd?: string; env: Record<string, string> }> = [];
  const proc = createFakeChildProcess();

  const client = new OpencodeClient({
    projectInstanceId: 'repo-a',
    cwd: '/repo-a',
    hostname: '127.0.0.1',
    port: 4101,
    username: 'opencode',
    password: 'secret',
    testing: {
      spawnServe(command, args, options) {
        spawned.push({ command, args, cwd: options.cwd, env: options.env });
        return proc as any;
      },
      fetch: async (input) => {
        const url = String(input);
        if (url.endsWith('/global/health')) {
          return new Response(JSON.stringify({ healthy: true, version: 'test' }), { status: 200 });
        }
        if (url.endsWith('/event')) {
          // keep open but immediately close (no events)
          return createSseResponse([]);
        }
        if (url.endsWith('/session')) {
          return new Response(JSON.stringify({ id: 'sess-1' }), { status: 200 });
        }
        return new Response('not found', { status: 404 });
      },
    },
  });

  await client.startThread({ force: true });

  assert.equal(spawned.length, 1);
  assert.equal(spawned[0]!.command, 'opencode');
  assert.deepEqual(spawned[0]!.args.slice(0, 5), ['serve', '--hostname', '127.0.0.1', '--port', '4101']);
  assert.equal(spawned[0]!.cwd, '/repo-a');
  assert.equal(spawned[0]!.env.OPENCODE_SERVER_PASSWORD, 'secret');
  assert.equal(spawned[0]!.env.OPENCODE_SERVER_USERNAME, 'opencode');
});

test('emits permission.request as onServerRequest and allows approval response to be posted', async () => {
  const proc = createFakeChildProcess();
  const serverRequests: any[] = [];
  const posted: Array<{ url: string; body: any; headers: Record<string, string> }> = [];

  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/global/health')) {
      return new Response(JSON.stringify({ healthy: true, version: 'test' }), { status: 200 });
    }
    if (url.endsWith('/event')) {
      // split into multiple chunks to exercise buffer logic
      return createSseResponse([
        'event: permission.request\n',
        'data: {"id":"perm-1","sessionID":"sess-1","tool":"bash","action":"git status","context":null}\n\n',
      ]);
    }
    if (url.endsWith('/session')) {
      return new Response(JSON.stringify({ id: 'sess-1' }), { status: 200 });
    }
    if (url.includes('/session/sess-1/permissions/perm-1')) {
      const bodyText = typeof init?.body === 'string' ? init.body : '';
      posted.push({
        url,
        body: bodyText ? JSON.parse(bodyText) : null,
        headers: Object.fromEntries(new Headers(init?.headers ?? undefined).entries()),
      });
      return new Response('true', { status: 200 });
    }
    return new Response('not found', { status: 404 });
  };

  const client = new OpencodeClient({
    projectInstanceId: 'repo-a',
    cwd: '/repo-a',
    hostname: '127.0.0.1',
    port: 4101,
    testing: {
      spawnServe() {
        return proc as any;
      },
      fetch: fetchMock,
    },
  });

  client.onServerRequest = async (req) => {
    serverRequests.push(req);
  };

  await client.startThread({ force: true });
  await tick(10);

  assert.equal(serverRequests.length, 1);
  assert.equal(serverRequests[0]!.id, 'perm-1');
  assert.equal(serverRequests[0]!.method, 'item/commandExecution/requestApproval');
  assert.equal(serverRequests[0]!.params.tool, 'bash');
  assert.equal(serverRequests[0]!.params.command, 'git status');
  assert.equal(serverRequests[0]!.params.threadId, 'sess-1');

  await client.respondToServerRequest('perm-1', { decision: 'acceptForSession' });

  assert.equal(posted.length, 1);
  assert.ok(posted[0]!.url.endsWith('/session/sess-1/permissions/perm-1'));
  assert.deepEqual(posted[0]!.body, { response: 'allow', remember: true });
});

