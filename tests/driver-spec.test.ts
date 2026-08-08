import { describe, it, expect } from 'vitest';
import {
  isValidDriverSpec,
  parseDriverSpec,
  driverBranchNumber,
  DRIVER_SPEC_PATTERN,
} from '@shared/driver-spec.js';

describe('isValidDriverSpec', () => {
  it('accepts latest and version prefixes', () => {
    for (const s of ['latest', '580', '580.105.08', '580.105.08-4', '575', '610.43.03']) {
      expect(isValidDriverSpec(s)).toBe(true);
    }
  });
  it('rejects malformed specs', () => {
    for (const s of ['', 'abc', 'v580', '580.', '.580', '580..1', '-4', '580-', 'latest2']) {
      expect(isValidDriverSpec(s)).toBe(false);
    }
  });
  it('mirrors the upstream regex for numeric specs', () => {
    expect(DRIVER_SPEC_PATTERN.test('580.105.08-4')).toBe(true);
    expect(DRIVER_SPEC_PATTERN.test('580..1')).toBe(false);
  });
});

describe('parseDriverSpec', () => {
  it('parses latest', () => {
    expect(parseDriverSpec('latest')).toEqual({
      raw: 'latest',
      isLatest: true,
      branch: null,
      release: null,
      build: null,
    });
  });
  it('parses a bare branch', () => {
    const p = parseDriverSpec('580');
    expect(p).toMatchObject({ isLatest: false, branch: '580', release: null, build: null });
  });
  it('parses a release', () => {
    const p = parseDriverSpec('580.105.08');
    expect(p).toMatchObject({ branch: '580', release: '580.105.08', build: null });
  });
  it('parses an exact build', () => {
    const p = parseDriverSpec('580.105.08-4');
    expect(p).toMatchObject({ branch: '580', release: '580.105.08', build: '580.105.08-4' });
  });
  it('throws on invalid input', () => {
    expect(() => parseDriverSpec('nope')).toThrow(/--driver/);
  });
});

describe('driverBranchNumber', () => {
  it('returns the numeric branch', () => {
    expect(driverBranchNumber(parseDriverSpec('580.105.08'))).toBe(580);
  });
  it('returns null for latest', () => {
    expect(driverBranchNumber(parseDriverSpec('latest'))).toBeNull();
  });
});
