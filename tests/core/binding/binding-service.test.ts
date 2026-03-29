import assert from 'node:assert/strict';
import test from 'node:test';

import { BindingService } from '../../../src/core/binding/binding-service.ts';
import { InMemoryBindingStore } from '../../../src/storage/binding-store.ts';

test('binds a project instance to a session', async () => {
  const service = new BindingService(new InMemoryBindingStore());

  await service.bindProjectToSession('project-a', 'session-a');

  assert.equal(await service.getSessionByProject('project-a'), 'session-a');
  assert.equal(await service.getProjectBySession('session-a'), 'project-a');
});

test('replaces an existing project binding when rebinding', async () => {
  const service = new BindingService(new InMemoryBindingStore());

  await service.bindProjectToSession('project-a', 'session-a');
  await service.bindProjectToSession('project-a', 'session-b');

  assert.equal(await service.getSessionByProject('project-a'), 'session-b');
  assert.equal(await service.getProjectBySession('session-a'), null);
  assert.equal(await service.getProjectBySession('session-b'), 'project-a');
});

test('detaches a session from its project when the session is rebound', async () => {
  const service = new BindingService(new InMemoryBindingStore());

  await service.bindProjectToSession('project-a', 'session-a');
  await service.bindProjectToSession('project-b', 'session-a');

  assert.equal(await service.getSessionByProject('project-a'), null);
  assert.equal(await service.getSessionByProject('project-b'), 'session-a');
  assert.equal(await service.getProjectBySession('session-a'), 'project-b');
});

test('unbinds a project instance from its session', async () => {
  const service = new BindingService(new InMemoryBindingStore());

  await service.bindProjectToSession('project-a', 'session-a');
  await service.unbindProject('project-a');

  assert.equal(await service.getSessionByProject('project-a'), null);
  assert.equal(await service.getProjectBySession('session-a'), null);
});
