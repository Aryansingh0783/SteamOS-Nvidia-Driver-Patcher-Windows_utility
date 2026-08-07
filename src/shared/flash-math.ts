/**
 * Pure math for the flasher: sector alignment, a smoothed speed meter, and ETA.
 * Extracted so the timing/alignment logic can be unit-tested without any I/O.
 */

/** Round `n` up to the next multiple of `alignment` (a power of two ≥ 1). */
export function alignUp(n: number, alignment: number): number {
  if (alignment <= 0 || !Number.isInteger(alignment)) {
    throw new Error(`alignment must be a positive integer, got ${alignment}`);
  }
  return Math.ceil(n / alignment) * alignment;
}

/** Exponential-moving-average byte-rate meter. Deterministic via injected time. */
export class SpeedMeter {
  private lastBytes = 0;
  private lastTs: number;
  private ema = 0;

  constructor(
    startTs: number = Date.now(),
    private readonly alpha = 0.3,
  ) {
    this.lastTs = startTs;
  }

  /** Feed the cumulative byte count; returns the smoothed bytes/second. */
  update(totalBytes: number, now: number = Date.now()): number {
    const dtSeconds = (now - this.lastTs) / 1000;
    if (dtSeconds <= 0) return this.ema;
    const instant = (totalBytes - this.lastBytes) / dtSeconds;
    this.ema = this.ema === 0 ? instant : this.alpha * instant + (1 - this.alpha) * this.ema;
    this.lastBytes = totalBytes;
    this.lastTs = now;
    return this.ema;
  }

  get value(): number {
    return this.ema;
  }
}

/** Seconds to move `bytesRemaining` at `speedBps`, or null if not estimable. */
export function etaSeconds(bytesRemaining: number, speedBps: number): number | null {
  if (speedBps <= 0 || bytesRemaining < 0) return null;
  return bytesRemaining / speedBps;
}
