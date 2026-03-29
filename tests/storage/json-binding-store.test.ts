import assert from 'node:assert/strict';
import test from 'node:test';

import { JsonBindingStore } from '../../src/storage/json-binding-store.ts';

test('persists bindings to a json file and reloads them on startup', async () => {
  const storePath = '/tmp/codex-bridge-binding-store.json';
  const firstStore = new JsonBindingStore(storePath);

  firstStore.setBinding('project-a', 'session-a');
  assert.equal(firstStore.getSessionByProject('project-a'), 'session-a');
  assert.equal(firstStore.getProjectBySession('session-a'), 'project-a');

  const secondStore = new JsonBindingStore(storePath);
  assert.equal(secondStore.getSessionByProject('project-a'), 'session-a');
  assert.equal(secondStore.getProjectBySession('session-a'), 'project-a');
});

test('removes bindings from the persisted json file when unbound', async () => {
  const storePath = '/tmp/codex-bridge-binding-store-remove.json';
  const store = new JsonBindingStore(storePath);

  store.setBinding('project-a', 'session-a');
  store.deleteByProject('project-a');

  const reloadedStore = new JsonBindingStore(storePath);
  assert.equal(reloadedStore.getSessionByProject('project-a'), null);
  assert.equal(reloadedStore.getProjectBySession('session-a'), null);
});
