import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveFunasrRuntimeConfig } from '../../src/runtime/funasr-config.ts';

test('resolves a local FunASR snapshot from the HuggingFace cache root', () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'funasr-cache-'));
  const snapshotDir = path.join(
    tempRoot,
    'hub',
    'models--funasr--paraformer-zh',
    'snapshots',
    'abc123',
  );

  mkdirSync(snapshotDir, { recursive: true });
  writeFileSync(path.join(snapshotDir, 'config.yaml'), 'model: Paraformer\n');
  writeFileSync(path.join(snapshotDir, 'model.pt'), '');
  writeFileSync(path.join(snapshotDir, 'tokens.json'), '[]\n');
  writeFileSync(path.join(snapshotDir, 'seg_dict'), '');
  writeFileSync(path.join(snapshotDir, 'am.mvn'), '');

  const config = resolveFunasrRuntimeConfig({
    BRIDGE_FUNASR_PYTHON: '/data/best/workspace/.venv-funasr/bin/python',
    HF_HOME: tempRoot,
  });

  assert.ok(config);
  assert.equal(config?.pythonExecutable, '/data/best/workspace/.venv-funasr/bin/python');
  assert.equal(config?.modelPath, snapshotDir);
  assert.equal(config?.device, 'cpu');
});
