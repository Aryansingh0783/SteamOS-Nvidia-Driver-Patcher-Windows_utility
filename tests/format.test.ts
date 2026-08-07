import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  formatSpeed,
  formatEta,
  formatDuration,
  formatPercent,
} from '@shared/format.js';

describe('formatBytes', () => {
  it('formats decimal units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1500)).toBe('1.5 KB');
    expect(formatBytes(8_000_000_000)).toBe('8.0 GB');
  });
  it('handles invalid input', () => {
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
  });
});

describe('formatSpeed', () => {
  it('appends /s', () => {
    expect(formatSpeed(42_000_000)).toBe('42.0 MB/s');
    expect(formatSpeed(0)).toBe('0 B/s');
  });
});

describe('formatEta', () => {
  it('formats durations', () => {
    expect(formatEta(null)).toBe('—');
    expect(formatEta(45)).toBe('45s');
    expect(formatEta(200)).toBe('3m 20s');
    expect(formatEta(180)).toBe('3m');
    expect(formatEta(3660)).toBe('1h 1m');
    expect(formatEta(3600)).toBe('1h');
  });
  it('handles negatives', () => {
    expect(formatEta(-1)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('formats ms and seconds', () => {
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(65_000)).toBe('1m 5s');
  });
});

describe('formatPercent', () => {
  it('clamps and formats', () => {
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(1.4)).toBe('100%');
    expect(formatPercent(-1)).toBe('0%');
    expect(formatPercent(0.1234, 1)).toBe('12.3%');
  });
});
