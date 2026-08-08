/**
 * Environment readiness for the build step.
 *
 * Aggregates WSL2 state, free disk space (Windows-side and inside the builder
 * distro), and elevation into a single {@link EnvironmentReport} with explicit
 * blockers (must fix before building) and warnings (advisory). Never silently
 * proceeds when a prerequisite is missing.
 */
import { statfs } from 'node:fs/promises';
import { getWslStatus, getDistroFreeBytes, BUILDER_DISTRO } from './wsl.js';
import { isElevated } from './powershell.js';
import type { EnvironmentReport } from '@shared/types.js';

/** Upstream recommends ~20 GB free for the build copy + cache. */
export const RECOMMENDED_FREE_BYTES = 20 * 1000 * 1000 * 1000;

function mapPlatform(p: NodeJS.Platform): EnvironmentReport['platform'] {
  if (p === 'win32' || p === 'linux' || p === 'darwin') return p;
  return 'other';
}

export async function checkEnvironment(workspacePath: string): Promise<EnvironmentReport> {
  const platform = mapPlatform(process.platform);
  const wsl = await getWslStatus();
  const elevated = await isElevated();

  let workspaceFreeBytes: number | null = null;
  try {
    const s = await statfs(workspacePath);
    workspaceFreeBytes = s.bavail * s.bsize;
  } catch {
    workspaceFreeBytes = null;
  }

  let distroFreeBytes: number | null = null;
  if (wsl.builderDistroPresent) {
    distroFreeBytes = await getDistroFreeBytes(BUILDER_DISTRO, '/root');
  }

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (platform !== 'win32') {
    blockers.push(
      'The build step runs the upstream Linux workflow through WSL2 and requires Windows. ' +
        'Image validation and the UI work everywhere, but building/flashing needs a Windows host.',
    );
  } else {
    if (!wsl.installed) {
      blockers.push('WSL2 is not installed. Install it (wsl --install) and reboot, then re-check.');
    } else {
      if (wsl.defaultVersion !== null && wsl.defaultVersion !== 2) {
        warnings.push('WSL default version is not 2. Run `wsl --set-default-version 2`.');
      }
      if (!wsl.builderDistroPresent) {
        blockers.push(
          `The dedicated Arch builder distro "${BUILDER_DISTRO}" is not set up yet. ` +
            'It is required because the upstream workflow uses pacman/readelf on the host; ' +
            'the app provisions it in isolation without touching your other distros.',
        );
      }
    }
  }

  if (workspaceFreeBytes !== null && workspaceFreeBytes < RECOMMENDED_FREE_BYTES) {
    warnings.push(
      `Low free space on the workspace drive (~${(workspaceFreeBytes / 1e9).toFixed(1)} GB). ` +
        'The build needs roughly 20 GB (image copy + cache).',
    );
  }
  if (distroFreeBytes !== null && distroFreeBytes < RECOMMENDED_FREE_BYTES) {
    warnings.push(
      `Low free space inside the builder distro (~${(distroFreeBytes / 1e9).toFixed(1)} GB). ` +
        'Free space or grow the WSL virtual disk.',
    );
  }
  if (platform === 'win32' && !elevated) {
    warnings.push('Not running as Administrator — flashing a USB will require elevation.');
  }

  const ready =
    platform === 'win32' && wsl.installed && wsl.builderDistroPresent && blockers.length === 0;

  return {
    platform,
    wsl,
    workspaceFreeBytes,
    distroFreeBytes,
    elevated,
    ready,
    blockers,
    warnings,
  };
}
