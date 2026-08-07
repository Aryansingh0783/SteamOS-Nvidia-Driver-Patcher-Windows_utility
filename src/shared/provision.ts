/**
 * Builder-distro provisioning plan (pure, unit-tested).
 *
 * Provisioning uses only the **official Arch Linux WSL distribution** (installed
 * via `wsl --install`), then renames it to the app's dedicated distro by
 * export/import so the user's own distros are never touched. Every step is an
 * argv array (no shell string) built here so the sequence can be tested without
 * a Windows host.
 *
 * This is best-effort: WSL's `--install` UX varies by Windows build, and none of
 * it can be validated in CI. The service that runs these steps streams all
 * output and falls back to the manual instructions in TROUBLESHOOTING.md.
 */
import { assertDistroName, assertSafeArg } from './command.js';

export interface ProvisionStep {
  label: string;
  command: string;
  args: string[];
  /** If true, a non-zero exit does not abort the sequence (e.g. already installed). */
  tolerateFailure?: boolean;
}

export interface ProvisionPaths {
  /** Target distro to create (the app's dedicated builder). */
  distro: string;
  /** Official distro to seed from, e.g. `archlinux`. */
  seedDistro: string;
  /** Windows path for the temporary export tarball. */
  exportTarPath: string;
  /** Windows directory the imported distro will live in. */
  installDir: string;
}

/** Host tools the upstream workflow needs inside the builder distro. */
export const PROVISION_TOOLS = [
  'btrfs-progs',
  'rsync',
  'curl',
  'kmod',
  'zstd',
  'python',
  'binutils',
  'util-linux',
] as const;

/** Bash run inside the new distro: refresh keyring, then install the tools. */
export const PROVISION_BASH =
  'set -e; ' +
  'pacman -Sy --noconfirm archlinux-keyring; ' +
  'pacman-key --init; pacman-key --populate archlinux; ' +
  `pacman -Su --noconfirm --needed ${PROVISION_TOOLS.join(' ')}`;

export function buildProvisionSteps(p: ProvisionPaths): ProvisionStep[] {
  assertDistroName(p.distro);
  assertDistroName(p.seedDistro);
  assertSafeArg(p.exportTarPath, 'export tar path');
  assertSafeArg(p.installDir, 'install dir');
  return [
    {
      label: `Install the official ${p.seedDistro} WSL distribution`,
      command: 'wsl.exe',
      args: ['--install', '-d', p.seedDistro, '--no-launch'],
      tolerateFailure: true, // already-installed / different WSL build
    },
    {
      label: 'Export the seed distribution',
      command: 'wsl.exe',
      args: ['--export', p.seedDistro, p.exportTarPath],
    },
    {
      label: `Import it as the dedicated builder distro (${p.distro})`,
      command: 'wsl.exe',
      args: ['--import', p.distro, p.installDir, p.exportTarPath, '--version', '2'],
    },
    {
      label: 'Remove the temporary seed distribution',
      command: 'wsl.exe',
      args: ['--unregister', p.seedDistro],
      tolerateFailure: true,
    },
    {
      label: 'Install the required build tools inside the builder distro',
      command: 'wsl.exe',
      args: ['-d', p.distro, '-u', 'root', '--', 'bash', '-lc', PROVISION_BASH],
    },
  ];
}
