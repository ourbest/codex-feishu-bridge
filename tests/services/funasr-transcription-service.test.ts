import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { PassThrough } from 'node:stream';

import { createFunasrTranscriptionService } from '../../src/services/funasr-transcription-service.ts';

class FakeChildProcess extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();

  kill(): boolean {
    return true;
  }
}

test('spawns the FunASR helper script and parses the transcript output', async () => {
  const child = new FakeChildProcess();
  let spawnCommand: string | null = null;
  let spawnArgs: string[] | null = null;

  const service = createFunasrTranscriptionService({
    pythonExecutable: '/data/best/workspace/.venv-funasr/bin/python',
    scriptPath: '/data/best/lark-agent-bridge/scripts/funasr_transcribe.py',
    model: 'paraformer-zh',
    modelRevision: 'master',
    device: 'cpu',
    timeoutMs: 1000,
    spawnImpl: ((command: string, args: string[]) => {
      spawnCommand = command;
      spawnArgs = args;
      return child as never;
    }) as never,
  });

  const transcribePromise = service.transcribeAudioFile({
    filePath: '/tmp/voice.opus',
    fileName: 'voice.opus',
  });

  child.stdout.end('{"text":"你好，世界"}\n');
  child.emit('close', 0, null);

  const transcript = await transcribePromise;

  assert.equal(spawnCommand, '/data/best/workspace/.venv-funasr/bin/python');
  assert.deepEqual(spawnArgs, [
    '/data/best/lark-agent-bridge/scripts/funasr_transcribe.py',
    '--input',
    '/tmp/voice.opus',
    '--model',
    'paraformer-zh',
    '--device',
    'cpu',
    '--model-revision',
    'master',
  ]);
  assert.equal(transcript, '你好，世界');
});

test('spawns the FunASR helper script with a local model path when provided', async () => {
  const child = new FakeChildProcess();
  let spawnCommand: string | null = null;
  let spawnArgs: string[] | null = null;

  const service = createFunasrTranscriptionService({
    pythonExecutable: '/data/best/workspace/.venv-funasr/bin/python',
    scriptPath: '/data/best/lark-agent-bridge/scripts/funasr_transcribe.py',
    model: 'paraformer-zh',
    modelRevision: 'master',
    modelPath: '/data/best/workspace/.cache/huggingface/hub/models--funasr--paraformer-zh/snapshots/abc123',
    device: 'cpu',
    timeoutMs: 1000,
    spawnImpl: ((command: string, args: string[]) => {
      spawnCommand = command;
      spawnArgs = args;
      return child as never;
    }) as never,
  });

  const transcribePromise = service.transcribeAudioFile({
    filePath: '/tmp/voice.opus',
    fileName: 'voice.opus',
  });

  child.stdout.end('{"text":"本地缓存"}\n');
  child.emit('close', 0, null);

  const transcript = await transcribePromise;

  assert.equal(spawnCommand, '/data/best/workspace/.venv-funasr/bin/python');
  assert.deepEqual(spawnArgs, [
    '/data/best/lark-agent-bridge/scripts/funasr_transcribe.py',
    '--input',
    '/tmp/voice.opus',
    '--model',
    'paraformer-zh',
    '--device',
    'cpu',
    '--model-revision',
    'master',
    '--model-path',
    '/data/best/workspace/.cache/huggingface/hub/models--funasr--paraformer-zh/snapshots/abc123',
  ]);
  assert.equal(transcript, '本地缓存');
});
