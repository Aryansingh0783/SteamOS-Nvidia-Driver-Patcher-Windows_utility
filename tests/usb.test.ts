import { describe, it, expect } from 'vitest';
import {
  parseDisk,
  parseDiskList,
  assessDisk,
  assessDisks,
  selectableDisks,
  deviceIdentityMatches,
  isExternal,
  LARGE_DISK_BYTES,
  RECOMMENDED_MIN_USB_BYTES,
  type RawDiskJson,
} from '@shared/usb.js';
import type { DiskDevice } from '@shared/types.js';

const GB = 1_000_000_000;

function raw(over: Partial<RawDiskJson> = {}): RawDiskJson {
  return {
    index: 2,
    model: 'SanDisk Ultra USB',
    serial: 'ABC123',
    sizeBytes: 32 * GB,
    bus: 'USB',
    removable: true,
    isSystem: false,
    readOnly: false,
    mountedVolumes: ['E:'],
    ...over,
  };
}

describe('parseDisk / parseDiskList', () => {
  it('builds the physical device path from the index', () => {
    const d = parseDisk(raw({ index: 3 }));
    expect(d.devicePath).toBe('\\\\.\\PhysicalDrive3');
    expect(d.index).toBe(3);
  });

  it('rejects an invalid index', () => {
    expect(() => parseDisk(raw({ index: -1 }))).toThrow();
    expect(() => parseDisk({ index: 1.5 } as RawDiskJson)).toThrow();
  });

  it('parses a JSON array', () => {
    const list = parseDiskList(JSON.stringify([raw({ index: 0 }), raw({ index: 1 })]));
    expect(list).toHaveLength(2);
    expect(list[0].index).toBe(0);
  });

  it('parses a single (non-array) object', () => {
    const list = parseDiskList(JSON.stringify(raw({ index: 4 })));
    expect(list).toHaveLength(1);
    expect(list[0].index).toBe(4);
  });

  it('coerces a single mounted-volume string into an array (PowerShell quirk)', () => {
    const d = parseDisk(raw({ mountedVolumes: 'E:' }));
    expect(d.mountedVolumes).toEqual(['E:']);
  });

  it('defaults a missing model and empty serial', () => {
    const d = parseDisk({ index: 0, model: '   ', serial: '', sizeBytes: 0 } as RawDiskJson);
    expect(d.model).toBe('Unknown device');
    expect(d.serial).toBeNull();
    expect(d.sizeBytes).toBe(0);
  });
});

describe('isExternal', () => {
  it('treats USB-bus fixed media (e.g. USB SSD) as external', () => {
    const d = parseDisk(raw({ removable: false, bus: 'USB' }));
    expect(isExternal(d)).toBe(true);
  });
  it('treats internal SATA as not external', () => {
    const d = parseDisk(raw({ removable: false, bus: 'SATA' }));
    expect(isExternal(d)).toBe(false);
  });
});

describe('assessDisk — safety gating', () => {
  it('NEVER makes the system disk selectable, even if removable and large', () => {
    const d = parseDisk(raw({ isSystem: true, sizeBytes: 32 * GB, removable: true }));
    const a = assessDisk(d, 8 * GB);
    expect(a.selectable).toBe(false);
    expect(a.eligibility).toBe('system-disk');
  });

  it('excludes internal (non-removable) disks by default', () => {
    const d = parseDisk(raw({ removable: false, bus: 'SATA' }));
    expect(assessDisk(d, 8 * GB).eligibility).toBe('not-removable');
  });

  it('rejects a write-protected disk', () => {
    const d = parseDisk(raw({ readOnly: true }));
    expect(assessDisk(d, 8 * GB).eligibility).toBe('read-only');
  });

  it('rejects a disk smaller than the image', () => {
    const d = parseDisk(raw({ sizeBytes: 4 * GB }));
    const a = assessDisk(d, 8 * GB);
    expect(a.eligibility).toBe('too-small');
    expect(a.selectable).toBe(false);
  });

  it('accepts an eligible removable disk', () => {
    const d = parseDisk(raw({ sizeBytes: 32 * GB, mountedVolumes: [] }));
    const a = assessDisk(d, 8 * GB);
    expect(a.selectable).toBe(true);
    expect(a.eligibility).toBe('eligible');
  });

  it('requires extra confirmation for a very large disk', () => {
    const d = parseDisk(raw({ sizeBytes: LARGE_DISK_BYTES + GB, mountedVolumes: [] }));
    const a = assessDisk(d, 8 * GB);
    expect(a.selectable).toBe(true);
    expect(a.requiresExtraConfirmation).toBe(true);
  });

  it('requires extra confirmation when volumes are mounted', () => {
    const d = parseDisk(raw({ sizeBytes: 32 * GB, mountedVolumes: ['E:', 'F:'] }));
    expect(assessDisk(d, 8 * GB).requiresExtraConfirmation).toBe(true);
  });

  it('warns below the recommended 16 GB but still allows it', () => {
    const d = parseDisk(raw({ sizeBytes: RECOMMENDED_MIN_USB_BYTES - GB, mountedVolumes: [] }));
    const a = assessDisk(d, 8 * GB);
    expect(a.selectable).toBe(true);
    expect(a.notes.join(' ')).toMatch(/recommended/i);
  });
});

describe('assessDisks / selectableDisks', () => {
  it('only returns eligible disks as selectable', () => {
    const devices = parseDiskList(
      JSON.stringify([
        raw({ index: 0, isSystem: true }), // system
        raw({ index: 1, removable: false, bus: 'SATA' }), // internal
        raw({ index: 2, sizeBytes: 32 * GB, mountedVolumes: [] }), // ok
      ]),
    );
    expect(assessDisks(devices, 8 * GB)).toHaveLength(3);
    const ok = selectableDisks(devices, 8 * GB);
    expect(ok).toHaveLength(1);
    expect(ok[0].index).toBe(2);
  });
});

describe('deviceIdentityMatches — anti-swap guard', () => {
  const base: Pick<DiskDevice, 'index' | 'model' | 'sizeBytes' | 'serial'> = {
    index: 2,
    model: 'SanDisk Ultra USB',
    sizeBytes: 32 * GB,
    serial: 'ABC123',
  };

  it('matches identical identity', () => {
    expect(deviceIdentityMatches(base, parseDisk(raw()))).toBe(true);
  });

  it('rejects a changed serial (the drive was swapped)', () => {
    expect(deviceIdentityMatches(base, parseDisk(raw({ serial: 'DIFFERENT' })))).toBe(false);
  });

  it('rejects a changed size', () => {
    expect(deviceIdentityMatches(base, parseDisk(raw({ sizeBytes: 16 * GB })))).toBe(false);
  });

  it('rejects a changed index', () => {
    expect(deviceIdentityMatches(base, parseDisk(raw({ index: 3 })))).toBe(false);
  });

  it('falls back to index/model/size when a serial is unavailable', () => {
    const noSerial = { ...base, serial: null };
    expect(deviceIdentityMatches(noSerial, parseDisk(raw({ serial: null })))).toBe(true);
  });
});
