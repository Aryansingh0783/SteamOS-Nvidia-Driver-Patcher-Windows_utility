/**
 * USB / physical-disk parsing and safety assessment.
 *
 * The main process enumerates disks with a fixed PowerShell script that emits a
 * JSON array in the {@link RawDiskJson} shape below. All interpretation and —
 * critically — all safety gating lives here, as pure functions, so the rules
 * that keep the system disk unselectable can be exhaustively unit-tested.
 *
 * Safety invariants enforced here:
 *   - The system/boot disk is NEVER selectable.
 *   - Non-external (internal) disks are excluded by default.
 *   - A disk smaller than the image is not selectable.
 *   - Write-protected disks are not selectable.
 *   - Very large or currently-mounted disks require a second confirmation.
 *   - A device whose identity changed since confirmation must be rejected.
 */
import type { DiskAssessment, DiskBus, DiskDevice } from './types.js';

/** Shape emitted (one per disk) by the enumeration PowerShell script. */
export interface RawDiskJson {
  index: number;
  model?: string | null;
  serial?: string | null;
  sizeBytes?: number | null;
  bus?: string | null;
  removable?: boolean | null;
  isSystem?: boolean | null;
  readOnly?: boolean | null;
  /** PowerShell may serialise a single volume as a bare string. */
  mountedVolumes?: string[] | string | null;
}

/** Disks larger than this are suspicious for a "USB stick" ⇒ extra confirm. */
export const LARGE_DISK_BYTES = 256 * 1024 * 1024 * 1024; // 256 GB

/** README recommends ≥16 GB media. */
export const RECOMMENDED_MIN_USB_BYTES = 16 * 1024 * 1024 * 1024;

export function normalizeBus(bus: string | null | undefined): DiskBus {
  switch ((bus ?? '').trim().toLowerCase()) {
    case 'usb':
      return 'usb';
    case 'sata':
    case 'ata':
      return 'sata';
    case 'nvme':
      return 'nvme';
    case 'scsi':
    case 'sas':
    case 'raid':
      return 'scsi';
    case 'sd':
    case 'mmc':
      return 'sd';
    case 'file backed virtual':
    case 'virtual':
      return 'virtual';
    default:
      return 'unknown';
  }
}

/** Parse one raw record into a strongly-typed {@link DiskDevice}. */
export function parseDisk(raw: RawDiskJson): DiskDevice {
  if (!Number.isInteger(raw.index) || raw.index < 0) {
    throw new Error(`Invalid disk index in enumeration: ${String(raw.index)}`);
  }
  return {
    devicePath: `\\\\.\\PhysicalDrive${raw.index}`,
    index: raw.index,
    model: (raw.model ?? 'Unknown device').trim() || 'Unknown device',
    sizeBytes: typeof raw.sizeBytes === 'number' && raw.sizeBytes > 0 ? raw.sizeBytes : 0,
    bus: normalizeBus(raw.bus),
    removable: raw.removable === true,
    isSystem: raw.isSystem === true,
    serial: raw.serial && raw.serial.trim() ? raw.serial.trim() : null,
    mountedVolumes: Array.isArray(raw.mountedVolumes)
      ? raw.mountedVolumes.filter((v): v is string => typeof v === 'string')
      : typeof raw.mountedVolumes === 'string' && raw.mountedVolumes.trim()
        ? [raw.mountedVolumes.trim()]
        : [],
    readOnly: raw.readOnly === true,
  };
}

/** Parse the full JSON payload (array or single object) from PowerShell. */
export function parseDiskList(json: string): DiskDevice[] {
  const data: unknown = JSON.parse(json);
  const arr: unknown[] = Array.isArray(data) ? data : [data];
  return arr.map((d) => parseDisk(d as RawDiskJson));
}

/** True when a disk is external media (removable, or on the USB bus). */
export function isExternal(device: DiskDevice): boolean {
  return device.removable || device.bus === 'usb';
}

/**
 * Assess a single disk for flashing against a required minimum size (usually
 * the patched image's byte length). The result fully determines whether the UI
 * may offer this disk as a target.
 */
export function assessDisk(device: DiskDevice, requiredBytes: number): DiskAssessment {
  const notes: string[] = [];

  // Highest-priority guard first: the system disk is never a target.
  if (device.isSystem) {
    return {
      device,
      eligibility: 'system-disk',
      selectable: false,
      notes: ['This is the Windows system/boot disk. It can never be selected as a flash target.'],
      requiresExtraConfirmation: false,
    };
  }
  if (device.readOnly) {
    return {
      device,
      eligibility: 'read-only',
      selectable: false,
      notes: ['This disk is write-protected. Remove the lock or choose another disk.'],
      requiresExtraConfirmation: false,
    };
  }
  if (!isExternal(device)) {
    return {
      device,
      eligibility: 'not-removable',
      selectable: false,
      notes: ['Internal (non-removable) disk — excluded by default to protect internal drives.'],
      requiresExtraConfirmation: false,
    };
  }
  if (requiredBytes > 0 && device.sizeBytes < requiredBytes) {
    return {
      device,
      eligibility: 'too-small',
      selectable: false,
      notes: [
        `Disk is ${(device.sizeBytes / 1e9).toFixed(1)} GB but the image needs at least ${(requiredBytes / 1e9).toFixed(1)} GB.`,
      ],
      requiresExtraConfirmation: false,
    };
  }

  if (device.sizeBytes < RECOMMENDED_MIN_USB_BYTES) {
    notes.push('Below the recommended 16 GB — it fits the image but leaves little headroom.');
  }
  let requiresExtra = false;
  if (device.sizeBytes >= LARGE_DISK_BYTES) {
    notes.push('Unusually large for a USB stick — confirm this is not an external hard drive you need.');
    requiresExtra = true;
  }
  if (device.mountedVolumes.length > 0) {
    notes.push(`Currently mounted as ${device.mountedVolumes.join(', ')}. All data will be destroyed.`);
    requiresExtra = true;
  }

  return {
    device,
    eligibility: 'eligible',
    selectable: true,
    notes,
    requiresExtraConfirmation: requiresExtra,
  };
}

export function assessDisks(devices: DiskDevice[], requiredBytes: number): DiskAssessment[] {
  return devices.map((d) => assessDisk(d, requiredBytes));
}

export function selectableDisks(devices: DiskDevice[], requiredBytes: number): DiskDevice[] {
  return assessDisks(devices, requiredBytes)
    .filter((a) => a.selectable)
    .map((a) => a.device);
}

/**
 * Verify that a device still has the identity the user confirmed. Guards the
 * "never continue after the target device changes identity" requirement. All of
 * index, model, size and (when known) serial must still match.
 */
export function deviceIdentityMatches(
  confirmed: Pick<DiskDevice, 'index' | 'model' | 'sizeBytes' | 'serial'>,
  current: DiskDevice,
): boolean {
  if (confirmed.index !== current.index) return false;
  if (confirmed.model !== current.model) return false;
  if (confirmed.sizeBytes !== current.sizeBytes) return false;
  // Serial is the strongest signal when present on both sides.
  if (confirmed.serial !== null && current.serial !== null) {
    return confirmed.serial === current.serial;
  }
  return true;
}
