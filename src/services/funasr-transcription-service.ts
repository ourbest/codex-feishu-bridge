import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

export interface FunasrTranscriptionServiceOptions {
  pythonExecutable: string;
  scriptPath: string;
  model?: string;
  modelPath?: string;
  modelRevision?: string;
  device?: string;
  timeoutMs?: number;
  spawnImpl?: typeof spawn;
}

export interface FunasrTranscriptionInput {
  filePath: string;
  fileName?: string;
}

export interface FunasrTranscriptionService {
  transcribeAudioFile(input: FunasrTranscriptionInput): Promise<string>;
}

function normalizeTranscriptOutput(output: unknown): string {
  if (typeof output === 'string') {
    return output.trim();
  }

  if (Array.isArray(output)) {
    return output
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim();
        }

        if (typeof item === 'object' && item !== null && 'text' in item && typeof (item as { text?: unknown }).text === 'string') {
          return (item as { text: string }).text.trim();
        }

        return '';
      })
      .filter((text) => text !== '')
      .join('\n')
      .trim();
  }

  if (typeof output === 'object' && output !== null) {
    if ('text' in output && typeof (output as { text?: unknown }).text === 'string') {
      return (output as { text: string }).text.trim();
    }

    if ('result' in output) {
      return normalizeTranscriptOutput((output as { result?: unknown }).result);
    }
  }

  return '';
}

function parseTranscriptFromStdout(stdout: string): string {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    try {
      const parsed = JSON.parse(line) as unknown;
      const transcript = normalizeTranscriptOutput(parsed);
      if (transcript !== '') {
        return transcript;
      }
    } catch {
      // Ignore non-JSON lines and continue searching from the end.
    }
  }

  throw new Error(`Could not parse FunASR output as JSON: ${stdout.trim().slice(0, 500)}`);
}

function buildFailureMessage(input: {
  fileName: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
}): string {
  const reason = input.stderr.trim() === '' ? 'no stderr output' : input.stderr.trim().slice(0, 1000);
  return `FunASR transcription failed for ${input.fileName} (exitCode=${input.exitCode ?? 'null'}, signal=${input.signal ?? 'null'}): ${reason}`;
}

export function createFunasrTranscriptionService(options: FunasrTranscriptionServiceOptions): FunasrTranscriptionService {
  const spawnImpl = options.spawnImpl ?? spawn;
  const timeoutMs = options.timeoutMs ?? 120_000;

  return {
    async transcribeAudioFile(input: FunasrTranscriptionInput): Promise<string> {
      const args = [
        options.scriptPath,
        '--input',
        input.filePath,
      ];

      if (options.model !== undefined && options.model.trim() !== '') {
        args.push('--model', options.model);
      }

      args.push('--device', options.device ?? 'cpu');

      if (options.modelRevision !== undefined && options.modelRevision.trim() !== '') {
        args.push('--model-revision', options.modelRevision);
      }

      if (options.modelPath !== undefined && options.modelPath.trim() !== '') {
        args.push('--model-path', options.modelPath);
      }

      return await new Promise<string>((resolve, reject) => {
        const proc: ChildProcessWithoutNullStreams = spawnImpl(options.pythonExecutable, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
          },
        });

        const fileName = input.fileName ?? path.basename(input.filePath);
        let stdout = '';
        let stderr = '';
        let settled = false;

        const finish = (handler: (value: string | Error) => void, value: string | Error): void => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timeoutHandle);
          handler(value);
        };

        const timeoutHandle = setTimeout(() => {
          proc.kill('SIGKILL');
          finish(reject, new Error(`FunASR transcription timed out after ${timeoutMs}ms for ${fileName}`));
        }, timeoutMs);

        proc.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString('utf8');
        });

        proc.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString('utf8');
        });

        proc.once('error', (error) => {
          finish(reject, error);
        });

        proc.once('close', (exitCode, signal) => {
          if (exitCode !== 0) {
            finish(reject, new Error(buildFailureMessage({
              fileName,
              exitCode,
              signal,
              stderr,
            })));
            return;
          }

          try {
            const transcript = parseTranscriptFromStdout(stdout);
            finish(resolve, transcript);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            finish(reject, new Error(`FunASR returned unreadable output for ${fileName}: ${message}`));
          }
        });
      });
    },
  };
}
