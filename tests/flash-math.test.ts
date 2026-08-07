import { describe, it, expect } from 'vitest';
import { alignUp, SpeedMeter, etaSeconds } from '@shared/flash-math.js';

describe('alignUp', () => {
  it('aligns to sector boundaries', () => {
    expect(alignUp(0, 4096)).toBe(0);
    expect(alignUp(1, 4096)).toBe(4096);
    expect(alignUp(4096, 4096)).toBe(4096);
    expect(alignUp(4097, 4096)).toBe(8192);
    expect(alignUp(512, 512)).toBe(512);
  });
  it('rejects a bad alignment', () => {
    expect(() => alignUp(10, 0)).toThrow();
    expect(() => alignUp(10, 1.5)).toThrow();
  });
});

describe('SpeedMeter', () => {
  it('computes a deterministic rate with injected time', () => {
    const m = new SpeedMeter(1000, 1); // alpha 1 = pure instantaneous
    // 4 MiB after 1 second => ~4 MiB/s
    const rate = m.update(4 * 1024 * 1024, 2000);
    expect(rate).toBeCloseTo(4 * 1024 * 1024, 0);
  });
  it('ignores non-advancing time', () => {
    const m = new SpeedMeter(1000);
    expect(m.update(1000, 1000)).toBe(0);
  });
  it('smooths with EMA over multiple samples', () => {
    const m = new SpeedMeter(0, 0.5);
    m.update(1_000_000, 1000); // 1 MB/s
    const r = m.update(3_000_000, 2000); // instant 2 MB/s, smoothed between
    expect(r).toBeGreaterThan(1_000_000);
    expect(r).toBeLessThan(2_000_000);
  });
});

describe('etaSeconds', () => {
  it('estimates remaining time', () => {
    expect(etaSeconds(1000, 100)).toBe(10);
  });
  it('returns null when not estimable', () => {
    expect(etaSeconds(1000, 0)).toBeNull();
    expect(etaSeconds(-1, 100)).toBeNull();
  });
});
