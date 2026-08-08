import { describe, it, expect } from 'vitest';
import {
  basename,
  compareVersions,
  isAlreadyPatchedName,
  validateImageFilename,
  validateImageSize,
  validateImageStructure,
  combineIssues,
  validateImageBasics,
  REQUIRED_PARTITIONS,
} from '@shared/image-validation.js';
import type { SteamosImageInfo } from '@shared/types.js';

const GB = 1024 * 1024 * 1024;

describe('helpers', () => {
  it('basename handles both separators', () => {
    expect(basename('C:\\a\\b\\x.img')).toBe('x.img');
    expect(basename('/root/x.img')).toBe('x.img');
  });
  it('compareVersions', () => {
    expect(compareVersions('3.8.10', '3.8.14')).toBe(-1);
    expect(compareVersions('3.8.14', '3.8.10')).toBe(1);
    expect(compareVersions('3.8.10', '3.8.10')).toBe(0);
    expect(compareVersions('3.9', '3.8.14')).toBe(1);
  });
});

describe('isAlreadyPatchedName', () => {
  it('detects the upstream output name', () => {
    expect(isAlreadyPatchedName('steamdeck-recovery-4-nvidia-usbinstall.img')).toBe(true);
    expect(isAlreadyPatchedName('steamdeck-recovery-4.img')).toBe(false);
  });
});

describe('validateImageFilename', () => {
  it('accepts a plain .img', () => {
    expect(validateImageFilename('C:\\d\\steamdeck-recovery-4.img')).toHaveLength(0);
  });
  it('rejects a compressed image', () => {
    const issues = validateImageFilename('steamdeck.img.bz2');
    expect(issues[0].code).toBe('COMPRESSED');
    expect(issues[0].severity).toBe('error');
  });
  it('rejects a wrong extension', () => {
    expect(validateImageFilename('disk.iso')[0].code).toBe('BAD_EXTENSION');
  });
  it('rejects an already-patched image', () => {
    const issues = validateImageFilename('x-nvidia-usbinstall.img');
    expect(issues.some((i) => i.code === 'ALREADY_PATCHED')).toBe(true);
  });
});

describe('validateImageSize', () => {
  it('errors on a tiny file', () => {
    expect(validateImageSize(10 * 1024 * 1024)[0].severity).toBe('error');
  });
  it('warns on a smaller-than-typical image', () => {
    // Between the 512 MB hard-min and the 3 GB soft-min ⇒ warning.
    expect(validateImageSize(2 * GB)[0].severity).toBe('warning');
  });
  it('passes a normal recovery image', () => {
    expect(validateImageSize(8 * GB)).toHaveLength(0);
  });
});

describe('validateImageStructure', () => {
  const good: SteamosImageInfo = {
    path: '/root/x.img',
    sizeBytes: 8 * GB,
    kernelVersion: '6.11.11-valve1-1-neptune-611',
    glibc: '2.41',
    partitions: [...REQUIRED_PARTITIONS],
    steamosVersion: '3.8.12',
    hasRepairDevice: true,
  };

  it('passes a well-formed image', () => {
    expect(combineIssues(validateImageStructure(good)).ok).toBe(true);
  });
  it('errors on missing partitions', () => {
    const bad = { ...good, partitions: ['rootfs-A'] };
    const issues = validateImageStructure(bad);
    expect(issues.some((i) => i.code === 'STRUCTURE_MISSING' && i.severity === 'error')).toBe(true);
  });
  it('errors when no kernel is found', () => {
    const issues = validateImageStructure({ ...good, kernelVersion: null });
    expect(issues.some((i) => i.severity === 'error')).toBe(true);
  });
  it('warns when repair_device.sh is missing', () => {
    const issues = validateImageStructure({ ...good, hasRepairDevice: false });
    expect(issues.some((i) => i.severity === 'warning')).toBe(true);
  });
  it('warns on an untested SteamOS version', () => {
    const issues = validateImageStructure({ ...good, steamosVersion: '3.7.0' });
    expect(issues.some((i) => i.code === 'UNSUPPORTED_VERSION')).toBe(true);
  });
});

describe('validateImageBasics', () => {
  it('is not ok when the name is wrong', () => {
    expect(validateImageBasics('x.iso', 8 * GB).ok).toBe(false);
  });
  it('is ok for a good name + size', () => {
    expect(validateImageBasics('steamdeck-recovery-4.img', 8 * GB).ok).toBe(true);
  });
});
