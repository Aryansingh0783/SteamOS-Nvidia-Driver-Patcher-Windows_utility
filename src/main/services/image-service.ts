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
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { RunOptions } from './process-runner.js';
import { runInDistro, bashScriptArgs } from './wsl.js';
import { buildScriptInvocation, buildScriptArgs } from '@shared/command.js';
import { windowsPathToWslPath } from '@shared/command.js';
import { runProcess } from './process-runner.js';
import { matchBuildStage } from '@shared/build-progress.js';
import type { BuildOptions, ProcessResult, SteamosImageInfo } from '@shared/types.js';
import type { BuildProgress } from '@shared/ipc-contract.js';

/** Derive the upstream output filename: `${img%.img}-nvidia-usbinstall.img`. */
export function deriveOutputPath(inputLinuxPath: string): string {
  return inputLinuxPath.replace(/\.img$/i, '-nvidia-usbinstall.img');
}

/**
 * Copy an image across the WSL boundary. Pre-checks the source and free space
 * with clear, actionable errors, then copies quietly (dd errors are captured and
 * re-surfaced on stderr). $1 = source, $2 = destination.
 */
const COPY_SCRIPT = [
  'set -uo pipefail',
  'SRC="$1"; DEST="$2"',
  'if [ ! -e "$SRC" ]; then',
  '  echo "The image is not visible inside WSL at: $SRC" >&2',
  '  echo "If your .img is not on the C: drive (e.g. on D:, or an external/USB drive), WSL may not auto-mount it. Move the .img into a folder on C: and try again." >&2',
  '  exit 3',
  'fi',
  'if [ ! -r "$SRC" ]; then echo "The image exists but is not readable inside WSL: $SRC" >&2; exit 3; fi',
  'DESTDIR="$(dirname "$DEST")"',
  'mkdir -p "$DESTDIR" || { echo "Could not create the work directory inside WSL: $DESTDIR" >&2; exit 4; }',
  'SIZE="$(stat -c %s "$SRC" 2>/dev/null || echo 0)"',
  'AVAIL="$(df -B1 --output=avail "$DESTDIR" 2>/dev/null | tail -1 | tr -d " ")"',
  'if [ -n "${AVAIL:-}" ] && [ "${SIZE:-0}" -gt 0 ] && [ "$AVAIL" -lt "$SIZE" ]; then',
  '  echo "Not enough space in the WSL disk: the image is $SIZE bytes but only $AVAIL bytes are free. Free space or grow the WSL virtual disk." >&2',
  '  exit 5',
  'fi',
  'if ! dd if="$SRC" of="$DEST" bs=4M conv=fsync status=none 2>/tmp/steamos-dd.err; then',
  '  echo "Copy failed while writing the image into WSL:" >&2',
  '  cat /tmp/steamos-dd.err >&2 2>/dev/null || true',
  '  exit 6',
  'fi',
  'echo "COPIED ${SIZE:-0}"',
].join('\n');

export async function copyImageIntoDistro(
  distro: string,
  srcLinuxPath: string,
  destLinuxPath: string,
  _totalBytes: number,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  onProgress?.(0.1);
  const opts: RunOptions = { ...(signal ? { signal } : {}) };
  const result = await runInDistro(
    distro,
    'root',
    bashScriptArgs(COPY_SCRIPT, [srcLinuxPath, destLinuxPath]),
    opts,
  );
  if (result.cancelled) throw new Error('Image copy cancelled.');
  if (result.exitCode !== 0) {
    const detail =
      result.stderr.trim() ||
      result.stdout.trim().split('\n').slice(-6).join('\n') ||
      `exit code ${String(result.exitCode)}`;
    throw new Error(`Copying the image into the build environment failed: ${detail}`);
  }
  onProgress?.(1);
}

