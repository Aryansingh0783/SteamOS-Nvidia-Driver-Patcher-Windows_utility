import { describe, it, expect } from 'vitest';
import { buildProvisionSteps, PROVISION_TOOLS, PROVISION_BASH } from '@shared/provision.js';

const paths = {
  distro: 'SteamOS-NVIDIA-Builder',
  seedDistro: 'archlinux',
  exportTarPath: 'C:\\Users\\a\\AppData\\Local\\Temp\\seed.tar',
  installDir: 'C:\\Users\\a\\AppData\\Roaming\\app\\wsl\\builder',
};

describe('buildProvisionSteps', () => {
  it('produces the official install → export → import → cleanup → tools sequence', () => {
    const steps = buildProvisionSteps(paths);
    expect(steps.map((s) => s.args[0])).toEqual([
      '--install',
      '--export',
      '--import',
      '--unregister',
      '-d',
    ]);
  });

  it('only ever invokes wsl.exe (argv, no shell)', () => {
    for (const step of buildProvisionSteps(paths)) {
      expect(step.command).toBe('wsl.exe');
    }
  });

  it('imports the builder distro as WSL 2', () => {
    const importStep = buildProvisionSteps(paths).find((s) => s.args[0] === '--import');
    expect(importStep?.args).toContain('--version');
    expect(importStep?.args).toContain('2');
    expect(importStep?.args).toContain('SteamOS-NVIDIA-Builder');
  });

  it('tolerates failure on the idempotent steps only', () => {
    const steps = buildProvisionSteps(paths);
    const byLabelTolerant = Object.fromEntries(steps.map((s) => [s.args[0], s.tolerateFailure ?? false]));
    expect(byLabelTolerant['--install']).toBe(true);
    expect(byLabelTolerant['--unregister']).toBe(true);
    expect(byLabelTolerant['--export']).toBe(false);
    expect(byLabelTolerant['--import']).toBe(false);
  });

  it('installs every required host tool', () => {
    for (const tool of PROVISION_TOOLS) {
      expect(PROVISION_BASH).toContain(tool);
    }
  });

  it('validates the distro name (rejects injection)', () => {
    expect(() => buildProvisionSteps({ ...paths, distro: 'a; rm -rf /' })).toThrow();
  });
});
