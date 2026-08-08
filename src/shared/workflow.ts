/**
 * Workflow state machine.
 *
 * A single source of truth for which state transitions are legal. The
 * orchestrator in the main process must route every state change through
 * {@link assertTransition} / {@link canTransition} so an invalid transition can
 * never be reached — an important safety property for a tool that ends in a
 * destructive disk write.
 */
import type { WorkflowState } from './types.js';

/** All states, in nominal progress order (used for the step rail / progress). */
export const WORKFLOW_ORDER: readonly WorkflowState[] = [
  'INITIALIZING',
  'CHECKING_ENVIRONMENT',
  'SELECTING_IMAGE',
  'VALIDATING_IMAGE',
  'PREPARING_WORKSPACE',
  'PREPARING_WSL',
  'INSPECTING_STEAMOS',
  'RESOLVING_KERNEL',
  'RESOLVING_NVIDIA_PACKAGES',
  'PATCHING_IMAGE',
  'VALIDATING_PATCH',
  'SCANNING_USB',
  'USB_SELECTED',
  'AWAITING_FLASH_CONFIRMATION',
  'FLASHING_USB',
  'VERIFYING_USB',
  'COMPLETED',
];

const TERMINAL: ReadonlySet<WorkflowState> = new Set<WorkflowState>([
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

/**
 * The legal transition table. Any state (except terminals) may move to FAILED
 * or CANCELLED; the working states advance linearly, with a few deliberate
 * back-edges (re-validate an image, re-scan USBs, back out of a confirmation).
 */
const TRANSITIONS: Record<WorkflowState, readonly WorkflowState[]> = {
  INITIALIZING: ['CHECKING_ENVIRONMENT', 'FAILED', 'CANCELLED'],
  CHECKING_ENVIRONMENT: ['CHECKING_ENVIRONMENT', 'SELECTING_IMAGE', 'FAILED', 'CANCELLED'],
  SELECTING_IMAGE: ['VALIDATING_IMAGE', 'CHECKING_ENVIRONMENT', 'FAILED', 'CANCELLED'],
  VALIDATING_IMAGE: ['PREPARING_WORKSPACE', 'SELECTING_IMAGE', 'FAILED', 'CANCELLED'],
  PREPARING_WORKSPACE: ['PREPARING_WSL', 'FAILED', 'CANCELLED'],
  PREPARING_WSL: ['INSPECTING_STEAMOS', 'FAILED', 'CANCELLED'],
  INSPECTING_STEAMOS: ['RESOLVING_KERNEL', 'FAILED', 'CANCELLED'],
  RESOLVING_KERNEL: ['RESOLVING_NVIDIA_PACKAGES', 'FAILED', 'CANCELLED'],
  RESOLVING_NVIDIA_PACKAGES: ['PATCHING_IMAGE', 'FAILED', 'CANCELLED'],
  PATCHING_IMAGE: ['VALIDATING_PATCH', 'FAILED', 'CANCELLED'],
  VALIDATING_PATCH: ['SCANNING_USB', 'FAILED', 'CANCELLED'],
  SCANNING_USB: ['SCANNING_USB', 'USB_SELECTED', 'FAILED', 'CANCELLED'],
  USB_SELECTED: ['SCANNING_USB', 'AWAITING_FLASH_CONFIRMATION', 'FAILED', 'CANCELLED'],
  AWAITING_FLASH_CONFIRMATION: [
    'FLASHING_USB',
    'SCANNING_USB',
    'USB_SELECTED',
    'FAILED',
    'CANCELLED',
  ],
  FLASHING_USB: ['VERIFYING_USB', 'FAILED', 'CANCELLED'],
  VERIFYING_USB: ['COMPLETED', 'FAILED', 'CANCELLED'],
  COMPLETED: ['CLEANING_UP', 'INITIALIZING'],
  FAILED: ['CLEANING_UP', 'INITIALIZING'],
  CANCELLED: ['CLEANING_UP', 'INITIALIZING'],
  CLEANING_UP: ['INITIALIZING', 'FAILED'],
};

/** True when `next` is a legal transition from `from`. */
export function canTransition(from: WorkflowState, next: WorkflowState): boolean {
  return TRANSITIONS[from].includes(next);
}

/** Throws a descriptive error if the transition is illegal; returns `next` otherwise. */
export function assertTransition(from: WorkflowState, next: WorkflowState): WorkflowState {
  if (!canTransition(from, next)) {
    throw new Error(
      `Illegal workflow transition: ${from} -> ${next}. ` +
        `Allowed from ${from}: ${TRANSITIONS[from].join(', ') || '(none)'}`,
    );
  }
  return next;
}

/** Terminal states cannot be left except by cleanup/restart. */
export function isTerminal(state: WorkflowState): boolean {
  return TERMINAL.has(state);
}

/**
 * Whether the user may cancel from this state. Cancellation is allowed in every
 * working state, including FLASHING_USB — but the flash service is responsible
 * for explaining whether stopping mid-write is safe.
 */
export function canCancel(state: WorkflowState): boolean {
  if (isTerminal(state)) return false;
  return state !== 'CLEANING_UP' && state !== 'INITIALIZING';
}

/**
 * Whether cancelling from this state can leave hardware in a partially-written
 * state. Only true once the raw write has begun.
 */
export function cancelIsDestructive(state: WorkflowState): boolean {
  return state === 'FLASHING_USB';
}

/** A 0..1 progress fraction for the given state, for the overall progress bar. */
export function progressFraction(state: WorkflowState): number {
  if (state === 'COMPLETED') return 1;
  if (state === 'FAILED' || state === 'CANCELLED' || state === 'CLEANING_UP') return 0;
  const idx = WORKFLOW_ORDER.indexOf(state);
  if (idx < 0) return 0;
  return idx / (WORKFLOW_ORDER.length - 1);
}
