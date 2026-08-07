import { describe, it, expect } from 'vitest';
import { classifyGpu, assessGpuCompat } from '@shared/gpu-compat.js';

describe('classifyGpu', () => {
  const cases: [string, string][] = [
    ['NVIDIA GeForce RTX 5090', 'blackwell'],
    ['NVIDIA GeForce RTX 5060 Ti', 'blackwell'],
    ['GeForce RTX 4070 SUPER', 'ada'],
    ['RTX 3080', 'ampere'],
    ['NVIDIA GeForce RTX 2060', 'turing'],
    ['NVIDIA TITAN RTX', 'turing'],
    ['GeForce GTX 1660 Ti', 'turing'],
    ['GeForce GTX 1080 Ti', 'pre-turing'],
    ['GeForce GTX 970', 'pre-turing'],
    ['NVIDIA TITAN Xp', 'pre-turing'],
    ['Some Random Adapter', 'unknown'],
  ];
  it.each(cases)('%s -> %s', (name, arch) => {
    expect(classifyGpu(name)).toBe(arch);
  });
});

describe('assessGpuCompat', () => {
  it('supports RTX 20-series and newer', () => {
    for (const n of ['RTX 2060', 'RTX 3070', 'RTX 4090', 'RTX 5080']) {
      expect(assessGpuCompat(n).supported).toBe(true);
    }
  });

  it('flags GTX 16-series as supported-with-caveat', () => {
    const r = assessGpuCompat('GTX 1660');
    expect(r.supported).toBe(true);
    expect(r.caveat).toMatch(/untested|RTX/i);
  });

  it('does NOT support pre-Turing GPUs', () => {
    const r = assessGpuCompat('GTX 1080 Ti');
    expect(r.supported).toBe(false);
    expect(r.reason).toMatch(/Pre-Turing|Pascal/i);
  });

  it('is conservative about unknown GPUs', () => {
    expect(assessGpuCompat('Unknown Card').supported).toBe(false);
  });

  it('adds a hybrid-laptop caveat', () => {
    const r = assessGpuCompat('NVIDIA GeForce RTX 4060 Laptop GPU');
    expect(r.supported).toBe(true);
    expect(r.caveat).toMatch(/hybrid|laptop/i);
  });
});
