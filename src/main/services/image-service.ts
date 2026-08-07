/**
 * Image service — WSL-side copy-in, read-only inspection, and running the
 * vendored upstream build script.
 *
 * Why copy the image into the distro's ext4 first: the upstream script places
 * its working copy (which it loop-mounts) next to the input image. Loop-mounting
 * a file on the Windows drvfs mount is unreliable, so the input must live on a
 * real Linux filesystem. We therefore copy drvfs → ext4 once (see REPO_ANALYSIS
 * risk R4), then the script produces the output next to it on ext4.
 *
 * The build script itself is run **unmodified**; we only stream and interpret
 * its output.
 */
import type { RunOptions } from './process-runner.js';
import { runInDistro } from './wsl.js';
import { buildScriptInvocation, buildScriptArgs } from '@shared/command.js';
import { runProcess } from './process-runner.js';
import { matchBuildStage } from '@shared/build-progress.js';
import type { BuildOptions, ProcessResult, SteamosImageInfo } from '@shared/types.js';
import type { BuildProgress } from '@shared/ipc-contract.js';

/** Derive the upstream output filename: `${img%.img}-nvidia-usbinstall.img`. */
export function deriveOutputPath(inputLinuxPath: string): string {
  return inputLinuxPath.replace(/\.img$/i, '-nvidia-usbinstall.img');
}

/** Copy the Windows image into the distro with real byte-level progress. */
const COPY_SCRIPT = [
  'set -euo pipefail',
  'mkdir -p "$(dirname "$2")"',
  // tr converts dd's \r progress updates into newline-delimited lines we can parse
  "dd if=\"$1\" of=\"$2\" bs=4M conv=fsync status=progress 2>&1 | tr '\\r' '\\n'",
].join('\n');

export async function copyImageIntoDistro(
  distro: string,
  srcLinuxPath: string,
  destLinuxPath: string,
  totalBytes: number,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const opts: RunOptions = {
    ...(signal ? { signal } : {}),
    onStdout: (line) => {
      const m = /^(\d+)\s+bytes/.exec(line.trim());
      if (m && totalBytes > 0) {
        onProgress?.(Math.min(1, Number.parseInt(m[1], 10) / totalBytes));
      }
    },
  };
  const result = await runInDistro(distro, 'root', ['bash', '-c', COPY_SCRIPT, 'copy', srcLinuxPath, destLinuxPath], opts);
  if (result.cancelled) throw new Error('Image copy cancelled.');
  if (result.exitCode !== 0) {
    throw new Error(`Copying the image into the build environment failed: ${result.stderr.trim()}`);
  }
  onProgress?.(1);
}

/**
 * Read-only reconnaissance of a SteamOS image on a Linux path. Loop-mounts the
 * partitions read-only, reads kernel/glibc/version/partition facts, and cleans
 * up. Never writes to the image. Requires root inside the distro.
 */
