import { describe, it, expect } from 'vitest';
import {
  assertSafeArg,
  posixSingleQuote,
  windowsPathToWslPath,
  assertDistroName,
  assertDiskIndex,
  buildScriptArgs,
  buildWslInvocation,
  buildScriptInvocation,
} from '@shared/command.js';
import type { BuildOptions } from '@shared/types.js';

describe('assertSafeArg', () => {
  it('accepts normal paths, spaces and dashes', () => {
    expect(assertSafeArg('/mnt/c/Users/A B/steamdeck-recovery.img')).toContain('steamdeck');
    expect(assertSafeArg('--driver')).toBe('--driver');
  });
  it('permits tab/newline/CR (safe inside argv arrays)', () => {
    expect(() => assertSafeArg('line1\nline2\t x')).not.toThrow();
  });
  it('rejects NUL and other control characters', () => {
    expect(() => assertSafeArg('a\u0000b')).toThrow();
    expect(() => assertSafeArg('a\u0007b')).toThrow();
    expect(() => assertSafeArg('a\u007fb')).toThrow();
  });
});

describe('posixSingleQuote', () => {
  it('wraps in single quotes', () => {
    expect(posixSingleQuote('/tmp/x.img')).toBe("'/tmp/x.img'");
  });
  it('escapes embedded single quotes', () => {
    expect(posixSingleQuote("a'b")).toBe("'a'\\''b'");
  });
  it('neutralises shell metacharacters (they stay literal inside quotes)', () => {
    expect(posixSingleQuote('$(rm -rf /); `id`')).toBe("'$(rm -rf /); `id`'");
  });
});

describe('windowsPathToWslPath', () => {
  it('translates a drive path', () => {
    expect(windowsPathToWslPath('C:\\Users\\a\\x.img')).toBe('/mnt/c/Users/a/x.img');
  });
  it('lowercases the drive letter and accepts forward slashes', () => {
    expect(windowsPathToWslPath('D:/games/x.img')).toBe('/mnt/d/games/x.img');
  });
  it('rejects UNC paths', () => {
    expect(() => windowsPathToWslPath('\\\\server\\share\\x.img')).toThrow(/UNC/);
  });
  it('rejects non-absolute paths', () => {
    expect(() => windowsPathToWslPath('x.img')).toThrow();
  });
});

describe('assertDistroName / assertDiskIndex', () => {
  it('accepts sane distro names', () => {
    expect(assertDistroName('SteamOS-NVIDIA-Builder')).toBeTruthy();
  });
  it('rejects distro names with metacharacters', () => {
    expect(() => assertDistroName('a; rm -rf /')).toThrow();
    expect(() => assertDistroName('')).toThrow();
  });
  it('validates disk index range', () => {
    expect(assertDiskIndex(0)).toBe(0);
    expect(() => assertDiskIndex(-1)).toThrow();
    expect(() => assertDiskIndex(1.2)).toThrow();
    expect(() => assertDiskIndex(99999)).toThrow();
  });
});

describe('buildScriptArgs — maps options to upstream flags', () => {
  const base: BuildOptions = {
    driverSpec: 'latest',
    updateMode: 'selfheal',
    addInstaller: true,
    trimCuda: false,
    skipSigCheck: false,
  };

  it('default selfheal emits no update flag and puts the image last', () => {
    const args = buildScriptArgs(base, '/root/x.img');
    expect(args).toEqual(['--driver', 'latest', '/root/x.img']);
  });

  it('maps hold/stock/installer/trim/sig flags', () => {
    const args = buildScriptArgs(
      { driverSpec: '580', updateMode: 'hold', addInstaller: false, trimCuda: true, skipSigCheck: true },
      '/root/x.img',
      '/root/work',
    );
    expect(args).toEqual([
      '--driver',
      '580',
      '--hold-updates',
      '--no-installer',
      '--trim-cuda',
      '--skip-sigcheck',
      '--workdir',
      '/root/work',
      '/root/x.img',
    ]);
  });

  it('emits --no-hold-updates for stock mode', () => {
    const args = buildScriptArgs({ ...base, updateMode: 'stock' }, '/root/x.img');
    expect(args).toContain('--no-hold-updates');
  });

  it('rejects an invalid driver spec before building', () => {
    expect(() => buildScriptArgs({ ...base, driverSpec: 'not-a-version' }, '/root/x.img')).toThrow();
  });
});

describe('buildWslInvocation / buildScriptInvocation', () => {
  it('produces an argv array for wsl.exe (no shell string)', () => {
    const inv = buildWslInvocation('SteamOS-NVIDIA-Builder', 'root', ['ls', '-la']);
    expect(inv.command).toBe('wsl.exe');
    expect(inv.args).toEqual(['-d', 'SteamOS-NVIDIA-Builder', '-u', 'root', '--', 'ls', '-la']);
  });

  it('builds a script invocation that runs bash with the script + args', () => {
    const inv = buildScriptInvocation('SteamOS-NVIDIA-Builder', '/mnt/c/app/script.sh', [
      '--driver',
      'latest',
      '/root/x.img',
    ]);
    expect(inv.args).toEqual([
      '-d',
      'SteamOS-NVIDIA-Builder',
      '-u',
      'root',
      '--',
      'bash',
      '/mnt/c/app/script.sh',
      '--driver',
      'latest',
      '/root/x.img',
    ]);
  });

  it('rejects an unsafe inner argument', () => {
    expect(() => buildWslInvocation('d', 'root', ['ok', 'bad\u0000arg'])).toThrow();
  });
});
