import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface FunasrRuntimeConfig {
  pythonExecutable: string;
  scriptPath: string;
  model?: string;
  modelPath?: string;
  modelRevision?: string;
  device: string;
  timeoutMs: number;
}

export interface FunasrRuntimeEnv {
  BRIDGE_FUNASR_PYTHON?: string;
  BRIDGE_FUNASR_MODEL?: string;
  BRIDGE_FUNASR_MODEL_PATH?: string;
  BRIDGE_FUNASR_MODEL_REVISION?: string;
  BRIDGE_FUNASR_DEVICE?: string;
  BRIDGE_FUNASR_TIMEOUT_MS?: string;
  HF_HOME?: string;
  HUGGINGFACE_HUB_CACHE?: string;
  XDG_CACHE_HOME?: string;
}

function resolveLocalFunasrModelPath(env: FunasrRuntimeEnv): string | null {
  const configured = env.BRIDGE_FUNASR_MODEL_PATH?.trim() ?? '';
  if (configured !== '') {
    return configured;
  }

  const cacheRoots = [
    env.HF_HOME?.trim() ? join(env.HF_HOME.trim(), 'hub') : null,
    env.HUGGINGFACE_HUB_CACHE?.trim(),
    env.XDG_CACHE_HOME?.trim() ? join(env.XDG_CACHE_HOME.trim(), 'huggingface', 'hub') : null,
    join(homedir(), '.cache', 'huggingface', 'hub'),
    '/data/best/workspace/.cache/huggingface/hub',
  ].filter((root): root is string => typeof root === 'string' && root.trim() !== '');

  for (const root of cacheRoots) {
    const modelRoot = join(root, 'models--funasr--paraformer-zh');
    const snapshotsRoot = join(modelRoot, 'snapshots');
    if (!existsSync(snapshotsRoot)) {
      continue;
    }

    const snapshots = readdirSync(snapshotsRoot, { withFileTypes: true });
    for (const entry of snapshots) {
      if (!entry.isDirectory()) {
        continue;
      }

      const snapshotPath = join(snapshotsRoot, entry.name);
      const modelPath = join(snapshotPath, 'model.pt');
      const configPath = join(snapshotPath, 'config.yaml');
      const tokenListPath = join(snapshotPath, 'tokens.json');
      const segDictPath = join(snapshotPath, 'seg_dict');
      const cmvnPath = join(snapshotPath, 'am.mvn');
      if (existsSync(modelPath) && existsSync(configPath) && existsSync(tokenListPath) && existsSync(segDictPath) && existsSync(cmvnPath)) {
        return snapshotPath;
      }
    }
  }

  return null;
}

function parseTimeoutMs(value: string | undefined): number {
  const fallback = 120_000;
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid BRIDGE_FUNASR_TIMEOUT_MS value: ${value}`);
  }

  return Math.floor(parsed);
}

export function resolveFunasrRuntimeConfig(env: FunasrRuntimeEnv = process.env): FunasrRuntimeConfig | null {
  const pythonExecutable = env.BRIDGE_FUNASR_PYTHON?.trim() ?? '';
  const model = env.BRIDGE_FUNASR_MODEL?.trim() ?? '';
  const modelPath = resolveLocalFunasrModelPath(env);
  const modelRevision = env.BRIDGE_FUNASR_MODEL_REVISION?.trim() ?? '';
  const device = env.BRIDGE_FUNASR_DEVICE?.trim() ?? '';
  const timeoutMs = env.BRIDGE_FUNASR_TIMEOUT_MS?.trim() ?? '';

  const anyConfigured = pythonExecutable !== '' || model !== '' || modelPath !== null || modelRevision !== '' || device !== '' || timeoutMs !== '';
  if (!anyConfigured) {
    return null;
  }

  if (pythonExecutable === '') {
    throw new Error('BRIDGE_FUNASR_PYTHON is required when FunASR transcription is enabled');
  }

  if (modelPath === null && model === '') {
    throw new Error('BRIDGE_FUNASR_MODEL or BRIDGE_FUNASR_MODEL_PATH is required when FunASR transcription is enabled');
  }

  return {
    pythonExecutable,
    scriptPath: fileURLToPath(new URL('../../scripts/funasr_transcribe.py', import.meta.url)),
    model: model === '' ? undefined : model,
    modelPath: modelPath ?? undefined,
    modelRevision: modelRevision === '' ? undefined : modelRevision,
    device: device === '' ? 'cpu' : device,
    timeoutMs: parseTimeoutMs(env.BRIDGE_FUNASR_TIMEOUT_MS),
  };
}
