/**
 * Shared domain types used across main, preload and renderer.
 *
 * Everything in `src/shared` is pure, dependency-free TypeScript so it can be
 * unit-tested in isolation and imported from any process. No Node or Electron
 * APIs are referenced here.
 */

/* ------------------------------------------------------------------ workflow */

/**
 * The workflow state machine states. Ordering is meaningful for progress
 * display but transitions are governed by the table in `workflow.ts`.
 */
export type WorkflowState =
  | 'INITIALIZING'
  | 'CHECKING_ENVIRONMENT'
  | 'SELECTING_IMAGE'
  | 'VALIDATING_IMAGE'
  | 'PREPARING_WORKSPACE'
  | 'PREPARING_WSL'
  | 'INSPECTING_STEAMOS'
  | 'RESOLVING_KERNEL'
  | 'RESOLVING_NVIDIA_PACKAGES'
  | 'PATCHING_IMAGE'
  | 'VALIDATING_PATCH'
  | 'SCANNING_USB'
  | 'USB_SELECTED'
  | 'AWAITING_FLASH_CONFIRMATION'
  | 'FLASHING_USB'
  | 'VERIFYING_USB'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'CLEANING_UP';

/* ------------------------------------------------------------- driver / gpu */

/** Result of parsing a `--driver` specification. */
export interface ParsedDriverSpec {
  /** The raw string as supplied by the user. */
  raw: string;
  /** True when the spec is `latest`. */
  isLatest: boolean;
  /** The major branch (e.g. `580`), or null for `latest`. */
  branch: string | null;
  /** Full release (e.g. `580.105.08`) if the user pinned that far, else null. */
  release: string | null;
  /** Exact build (e.g. `580.105.08-4`) if pinned that far, else null. */
  build: string | null;
}

/** NVIDIA GPU microarchitectures relevant to nvidia-open support. */
export type GpuArchitecture =
  | 'pre-turing'
  | 'turing'
  | 'ampere'
  | 'ada'
  | 'blackwell'
  | 'unknown';

export interface GpuCompatResult {
  /** Whether nvidia-open (open kernel modules) can drive this GPU. */
  supported: boolean;
  architecture: GpuArchitecture;
  /** Human-readable reason, always populated. */
  reason: string;
  /** A caveat the UI should surface even when supported (e.g. hybrid laptop). */
  caveat?: string;
}

/* ---------------------------------------------------------------- image i/o */

export type ImageValidationCode =
  | 'OK'
  | 'NOT_FOUND'
  | 'UNREADABLE'
  | 'BAD_EXTENSION'
  | 'COMPRESSED'
  | 'ALREADY_PATCHED'
  | 'TOO_SMALL'
  | 'STRUCTURE_MISSING'
  | 'UNSUPPORTED_VERSION';

export interface ImageValidationIssue {
  code: ImageValidationCode;
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** Optional actionable hint for the UI. */
  hint?: string;
}

export interface ImageValidationResult {
  ok: boolean;
  issues: ImageValidationIssue[];
}

/** Structural facts discovered by inspecting a SteamOS image (via WSL tools). */
export interface SteamosImageInfo {
  path: string;
  sizeBytes: number;
  /** Kernel version string, e.g. `6.11.11-valve1-1-neptune-611`. */
  kernelVersion: string | null;
  /** Image glibc major.minor, e.g. `2.41`. */
  glibc: string | null;
  /** GPT partition labels found (expect rootfs-A, efi-A, home). */
  partitions: string[];
  /** SteamOS version if detectable from os-release, else null. */
  steamosVersion: string | null;
  /** Whether Valve's repair_device.sh (needed for the one-click installer) is present. */
  hasRepairDevice: boolean;
}

/* ------------------------------------------------------------ build options */

export type UpdateMode = 'selfheal' | 'hold' | 'stock';

/** Mirrors the upstream script's flags 1:1. */
export interface BuildOptions {
  driverSpec: string;
  updateMode: UpdateMode;
  addInstaller: boolean;
  trimCuda: boolean;
  skipSigCheck: boolean;
}