const INSPECT_SCRIPT = [
  'set -uo pipefail',
  'IMG="$1"',
  'LOOP=""',
  'MNT="$(mktemp -d)"',
  'HOMEMNT="$(mktemp -d)"',
  'cleanup(){ set +e; mountpoint -q "$MNT" && umount "$MNT"; mountpoint -q "$HOMEMNT" && umount "$HOMEMNT"; [ -n "$LOOP" ] && losetup -d "$LOOP"; rmdir "$MNT" "$HOMEMNT" 2>/dev/null; }',
  'trap cleanup EXIT',
  'LOOP="$(losetup -f --show -P "$IMG")"',
  'PARTS=""; ROOT=""; HOMEP=""',
  'for p in "$LOOP"p*; do',
  '  name="$(blkid -p -s PART_ENTRY_NAME -o value "$p" 2>/dev/null || true)"',
  '  [ -n "$name" ] && PARTS="$PARTS $name"',
  '  case "$name" in rootfs-A) ROOT="$p";; home) HOMEP="$p";; esac',
  'done',
  'KVER=""; GLIBC=""; VER=""; REPAIR=false',
  'if [ -n "$ROOT" ]; then',
  '  mount -o ro "$ROOT" "$MNT" 2>/dev/null || mount -o ro,nologreplay "$ROOT" "$MNT" 2>/dev/null || true',
  '  for d in "$MNT"/usr/lib/modules/*neptune*; do [ -d "$d" ] && KVER="$(basename "$d")" && break; done',
  '  g="$(ls -d "$MNT"/usr/lib/holo/pacmandb/local/glibc-[0-9]* 2>/dev/null | head -1)"',
  '  [ -n "$g" ] && GLIBC="$(basename "$g" | sed -E "s/^glibc-([0-9]+\\.[0-9]+).*/\\1/")"',
  '  [ -f "$MNT/etc/os-release" ] && VER="$(awk -F= \'/^VERSION_ID=/{gsub(/"/,"",$2);print $2}\' "$MNT/etc/os-release")"',
  'fi',
  'if [ -n "$HOMEP" ]; then',
  '  mount -o ro "$HOMEP" "$HOMEMNT" 2>/dev/null || true',
  '  [ -f "$HOMEMNT/deck/tools/repair_device.sh" ] && REPAIR=true',
  'fi',
  'python3 - "$PARTS" "$KVER" "$GLIBC" "$VER" "$REPAIR" <<\'PY\'',
  'import json,sys',
  'parts=[p for p in sys.argv[1].split() if p]',
  'print(json.dumps({"partitions":parts,"kernelVersion":sys.argv[2] or None,"glibc":sys.argv[3] or None,"steamosVersion":sys.argv[4] or None,"hasRepairDevice":sys.argv[5]=="true"}))',
  'PY',
].join('\n');

interface InspectJson {
  partitions: string[];
  kernelVersion: string | null;
  glibc: string | null;
  steamosVersion: string | null;
  hasRepairDevice: boolean;
}

export async function inspectSteamosImage(
  distro: string,
  linuxImagePath: string,
  sizeBytes: number,
): Promise<SteamosImageInfo> {
  const result = await runInDistro(distro, 'root', [
    'bash',
    '-c',
    INSPECT_SCRIPT,
    'inspect',
    linuxImagePath,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`Could not inspect the image (loop-mount failed): ${result.stderr.trim()}`);
  }
  const jsonLine = result.stdout
    .trim()
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.trim().startsWith('{'));
  if (!jsonLine) throw new Error('Image inspection produced no result.');
  const data = JSON.parse(jsonLine) as InspectJson;
  return {
    path: linuxImagePath,
    sizeBytes,
    kernelVersion: data.kernelVersion,
    glibc: data.glibc,
    partitions: data.partitions,
    steamosVersion: data.steamosVersion,
    hasRepairDevice: data.hasRepairDevice,
  };
}

/**
 * Run the vendored upstream script unmodified, streaming its log and mapping
 * lines to progress. Returns the raw process result; the caller checks the exit
 * code and locates the output image.
 */
export async function runBuildScript(
  distro: string,
  scriptLinuxPath: string,
  options: BuildOptions,
  imageLinuxPath: string,
  workdirLinuxPath: string,
  hooks: {
    onLog?: (line: string) => void;
    onProgress?: (p: BuildProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<ProcessResult> {
  const args = buildScriptArgs(options, imageLinuxPath, workdirLinuxPath);
  const inv = buildScriptInvocation(distro, scriptLinuxPath, args);
  const handleLine = (line: string): void => {
    hooks.onLog?.(line);
    const stage = matchBuildStage(line);
    if (stage) {
      hooks.onProgress?.({
        state: 'PATCHING_IMAGE',
        fraction: stage.fraction,
        operation: stage.operation,
      });
    }
  };
  return runProcess(inv.command, inv.args, {
    env: { ...process.env, WSL_UTF8: '1' },
    ...(hooks.signal ? { signal: hooks.signal } : {}),
    onStdout: handleLine,
    onStderr: handleLine,
    maxBufferBytes: 1024 * 1024,
  });
}
