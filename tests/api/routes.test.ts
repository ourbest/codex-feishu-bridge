import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';

import { createApiRequestHandler } from '../../src/api/routes.ts';
import { BindingService } from '../../src/core/binding/binding-service.ts';
import { InMemoryBindingStore } from '../../src/storage/binding-store.ts';

type ResponseState = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

function createResponseMock() {
  const state: ResponseState = {
    statusCode: 200,
    headers: {},
    body: '',
  };

  const response: Record<string, unknown> = {
    state,
    setHeader(name: string, value: string) {
      state.headers[name.toLowerCase()] = value;
    },
    end(chunk?: string) {
      if (typeof chunk === 'string') {
        state.body = chunk;
      }
    },
  };

  Object.defineProperty(response, 'statusCode', {
    get() {
      return state.statusCode;
    },
    set(value: number) {
      state.statusCode = value;
    },
    enumerable: true,
    configurable: true,
  });

  return response;
}

async function invoke(
  handler: ReturnType<typeof createApiRequestHandler>,
  method: string,
  pathname: string,
  body?: object,
) {
  const request = Readable.from([body === undefined ? '' : JSON.stringify(body)]) as any;
  request.method = method;
  request.url = pathname;

  const response = createResponseMock();
  await handler(request, response as any);

  return response.state;
}

test('binds a project instance and returns the session lookup', async () => {
  const handler = createApiRequestHandler({
    bindingService: new BindingService(new InMemoryBindingStore()),
  });

  const bindResponse = await invoke(handler, 'POST', '/bindings', {
    projectInstanceId: 'project-a',
    sessionId: 'session-a',
  });
  assert.equal(bindResponse.statusCode, 200);

  const lookupResponse = await invoke(handler, 'GET', '/bindings/project/project-a');
  assert.equal(lookupResponse.statusCode, 200);
  assert.deepEqual(JSON.parse(lookupResponse.body), {
    projectInstanceId: 'project-a',
    sessionId: 'session-a',
  });
});

test('unbinds a project instance and clears its lookup', async () => {
  const handler = createApiRequestHandler({
    bindingService: new BindingService(new InMemoryBindingStore()),
  });

  await invoke(handler, 'POST', '/bindings', {
    projectInstanceId: 'project-a',
    sessionId: 'session-a',
  });

  const response = await invoke(handler, 'DELETE', '/bindings/project/project-a');
  assert.equal(response.statusCode, 204);

  const lookup = await invoke(handler, 'GET', '/bindings/project/project-a');
  assert.equal(lookup.statusCode, 404);
});

test('returns the project lookup for a bound session', async () => {
  const handler = createApiRequestHandler({
    bindingService: new BindingService(new InMemoryBindingStore()),
  });

  await invoke(handler, 'POST', '/bindings', {
    projectInstanceId: 'project-a',
    sessionId: 'session-a',
  });

  const lookup = await invoke(handler, 'GET', '/bindings/session/session-a');
  assert.equal(lookup.statusCode, 200);
  assert.deepEqual(JSON.parse(lookup.body), {
    projectInstanceId: 'project-a',
    sessionId: 'session-a',
  });
});
