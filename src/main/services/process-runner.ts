/**
 * Low-level process runner.
 *
 * The single choke-point through which every external command is executed.
 * Guarantees:
 *   - `shell: false` always — argv is passed literally, never parsed by a shell.
 *   - stdout/stderr are streamed (line callbacks) and also retained up to a
 *     bounded size, so a chatty build never grows memory without limit.
 *   - exit code, wall-clock duration and a `cancelled` flag are always reported.
 *   - cancellation via AbortSignal terminates the child and its tree.
 */
import { spawn } from 'node:child_process';
import type { ProcessResult } from '@shared/types.js';

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  onStdout?: (line: string) => void;
  onStderr?: (line: string) => void;
  /** Max bytes retained per stream in the returned result (default 512 KiB). */
  maxBufferBytes?: number;
}

const DEFAULT_MAX_BUFFER = 512 * 1024;

/** A bounded, line-splitting accumulator. Keeps only the tail once capped. */
class BoundedLineBuffer {
  private buf = '';
  private retained = '';
  private truncated = false;

  constructor(
    private readonly max: number,
    private readonly onLine?: (line: string) => void,
  ) {}

  push(chunk: string): void {
    this.buf += chunk;
    let idx: number;
    while ((idx = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, idx).replace(/\r$/, '');
      this.buf = this.buf.slice(idx + 1);
      this.onLine?.(line);
      this.append(line + '\n');
    }
  }

  private append(s: string): void {
    this.retained += s;
    if (this.retained.length > this.max) {
      this.retained = this.retained.slice(this.retained.length - this.max);
      this.truncated = true;
    }
  }

  finish(): string {
    if (this.buf.length > 0) {
      this.onLine?.(this.buf.replace(/\r$/, ''));
      this.append(this.buf);
      this.buf = '';
    }
    return this.truncated ? `…[output truncated]…\n${this.retained}` : this.retained;
  }
}

export function runProcess(
  command: string,
  args: string[],
  options: RunOptions = {},
): Promise<ProcessResult> {
  const max = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER;
  const start = Date.now();

  return new Promise<ProcessResult>((resolve, reject) => {
    const spawnOpts: Parameters<typeof spawn>[2] = {
      shell: false,
      windowsHide: true,
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.env ? { env: options.env } : {}),
    };
    const child = spawn(command, args, spawnOpts);

    const out = new BoundedLineBuffer(max, options.onStdout);
    const err = new BoundedLineBuffer(max, options.onStderr);
    let cancelled = false;
    let settled = false;

    const timer = options.timeoutMs
      ? setTimeout(() => {
          cancelled = true;
          child.kill('SIGKILL');
        }, options.timeoutMs)
      : null;

    const onAbort = (): void => {
      cancelled = true;
      // Best-effort tree kill; SIGTERM first, the runner's caller may escalate.
      child.kill('SIGTERM');
    };
    if (options.signal) {
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener('abort', onAbort, { once: true });
    }

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (d: string) => out.push(d));
    child.stderr?.on('data', (d: string) => err.push(d));

    const cleanup = (): void => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    };

    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(e);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        command,
        args,
        exitCode: code,
        stdout: out.finish(),
        stderr: err.finish(),
        durationMs: Date.now() - start,
        cancelled,
      });
    });
  });
}

/** Convenience: throw if the process did not exit 0 (and was not cancelled). */
export function assertClean(result: ProcessResult): ProcessResult {
  if (result.cancelled) {
    throw new Error(`Command cancelled: ${result.command} ${result.args.join(' ')}`);
  }
  if (result.exitCode !== 0) {
    const tail = result.stderr.trim().split('\n').slice(-6).join('\n');
    throw new Error(
      `Command failed (exit ${String(result.exitCode)}): ${result.command} ${result.args.join(' ')}\n${tail}`,
    );
  }
  return result;
}
