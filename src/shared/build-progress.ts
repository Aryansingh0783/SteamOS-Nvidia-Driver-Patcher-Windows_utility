/**
 * Map upstream `log()` lines to a coarse build progress fraction + label.
 *
 * The upstream script prints magenta `[nvidia-usb] …` status lines at each
 * stage. Parsing them gives honest, real progress (driven by the actual build)
 * rather than a fabricated timer. Pure and unit-tested.
 */
export interface BuildStage {
  pattern: RegExp;
  operation: string;
  fraction: number;
}

/** Strip ANSI SGR escape sequences (ESC [ … m) from a line. */
export function stripAnsi(line: string): string {
  // Matches CSI SGR sequences: ESC [ ... m. \x1b is the ESC byte (ASCII source).
  // eslint-disable-next-line no-control-regex
  return line.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Ordered stages; the first matching pattern for a line wins. */
export const BUILD_STAGES: readonly BuildStage[] = [
  { pattern: /Copying image/i, operation: 'Copying working image', fraction: 0.05 },
  { pattern: /Loop device:/i, operation: 'Loop-mounting partitions', fraction: 0.08 },
  { pattern: /Mounting rootfs/i, operation: 'Mounting rootfs / efi / home', fraction: 0.1 },
  { pattern: /Image kernel:/i, operation: 'Detected SteamOS kernel', fraction: 0.12 },
  { pattern: /Headers package:/i, operation: 'Resolved kernel headers', fraction: 0.15 },
  {
    pattern: /Resolving NVIDIA driver packages/i,
    operation: 'Resolving NVIDIA driver packages',
    fraction: 0.2,
  },
  { pattern: /Driver pinned:/i, operation: 'Driver version pinned', fraction: 0.25 },
  { pattern: /Downloading /i, operation: 'Downloading driver packages', fraction: 0.3 },
  {
    pattern: /Checking payload glibc/i,
    operation: 'Verifying glibc compatibility',
    fraction: 0.38,
  },
  {
    pattern: /Setting up overlay build chroot/i,
    operation: 'Preparing build chroot',
    fraction: 0.42,
  },
  {
    pattern: /Installing pinned Arch driver packages/i,
    operation: 'Compiling NVIDIA kernel module (DKMS)',
    fraction: 0.55,
  },
  { pattern: /Built nvidia-open/i, operation: 'Kernel module built', fraction: 0.72 },
  {
    pattern: /Copying driver payload into the image/i,
    operation: 'Installing driver into image',
    fraction: 0.8,
  },
  { pattern: /Running depmod/i, operation: 'Running depmod / ldconfig', fraction: 0.85 },
  {
    pattern: /Appending to kernel cmdline/i,
    operation: 'Configuring bootloader cmdline',
    fraction: 0.88,
  },
  {
    pattern: /(self-healing|Holding OS updates|disk-picker wrapper)/i,
    operation: 'Applying update strategy / installer',
    fraction: 0.92,
  },
  { pattern: /Sanity checks/i, operation: 'Running sanity checks', fraction: 0.95 },
  { pattern: /Syncing filesystems/i, operation: 'Flushing filesystems', fraction: 0.97 },
  { pattern: /DONE/i, operation: 'Build complete', fraction: 1.0 },
];

/** Return the stage a log line indicates, or null if it matches none. */
export function matchBuildStage(line: string): BuildStage | null {
  const clean = stripAnsi(line);
  for (const stage of BUILD_STAGES) {
    if (stage.pattern.test(clean)) return stage;
  }
  return null;
}
