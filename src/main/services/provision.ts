/**
 * Builder-distro provisioning service (Windows, best-effort).
 *
 * Executes the pure {@link buildProvisionSteps} plan with `wsl.exe`, streaming
 * every command and its output to the log. Uses only the official Arch WSL
 * distribution as its source (shown to the user for transparency/consent).
 * Never validated in CI — on failure the caller surfaces the manual steps.
 */
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runProcess } from './process-runner.js';
import { buildProvisionSteps } from '@shared/provision.js';

export interface ProvisionHooks {
  onLog?: (message: string) => void;
  signal?: AbortSignal;
}

/** Source disclosed to the user before provisioning runs. */
export const PROVISION_SOURCE =
  'Official Arch Linux WSL distribution (installed via `wsl --install -d archlinux`), ' +
  're-imported under a dedicated name. Your other WSL distros are not touched.';

export async function provisionBuilderDistro(
  distro: string,
  workspaceDir: string,
  hooks: ProvisionHooks = {},
): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('WSL provisioning is only available on Windows.');
  }
  const installDir = join(workspaceDir, 'wsl', distro);
  const exportTar = join(tmpdir(), `steamos-arch-seed-${Date.now()}.tar`);
  await mkdir(installDir, { recursive: true });

  const steps = buildProvisionSteps({
    distro,
    seedDistro: 'archlinux',
    exportTarPath: exportTar,
    installDir,
  });

  hooks.onLog?.(`Source: ${PROVISION_SOURCE}`);
  try {
    for (const step of steps) {
      hooks.onLog?.(`[provision] ${step.label} …`);
      const result = await runProcess(step.command, step.args, {
        env: { ...process.env, WSL_UTF8: '1' },
        ...(hooks.signal ? { signal: hooks.signal } : {}),
        onStdout: (l) => hooks.onLog?.(l),
        onStderr: (l) => hooks.onLog?.(l),
        timeoutMs: 30 * 60 * 1000, // installing + a full pacman sync can be slow
      });
      if (result.cancelled) throw new Error('Provisioning cancelled.');
      if (result.exitCode !== 0 && !step.tolerateFailure) {
        const tail = result.stderr.trim().split('\n').slice(-3).join(' ');
        throw new Error(`${step.label} failed (exit ${String(result.exitCode)}). ${tail}`);
      }
    }
  } finally {
    await rm(exportTar, { force: true }).catch(() => undefined);
  }
}
