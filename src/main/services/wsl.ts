/**
 * WSL2 orchestration.
 *
 * The upstream workflow is Arch-specific and needs root, loop devices, btrfs and
 * overlayfs. On Windows the only non-reimplementing path is a controlled WSL2
 * Linux environment. This app uses a **dedicated** distro it owns
 * ({@link BUILDER_DISTRO}) so the user's other WSL distros are never touched.
 *
 * All WSL commands run with `WSL_UTF8=1` so stdout is UTF-8 (WSL otherwise emits
 * UTF-16LE, which would corrupt our parsing) and are built as argv arrays.
 */
import { runProcess, type RunOptions } from './process-runner.js';
import { buildWslInvocation, assertDistroName } from '@shared/command.js';
import type { ProcessResult, WslStatus } from '@shared/types.js';

/** The distro this app provisions and controls. Never a user's own distro. */
export const BUILDER_DISTRO = 'SteamOS-NVIDIA-Builder';

/** Linux tools the upstream script requires on the host (script line 120). */
export const REQUIRED_LINUX_TOOLS = [
  'losetup',
  'blkid',
  'btrfs',
  'rsync',
  'curl',
  'depmod',
  'zstd',
  'pacman',
  'python3',
  'readelf',
] as const;

const wslEnv = (): NodeJS.ProcessEnv => ({ ...process.env, WSL_UTF8: '1' });

function isWindows(): boolean {
  return process.platform === 'win32';
}

/** Run `wsl.exe` with the given raw arguments (argv, UTF-8 output). */
export function runWsl(args: string[], options: RunOptions = {}): Promise<ProcessResult> {
  return runProcess('wsl.exe', args, { ...options, env: wslEnv() });
}

/**
 * Build argv that runs a (possibly multi-line) bash script inside the distro
 * WITHOUT exposing its newlines to wsl.exe's argument parser — the outer
 * command is a single line that base64-decodes the real script and runs it with
 * `scriptArgs` as $1, $2, …. Newlines/quotes in a script argument can be
 * mangled when relayed through wsl.exe, so everything non-trivial goes through
 * here.
 */
export function bashScriptArgs(scriptText: string, scriptArgs: string[] = []): string[] {
  const b64 = Buffer.from(scriptText, 'utf8').toString('base64');
  return [
    'bash',
    '-c',
    'printf %s "$1" | base64 -d | bash -s -- "${@:2}"',
    'steamos',
    b64,
    ...scriptArgs,
  ];
}

/** Run a program inside a distro as a user (argv, no shell). */
export function runInDistro(
  distro: string,
  user: string,
  innerArgs: string[],
  options: RunOptions = {},
): Promise<ProcessResult> {
  const inv = buildWslInvocation(distro, user, innerArgs);
  return runProcess(inv.command, inv.args, { ...options, env: wslEnv() });
}

/**
 * Detect WSL installation state and distros. On non-Windows returns a
 * not-installed status (the app blocks the build step with a clear reason).
 */
export async function getWslStatus(): Promise<WslStatus> {
  const empty: WslStatus = {
    installed: false,
    defaultVersion: null,
    kernelVersion: null,
    distros: [],
    builderDistroPresent: false,
  };
  if (!isWindows()) return empty;

  let installed = false;
  let defaultVersion: number | null = null;
  let kernelVersion: string | null = null;
  try {
    const status = await runWsl(['--status']);
    installed = status.exitCode === 0;
    const dv = /Default Version:\s*(\d+)/i.exec(status.stdout);
    if (dv) defaultVersion = Number.parseInt(dv[1], 10);
    const version = await runWsl(['--version']);
    const kv = /Kernel version:\s*([\d.]+)/i.exec(version.stdout);
    if (kv) kernelVersion = kv[1];
  } catch {
    return empty;
  }

  const distros = await listDistros();
  return {
    installed,
    defaultVersion,
    kernelVersion,
    distros,
    builderDistroPresent: distros.includes(BUILDER_DISTRO),
  };
}

/** List installed distro names (quiet form, one per line). */
export async function listDistros(): Promise<string[]> {
  if (!isWindows()) return [];
  try {
    const r = await runWsl(['-l', '-q']);
    return r.stdout
      .split(/\r?\n/)
      .map((s) => s.replace(/\0/g, '').trim())
      .filter((s) => s.length > 0);
  } catch {
    return [];
  }
}

export async function distroExists(distro: string): Promise<boolean> {
  assertDistroName(distro);
  return (await listDistros()).includes(distro);
}

/** Free bytes on a path inside the distro (via `df -B1`). */
export async function getDistroFreeBytes(distro: string, path: string): Promise<number | null> {
  try {
    const r = await runInDistro(distro, 'root', ['df', '-B1', '--output=avail', path]);
    const lines = r.stdout.trim().split(/\r?\n/);
    const n = Number.parseInt((lines[lines.length - 1] ?? '').trim(), 10);
    return Number.isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

export interface CapabilityProbe {
  missingTools: string[];
  loopPartitionSupport: boolean;
  overlayfsSupport: boolean;
  btrfsSupport: boolean;
  notes: string[];
}

/**
 * Probe the builder distro for the capabilities the upstream script needs, so
 * the app can report a precise blocker instead of failing 15 minutes into a
 * build. Never mutates the distro.
 */
export async function probeCapabilities(distro: string): Promise<CapabilityProbe> {
  const notes: string[] = [];
  const missingTools: string[] = [];
  for (const tool of REQUIRED_LINUX_TOOLS) {
    const r = await runInDistro(distro, 'root', ['bash', '-lc', `command -v ${tool} >/dev/null`]);
    if (r.exitCode !== 0) missingTools.push(tool);
  }

  const loop = await runInDistro(distro, 'root', [
    'bash',
    '-lc',
    'test -e /dev/loop-control && grep -q . /sys/module/loop/parameters/max_part 2>/dev/null && echo yes || echo no',
  ]);
  const loopPartitionSupport = loop.stdout.trim().endsWith('yes');
  if (!loopPartitionSupport) {
    notes.push('Loop-device partition scanning may be unavailable in this WSL kernel (needs loop max_part).');
  }

  const overlay = await runInDistro(distro, 'root', [
    'bash',
    '-lc',
    'grep -qw overlay /proc/filesystems && echo yes || echo no',
  ]);
  const overlayfsSupport = overlay.stdout.trim().endsWith('yes');

  const btrfs = await runInDistro(distro, 'root', [
    'bash',
    '-lc',
    'grep -qw btrfs /proc/filesystems && echo yes || modprobe btrfs 2>/dev/null && echo yes || echo no',
  ]);
  const btrfsSupport = btrfs.stdout.trim().endsWith('yes');

  return { missingTools, loopPartitionSupport, overlayfsSupport, btrfsSupport, notes };
}