export const DEFAULT_BUILD_OPTIONS: BuildOptions = {
  driverSpec: 'latest',
  updateMode: 'selfheal',
  addInstaller: true,
  trimCuda: false,
  skipSigCheck: false,
};

/* --------------------------------------------------------------- usb / disk */

export type DiskBus = 'usb' | 'sata' | 'nvme' | 'scsi' | 'sd' | 'virtual' | 'unknown';

/**
 * A physical disk as enumerated on Windows. Deliberately identified by more
 * than a drive letter — flashing must never target a letter alone.
 */
export interface DiskDevice {
  /** Windows physical device path, e.g. `\\.\PhysicalDrive2`. */
  devicePath: string;
  /** Physical drive index (2 in the example above). */
  index: number;
  model: string;
  /** Total capacity in bytes. */
  sizeBytes: number;
  bus: DiskBus;
  /** True when Windows reports the media as removable. */
  removable: boolean;
  /** True when this disk hosts the running Windows / system volume. */
  isSystem: boolean;
  /** Serial number if the OS exposed one, else null. */
  serial: string | null;
  /** Mounted volume letters currently backed by this disk. */
  mountedVolumes: string[];
  /** True when the disk (or a volume) is write-protected. */
  readOnly: boolean;
}

export type DiskEligibility =
  | 'eligible'
  | 'system-disk'
  | 'not-removable'
  | 'too-small'
  | 'read-only';

export interface DiskAssessment {
  device: DiskDevice;
  eligibility: DiskEligibility;
  /** True only when eligibility === 'eligible'. */
  selectable: boolean;
  /** Reasons/warnings for the UI. */
  notes: string[];
  /** True when this disk warrants a second confirmation (very large / mounted). */
  requiresExtraConfirmation: boolean;
}

/* --------------------------------------------------------------- flashing */

export interface FlashRequest {
  /** Absolute path to the patched image to write. */
  imagePath: string;
  /** The exact device the user confirmed. */
  device: DiskDevice;
  /** Echo of the identity the user confirmed, re-checked before writing. */
  confirmedModel: string;
  confirmedSizeBytes: number;
  confirmedSerial: string | null;
}

export interface FlashProgress {
  phase: 'dismounting' | 'writing' | 'flushing' | 'verifying' | 'done';
  bytesProcessed: number;
  bytesTotal: number;
  /** Bytes per second, smoothed. */
  speedBps: number;
  /** Estimated seconds remaining, or null if unknown. */
  etaSeconds: number | null;
}

/* --------------------------------------------------------- environment */

export interface WslStatus {
  installed: boolean;
  /** WSL default version (expect 2). */
  defaultVersion: number | null;
  kernelVersion: string | null;
  /** Distros present (names only). */
  distros: string[];
  /** Whether our dedicated builder distro exists. */
  builderDistroPresent: boolean;
}

export interface EnvironmentReport {
  platform: 'win32' | 'linux' | 'darwin' | 'other';
  wsl: WslStatus;
  /** Free bytes on the drive backing the WSL vhdx / workspace. */
  workspaceFreeBytes: number | null;
  /** Free bytes reported inside the builder distro, if present. */
  distroFreeBytes: number | null;
  /** Whether the process is running elevated (Administrator). */
  elevated: boolean;
  /** Aggregate readiness for the build step. */
  ready: boolean;
  /** Blocking problems that must be resolved before building. */
  blockers: string[];
  /** Non-blocking advisories. */
  warnings: string[];
}

/* --------------------------------------------------------------- logging */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  /** Epoch milliseconds. */
  ts: number;
  level: LogLevel;
  /** Subsystem tag, e.g. `wsl`, `flash`, `usb`. */
  source: string;
  message: string;
}

/* --------------------------------------------------------- process results */

export interface ProcessResult {
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** True if the process was cancelled/aborted rather than exiting normally. */
  cancelled: boolean;
}
