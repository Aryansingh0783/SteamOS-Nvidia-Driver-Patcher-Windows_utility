import { motion } from 'framer-motion';
import type { WorkflowState } from '@shared/types.js';

interface Phase {
  id: string;
  label: string;
  states: WorkflowState[];
}

const PHASES: Phase[] = [
  { id: 'env', label: 'Environment', states: ['INITIALIZING', 'CHECKING_ENVIRONMENT'] },
  { id: 'image', label: 'Image', states: ['SELECTING_IMAGE', 'VALIDATING_IMAGE'] },
  {
    id: 'build',
    label: 'Build',
    states: [
      'PREPARING_WORKSPACE',
      'PREPARING_WSL',
      'INSPECTING_STEAMOS',
      'RESOLVING_KERNEL',
      'RESOLVING_NVIDIA_PACKAGES',
      'PATCHING_IMAGE',
      'VALIDATING_PATCH',
    ],
  },
  {
    id: 'usb',
    label: 'USB',
    states: ['SCANNING_USB', 'USB_SELECTED', 'AWAITING_FLASH_CONFIRMATION'],
  },
  { id: 'flash', label: 'Flash', states: ['FLASHING_USB', 'VERIFYING_USB'] },
  { id: 'done', label: 'Done', states: ['COMPLETED'] },
];

function phaseIndexFor(state: WorkflowState): number {
  const idx = PHASES.findIndex((p) => p.states.includes(state));
  return idx;
}

export function StepRail({ state }: { state: WorkflowState }): JSX.Element {
  const active = phaseIndexFor(state);
  const failed = state === 'FAILED' || state === 'CANCELLED';

  return (
    <div
      className="mono"
      style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
      role="list"
      aria-label="Workflow progress"
    >
      {PHASES.map((phase, i) => {
        const isActive = i === active;
        const isDone = active >= 0 && i < active;
        return (
          <div
            key={phase.id}
            role="listitem"
            style={{ position: 'relative', padding: '6px 12px', borderRadius: 999 }}
          >
            {isActive && !failed && (
              <motion.span
                layoutId="phase-pill"
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 999,
                  background: 'rgb(var(--accent) / 0.18)',
                  border: '1px solid rgb(var(--accent) / 0.5)',
                }}
              />
            )}
            <span
              style={{
                position: 'relative',
                fontSize: 11,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: isActive
                  ? 'rgb(var(--accent))'
                  : isDone
                    ? 'rgb(var(--foreground))'
                    : 'rgb(var(--subtle))',
              }}
            >
              {isDone ? '✓ ' : ''}
              {phase.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
