/**
 * Raw USB flashing + verification (Windows).
 *
 * This is the one stage with **no upstream equivalent** — the upstream project
 * tells the user to `dd` the image themselves. It is implemented for real (no
 * simulation, progress is driven by actual bytes written) but, as documented in
 * TESTING.md, it has NOT been validated on physical hardware in this build
 * environment. Nothing here fakes success.
 *
 * Pipeline:
 *   1. Re-verify the target's identity hasn't changed since the user confirmed.
 *   2. Take the disk offline (dismounts volumes) and clear read-only.
 *   3. Stream the image to `\\.\PhysicalDriveN` in sector-aligned chunks.
 *   4. fsync to flush.
 *   5. Read the written region back and compare against the source.
 *   6. Bring the disk back online.
 */
import { open, stat } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { setDiskOffline, getDisk } from './usb-service.js';
import { isWindows } from './powershell.js';
import { alignUp, SpeedMeter, etaSeconds } from '@shared/flash-math.js';
import { deviceIdentityMatches } from '@shared/usb.js';
import type { FlashProgress, FlashRequest } from '@shared/types.js';

const SECTOR = 4096;
const CHUNK = 4 * 1024 * 1024; // 4 MiB, a multiple of the sector size

export interface FlashHooks {
  onProgress?: (p: FlashProgress) => void;
  onLog?: (message: string) => void;
  signal?: AbortSignal;
}

export class FlashCancelledError extends Error {
  constructor() {
    super('Flash cancelled');
    this.name = 'FlashCancelledError';
  }
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new FlashCancelledError();
}

/**
 * Flash `request.imagePath` onto `request.device`. Throws on any failure; on
 * cancellation throws {@link FlashCancelledError} after attempting to bring the
 * disk back online. The caller (orchestrator) maps outcomes to workflow states.
 */
export async function flashImage(request: FlashRequest, hooks: FlashHooks = {}): Promise<void> {
  if (!isWindows()) {
    throw new Error('Flashing is only supported on Windows.');
  }
  const { device } = request;
  const log = (m: string): void => hooks.onLog?.(m);

  // 1. Identity re-check — never continue if the target changed.
  const current = await getDisk(device.index);
  if (!current) {
    throw new Error(`Target disk ${device.devicePath} is no longer present. Aborting for safety.`);
  }
  if (
    !deviceIdentityMatches(
      {
        index: request.device.index,
        model: request.confirmedModel,
        sizeBytes: request.confirmedSizeBytes,
        serial: request.confirmedSerial,
      },
      current,
    )
  ) {
    throw new Error(
      'The selected USB has changed identity since you confirmed it (model/size/serial differ). ' +
        'Aborting before any write. Re-scan and re-confirm the target.',
    );
  }
  if (current.isSystem) {
    // Defence in depth: this should be impossible to reach.
    throw new Error('Refusing to write to the system disk.');
  }

  const imgStat = await stat(request.imagePath);
  const total = imgStat.size;
  if (current.sizeBytes > 0 && total > current.sizeBytes) {
    throw new Error(
      `Image (${total} bytes) is larger than the target disk (${current.sizeBytes} bytes).`,
    );
  }

  log(`Preparing ${device.devicePath} (${device.model}) — taking offline and dismounting volumes.`);
  hooks.onProgress?.({ phase: 'dismounting', bytesProcessed: 0, bytesTotal: total, speedBps: 0, etaSeconds: null });
  await setDiskOffline(device.index, true);

  let broughtOffline = true;
  try {
    checkAbort(hooks.signal);
    await writeAndVerify(request.imagePath, device.devicePath, total, hooks);
    log('Flash complete and verified. Bringing disk back online.');
    await setDiskOffline(device.index, false);
    broughtOffline = false;
    hooks.onProgress?.({ phase: 'done', bytesProcessed: total, bytesTotal: total, speedBps: 0, etaSeconds: 0 });
  } catch (err) {
    // Always try to bring the disk back online so Windows can see it again.
    if (broughtOffline) {
      try {
        await setDiskOffline(device.index, false);
      } catch {
        log('WARNING: could not bring the disk back online automatically.');
      }
    }
    if (err instanceof FlashCancelledError) {
      log(
        'Flash was cancelled mid-write. The USB is now PARTIALLY WRITTEN and not bootable — ' +
          're-flash it before use.',
      );
    }
    throw err;
  }
}

async function writeAndVerify(
  imagePath: string,
  devicePath: string,
  total: number,
  hooks: FlashHooks,
): Promise<void> {
  const src = await open(imagePath, 'r');
  // O_RDWR so we can read the region back for verification on the same handle.
  const dst = await open(devicePath, fsConstants.O_RDWR);
  const buf = Buffer.allocUnsafe(CHUNK);
  const meter = new SpeedMeter();

  try {
    // ---- write phase ----
    let offset = 0;
    while (offset < total) {
      checkAbort(hooks.signal);
      const want = Math.min(CHUNK, total - offset);
      const { bytesRead } = await src.read(buf, 0, want, offset);
      if (bytesRead === 0) break;
      // Raw device writes must be sector-aligned in length.
      const writeLen = alignUp(bytesRead, SECTOR);
      if (writeLen > bytesRead) buf.fill(0, bytesRead, writeLen);
      await dst.write(buf, 0, writeLen, offset);
      offset += bytesRead;

      const speed = meter.update(offset);
      hooks.onProgress?.({
        phase: 'writing',
        bytesProcessed: offset,
        bytesTotal: total,
        speedBps: speed,
        etaSeconds: etaSeconds(total - offset, speed),
      });
    }

    // ---- flush phase ----
    hooks.onProgress?.({ phase: 'flushing', bytesProcessed: total, bytesTotal: total, speedBps: 0, etaSeconds: null });
    await dst.sync();

    // ---- verify phase ----
    await verify(src, dst, total, hooks);
  } finally {
    await src.close().catch(() => undefined);
    await dst.close().catch(() => undefined);
  }
}

async function verify(
  src: Awaited<ReturnType<typeof open>>,
  dst: Awaited<ReturnType<typeof open>>,
  total: number,
  hooks: FlashHooks,
): Promise<void> {
  const a = Buffer.allocUnsafe(CHUNK);
  const b = Buffer.allocUnsafe(CHUNK);
  const meter = new SpeedMeter();
  let offset = 0;
  while (offset < total) {
    checkAbort(hooks.signal);
    const want = Math.min(CHUNK, total - offset);
    const readLen = alignUp(want, SECTOR);
    const [rs, rd] = await Promise.all([
      src.read(a, 0, want, offset),
      dst.read(b, 0, readLen, offset),
    ]);
    if (rs.bytesRead === 0) break;
    if (Buffer.compare(a.subarray(0, want), b.subarray(0, want)) !== 0) {
      throw new Error(
        `Verification failed at byte ${offset}: the USB does not match the image. ` +
          'The write may have been interrupted or the media may be faulty.',
      );
    }
    offset += rs.bytesRead;
    void rd;
    const speed = meter.update(offset);
    hooks.onProgress?.({
      phase: 'verifying',
      bytesProcessed: offset,
      bytesTotal: total,
      speedBps: speed,
      etaSeconds: etaSeconds(total - offset, speed),
    });
  }
}
