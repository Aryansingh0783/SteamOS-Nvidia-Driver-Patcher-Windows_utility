import { describe, it, expect } from 'vitest';
import { stripAnsi, matchBuildStage, BUILD_STAGES } from '@shared/build-progress.js';

const ESC = String.fromCharCode(27);

describe('stripAnsi', () => {
  it('removes SGR colour sequences', () => {
    const line = `${ESC}[1;35m[nvidia-usb]${ESC}[0m Copying image`;
    expect(stripAnsi(line)).toBe('[nvidia-usb] Copying image');
  });
  it('leaves plain text untouched', () => {
    expect(stripAnsi('plain line')).toBe('plain line');
  });
});

describe('matchBuildStage', () => {
  it('matches known upstream log lines (even with ANSI)', () => {
    const line = `${ESC}[1;35m[nvidia-usb]${ESC}[0m Installing pinned Arch driver packages (compiles the module...)`;
    const stage = matchBuildStage(line);
    expect(stage?.operation).toMatch(/Compiling NVIDIA kernel module/);
  });

  it('maps the copy line to an early fraction', () => {
    expect(matchBuildStage('[nvidia-usb] Copying image → out.img')?.fraction).toBe(0.05);
  });

  it('maps DONE to completion', () => {
    expect(matchBuildStage('DONE — /root/x-nvidia-usbinstall.img')?.fraction).toBe(1.0);
  });

  it('returns null for unrelated lines', () => {
    expect(matchBuildStage('some random noise')).toBeNull();
  });

  it('fractions are within [0,1] and non-decreasing in table order', () => {
    let prev = 0;
    for (const s of BUILD_STAGES) {
      expect(s.fraction).toBeGreaterThanOrEqual(0);
      expect(s.fraction).toBeLessThanOrEqual(1);
      expect(s.fraction).toBeGreaterThanOrEqual(prev);
      prev = s.fraction;
    }
  });
});
