import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonBindingStore } from '../../src/storage/json-binding-store.ts';

describe('JsonBindingStore sessionName', () => {
  const tmpDir = path.join(os.tmpdir(), `bridge-test-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const storeFile = path.join(tmpDir, 'bridge.json');

  it('persists and retrieves sessionName', () => {
    const store = new JsonBindingStore(storeFile);
    store.setBinding('proj_a', 'chat_123');
    store.updateSessionName('chat_123', 'My Group');

    // Re-open from disk
    const reopened = new JsonBindingStore(storeFile);
    const all = reopened.getAllBindings();
    assert.equal(all.length, 1);
    assert.equal((all[0] as any).sessionName, 'My Group');
  });

  it('backward compatibility: reads old snapshot without sessionName', () => {
    // Manually write a snapshot without sessionName
    fs.writeFileSync(storeFile, JSON.stringify({
      bindings: [{ projectInstanceId: 'proj_b', sessionId: 'chat_456' }],
      threadMemories: [],
      projectStates: []
    }));
    const store = new JsonBindingStore(storeFile);
    assert.equal(store.getSessionByProject('proj_b'), 'chat_456');
  });
});