/** Build a `\\host\distro\...` UNC path for a Linux path inside the distro. */
function wslUncPath(host: string, distro: string, linuxPath: string): string {
  const rel = linuxPath.replace(/^\/+/, '').replace(/\//g, '\\');
  return `\\\\${host}\\${distro}\\${rel}`;
}

async function streamCopy(
  src: string,
  dest: string,
  totalBytes: number,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const rs = createReadStream(src, { highWaterMark: 4 * 1024 * 1024 });
  let copied = 0;
  rs.on('data', (chunk: Buffer | string) => {
    copied += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
    if (totalBytes > 0) onProgress?.(Math.min(0.99, copied / totalBytes));
  });
  const ws = createWriteStream(dest);
  await pipeline(rs, ws, signal ? { signal } : {});
}

/**
 * Copy a Windows-side image file into the distro, working for ANY source drive
 * (including drives WSL does not auto-mount, e.g. I:/external/USB). It writes
 * through the distro's 9p share (`\\wsl.localhost\<distro>\...`) from the
 * Windows side — where every drive is readable — instead of relying on
 * `/mnt/<letter>` inside WSL. Falls back to the in-WSL copy (which needs the
 * source drive mounted) if the share is unavailable.
 */
export async function copyWindowsFileIntoDistro(
  distro: string,
  windowsSrcPath: string,
  destLinuxPath: string,
  totalBytes: number,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  // Ensure the distro is running and the destination directory exists.
  const destDir = destLinuxPath.replace(/\/[^/]*$/, '') || '/';
  await runInDistro(distro, 'root', ['mkdir', '-p', destDir]);

  const hosts = ['wsl.localhost', 'wsl$'];
  let lastErr: unknown;
  for (const host of hosts) {
    if (signal?.aborted) throw new Error('Image copy cancelled.');
    const uncDest = wslUncPath(host, distro, destLinuxPath);
    try {
      onProgress?.(0.02);
      await streamCopy(windowsSrcPath, uncDest, totalBytes, onProgress, signal);
      // Verify the distro sees the full file.
      const st = await runInDistro(distro, 'root', ['stat', '-c', '%s', destLinuxPath]);
      const got = Number.parseInt(st.stdout.trim(), 10);
      if (totalBytes > 0 && got !== totalBytes) {
        throw new Error(`size mismatch after copy (expected ${totalBytes}, got ${got})`);
      }
      onProgress?.(1);
      return;
    } catch (err) {
      lastErr = err;
      if (signal?.aborted) throw err instanceof Error ? err : new Error(String(err));
    }
  }

  // Fallback: in-WSL copy (works when the source drive IS mounted, e.g. C:).
  try {
    const srcLinux = windowsPathToWslPath(windowsSrcPath);
    await copyImageIntoDistro(distro, srcLinux, destLinuxPath, totalBytes, onProgress, signal);
    return;
  } catch (fallbackErr) {
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    const fmsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
    throw new Error(
      `Could not copy the image into the build environment. Tried the WSL share ` +
        `(\\\\wsl.localhost\\${distro}): ${msg}. In-WSL fallback: ${fmsg}`,
    );
  }
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
  // Use `python3 -c` (program as an argv), NOT a heredoc: this whole script is
  // executed via `bash -s` from a pipe, and a heredoc body does not reach
  // `python3 -`'s stdin in that mode (python then runs an empty program and
  // prints nothing → "inspection produced no result").
  "python3 -c 'import json,sys; parts=[p for p in sys.argv[1].split() if p]; print(json.dumps({\"partitions\":parts,\"kernelVersion\":sys.argv[2] or None,\"glibc\":sys.argv[3] or None,\"steamosVersion\":sys.argv[4] or None,\"hasRepairDevice\":sys.argv[5]==\"true\"}))' \"$PARTS\" \"$KVER\" \"$GLIBC\" \"$VER\" \"$REPAIR\"",
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
  const result = await runInDistro(distro, 'root', bashScriptArgs(INSPECT_SCRIPT, [linuxImagePath]));
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${String(result.exitCode)}`;
    throw new Error(`Could not inspect the image (loop-mount failed): ${detail}`);
  }
  const jsonLine = result.stdout
    .trim()
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.trim().startsWith('{'));
  if (!jsonLine) {
    const dbg = (result.stdout.trim() || result.stderr.trim() || '(no output)')
      .split('\n')
      .slice(-4)
      .join(' ');
    throw new Error(`Image inspection produced no result. Output: ${dbg}`);
  }
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

  // The packaged .sh can arrive with Windows CRLF line endings (a Windows git
  // checkout converts LF→CRLF), which breaks bash ($'\r': command not found).
  // Copy it into the distro with carriage returns stripped and run that.
  const normalizedScript = `${workdirLinuxPath}/steamos-nvidia-installer.sh`;
  const prep = await runInDistro(
    distro,
    'root',
    bashScriptArgs('DEST="$2"; mkdir -p "${DEST%/*}"; tr -d \'\\r\' < "$1" > "$DEST"; chmod +x "$DEST"', [
      scriptLinuxPath,
      normalizedScript,
    ]),
  );
  if (prep.exitCode !== 0) {
    throw new Error(
      `Could not prepare the build script: ${prep.stderr.trim() || prep.stdout.trim() || `exit ${String(prep.exitCode)}`}`,
    );
  }

  const inv = buildScriptInvocation(distro, normalizedScript, args);
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
