/**
 * Safe command construction.
 *
 * Security posture (see SECURITY.md):
 *   - Nothing is ever assembled into a shell string from untrusted input.
 *   - Every external process is launched with an **argv array** and `shell:false`,
 *     so no cmd.exe / /bin/sh parsing happens and there is no injection surface.
 *   - The few places that must hand a value to a Linux shell (`bash -c`) go
 *     through {@link posixSingleQuote}.
 *   - All arguments are validated: NUL and other control characters are rejected.
 *
 * This module is pure and has no Node dependencies so it can be unit-tested.
 */
import type { BuildOptions } from './types.js';
import { isValidDriverSpec } from './driver-spec.js';

/** A validated command ready to hand to a process runner. */
export interface Invocation {
  command: string;
  args: string[];
}

/**
 * Reject control characters that could split or smuggle arguments.
 * Implemented with codepoint checks (not a regex with literal control chars)
 * so the source itself stays plain ASCII.
 */
export function assertSafeArg(value: string, label = 'argument'): string {
  if (typeof value !== 'string') {
    throw new Error(`Unsafe ${label}: not a string`);
  }
  // Reject NUL and C0/DEL control characters. Tab (9), LF (10) and CR (13) are
  // permitted: within an argv array (shell:false) they cannot split or smuggle
  // an argument, and trusted multi-line scripts pass through here.
  const ALLOWED = new Set([9, 10, 13]);
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if ((code < 0x20 && !ALLOWED.has(code)) || code === 0x7f) {
      throw new Error(`Unsafe ${label}: contains a control character`);
    }
  }
  return value;
}

/**
 * Quote a string for safe inclusion inside a POSIX `bash -c '...'` command.
 * Single-quoting neutralises every shell metacharacter; embedded single quotes
 * are closed, escaped and reopened (`'\''`).
 */
export function posixSingleQuote(value: string): string {
  assertSafeArg(value, 'shell value');
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Translate a Windows path to the WSL `/mnt/<drive>/...` form.
 * Only drive-letter paths are accepted; UNC paths are rejected because they do
 * not have a stable, safe WSL mapping for our use.
 */
export function windowsPathToWslPath(winPath: string): string {
  assertSafeArg(winPath, 'path');
  const normalized = winPath.replace(/\\/g, '/');
  if (normalized.startsWith('//')) {
    throw new Error('UNC paths are not supported; use a local drive path.');
  }
  const m = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  if (!m) {
    throw new Error(`Not an absolute Windows drive path: ${winPath}`);
  }
  const drive = m[1].toLowerCase();
  const rest = m[2];
  return `/mnt/${drive}/${rest}`;
}

/** WSL distro names: letters, digits, dot, dash, underscore, space. */
const DISTRO_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/;

export function assertDistroName(name: string): string {
  if (!DISTRO_NAME_RE.test(name)) {
    throw new Error(`Invalid WSL distro name: ${JSON.stringify(name)}`);
  }
  return name;
}

/** A Windows physical-drive index must be a small non-negative integer. */
export function assertDiskIndex(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index > 4096) {
    throw new Error(`Invalid physical disk index: ${String(index)}`);
  }
  return index;
}

/**
 * Build the argument list passed to the upstream Bash script (the part after
 * `bash <script>`), mapping {@link BuildOptions} to the exact upstream flags.
 * The image path is the final positional argument.
 */
export function buildScriptArgs(
  opts: BuildOptions,
  imageLinuxPath: string,
  workdirLinuxPath?: string,
): string[] {
  if (!isValidDriverSpec(opts.driverSpec)) {
    throw new Error(
      "--driver takes 'latest' or a version prefix like 580 / 580.105.08 / 580.105.08-4",
    );
  }
  assertSafeArg(imageLinuxPath, 'image path');
  const args: string[] = ['--driver', opts.driverSpec];

  switch (opts.updateMode) {
    case 'hold':
      args.push('--hold-updates');
      break;
    case 'stock':
      args.push('--no-hold-updates');
      break;
    case 'selfheal':
      // upstream default — no flag
      break;
  }
  if (!opts.addInstaller) args.push('--no-installer');
  if (opts.trimCuda) args.push('--trim-cuda');
  if (opts.skipSigCheck) args.push('--skip-sigcheck');
  if (workdirLinuxPath) {
    assertSafeArg(workdirLinuxPath, 'workdir');
    args.push('--workdir', workdirLinuxPath);
  }
  args.push(imageLinuxPath);
  return args;
}

/**
 * Build a `wsl.exe` invocation that runs a program inside a named distro as a
 * given user, passing `innerArgs` literally (argv, no shell).
 */
export function buildWslInvocation(distro: string, user: string, innerArgs: string[]): Invocation {
  assertDistroName(distro);
  assertSafeArg(user, 'user');
  const args = [
    '-d',
    distro,
    '-u',
    user,
    '--',
    ...innerArgs.map((a) => assertSafeArg(a, 'wsl arg')),
  ];
  return { command: 'wsl.exe', args };
}

/** Convenience: run the vendored build script inside the distro as root. */
export function buildScriptInvocation(
  distro: string,
  scriptLinuxPath: string,
  scriptArgs: string[],
): Invocation {
  assertSafeArg(scriptLinuxPath, 'script path');
  return buildWslInvocation(distro, 'root', ['bash', scriptLinuxPath, ...scriptArgs]);
}
