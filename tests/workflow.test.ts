import { describe, it, expect } from 'vitest';
import {
  WORKFLOW_ORDER,
  canTransition,
  assertTransition,
  isTerminal,
  canCancel,
  cancelIsDestructive,
  progressFraction,
} from '@shared/workflow.js';
import type { WorkflowState } from '@shared/types.js';

describe('workflow transitions', () => {
  it('permits the full nominal linear walk', () => {
    for (let i = 0; i < WORKFLOW_ORDER.length - 1; i++) {
      const from = WORKFLOW_ORDER[i];
      const to = WORKFLOW_ORDER[i + 1];
      expect(canTransition(from, to)).toBe(true);
    }
  });

  it('allows every working state to fail or cancel', () => {
    const working: WorkflowState[] = WORKFLOW_ORDER.filter(
      (s) => s !== 'COMPLETED' && s !== 'INITIALIZING',
    );
    for (const s of working) {
      expect(canTransition(s, 'FAILED')).toBe(true);
      expect(canTransition(s, 'CANCELLED')).toBe(true);
    }
  });

  it('rejects an illegal skip and reports the allowed set', () => {
    expect(canTransition('SELECTING_IMAGE', 'FLASHING_USB')).toBe(false);
    expect(() => assertTransition('SELECTING_IMAGE', 'FLASHING_USB')).toThrow(/Illegal workflow transition/);
  });

  it('cannot reach FLASHING_USB except from AWAITING_FLASH_CONFIRMATION', () => {
    const sources = [...WORKFLOW_ORDER, 'FAILED', 'CANCELLED', 'CLEANING_UP'] as WorkflowState[];
    for (const s of sources) {
      if (s === 'AWAITING_FLASH_CONFIRMATION') {
        expect(canTransition(s, 'FLASHING_USB')).toBe(true);
      } else {
        expect(canTransition(s, 'FLASHING_USB')).toBe(false);
      }
    }
  });

  it('marks terminals and cancellability correctly', () => {
    expect(isTerminal('COMPLETED')).toBe(true);
    expect(isTerminal('FAILED')).toBe(true);
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('PATCHING_IMAGE')).toBe(false);

    expect(canCancel('PATCHING_IMAGE')).toBe(true);
    expect(canCancel('FLASHING_USB')).toBe(true);
    expect(canCancel('COMPLETED')).toBe(false);
    expect(canCancel('INITIALIZING')).toBe(false);
  });

  it('flags only mid-write cancellation as destructive', () => {
    expect(cancelIsDestructive('FLASHING_USB')).toBe(true);
    expect(cancelIsDestructive('PATCHING_IMAGE')).toBe(false);
    expect(cancelIsDestructive('VERIFYING_USB')).toBe(false);
  });

  it('reports progress fractions', () => {
    expect(progressFraction('INITIALIZING')).toBe(0);
    expect(progressFraction('COMPLETED')).toBe(1);
    expect(progressFraction('FAILED')).toBe(0);
    const mid = progressFraction('PATCHING_IMAGE');
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});
