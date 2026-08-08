import { formatBytes, formatSpeed, formatEta, formatPercent } from '@shared/format.js';
import { progressFraction } from '@shared/workflow.js';
import type { WorkflowState } from '@shared/types.js';
import { useStore } from '../lib/store.js';
import { Panel, Meter } from './ui.js';
import { MagneticButton } from './motion/MagneticButton.js';

const BUILD_STATES: WorkflowState[] = [
  'PREPARING_WORKSPACE',
  'PREPARING_WSL',
  'INSPECTING_STEAMOS',
  'RESOLVING_KERNEL',
  'RESOLVING_NVIDIA_PACKAGES',
  'PATCHING_IMAGE',
  'VALIDATING_PATCH',
];
const PRE_BUILD: WorkflowState[] = [
  'INITIALIZING',
  'CHECKING_ENVIRONMENT',
  'SELECTING_IMAGE',
  'VALIDATING_IMAGE',
];

export function ProgressPanel(): JSX.Element {
  const snapshot = useStore((s) => s.snapshot);
  const buildProgress = useStore((s) => s.buildProgress);
  const flashProgress = useStore((s) => s.flashProgress);
  const startBuild = useStore((s) => s.startBuild);
  const cancelBuild = useStore((s) => s.cancelBuild);
  const cancelFlash = useStore((s) => s.cancelFlash);

  const state = snapshot?.state ?? 'INITIALIZING';
  const env = snapshot?.environment ?? null;
  const image = snapshot?.image ?? null;
  const imageOk = snapshot?.imageValidation?.ok ?? (image !== null);

  const isBuilding = BUILD_STATES.includes(state);
  const isFlashing = state === 'FLASHING_USB' || state === 'VERIFYING_USB';
  const canBuild = PRE_BUILD.includes(state) && !!env?.ready && !!image && imageOk;

  const buildReasonBlocked =
    !env?.ready
      ? 'Environment is not ready (see panel 01).'
      : !image
        ? 'Select a SteamOS image (panel 02).'
        : !imageOk
          ? 'The selected image failed validation.'
          : '';

  return (
    <Panel label="Action" title="Create NVIDIA SteamOS USB">
      {(PRE_BUILD.includes(state) || state === 'FAILED' || state === 'CANCELLED') && (
        <>
          <MagneticButton
            className="btn-primary"
            disabled={!canBuild}
            onClick={() => void startBuild()}
          >
            ▶ Build NVIDIA Installer
          </MagneticButton>
          {!canBuild && buildReasonBlocked && (
            <p style={{ margin: '10px 0 0', fontSize: 12, color: 'rgb(var(--subtle))' }}>
              {buildReasonBlocked}
            </p>
          )}
        </>
      )}

      {isBuilding && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="mono" style={{ fontSize: 13, color: 'rgb(var(--accent))' }}>
              {buildProgress?.operation ?? snapshot?.operation ?? 'Working…'}
            </span>
            <span className="mono" style={{ fontSize: 13 }}>
              {formatPercent(buildProgress?.fraction ?? progressFraction(state))}
            </span>
          </div>
          <Meter fraction={buildProgress?.fraction ?? progressFraction(state)} />
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'rgb(var(--subtle))' }}>
            Building the driver against the image kernel takes ~10–20 min. Do not close the app.
          </p>
          <div style={{ marginTop: 14 }}>
            <MagneticButton className="btn-ghost" onClick={() => void cancelBuild()}>
              Cancel build
            </MagneticButton>
          </div>
        </div>
      )}

      {isFlashing && flashProgress && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="mono" style={{ fontSize: 13, color: 'rgb(var(--danger))' }}>
              {state === 'VERIFYING_USB' ? 'Verifying written data' : 'Flashing USB'} · {flashProgress.phase}
            </span>
            <span className="mono" style={{ fontSize: 13 }}>
              {formatPercent(flashProgress.bytesTotal > 0 ? flashProgress.bytesProcessed / flashProgress.bytesTotal : 0)}
            </span>
          </div>
          <Meter
            fraction={flashProgress.bytesTotal > 0 ? flashProgress.bytesProcessed / flashProgress.bytesTotal : 0}
            tone={state === 'VERIFYING_USB' ? 'ok' : 'danger'}
          />
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            <span className="mono" style={{ fontSize: 12, color: 'rgb(var(--muted))' }}>
              {formatBytes(flashProgress.bytesProcessed)} / {formatBytes(flashProgress.bytesTotal)}
            </span>
            <span className="mono" style={{ fontSize: 12, color: 'rgb(var(--muted))' }}>
              {formatSpeed(flashProgress.speedBps)}
            </span>
            <span className="mono" style={{ fontSize: 12, color: 'rgb(var(--muted))' }}>
              ETA {formatEta(flashProgress.etaSeconds)}
            </span>
          </div>
          <div style={{ marginTop: 14 }}>
            <MagneticButton className="btn-ghost" onClick={() => void cancelFlash()}>
              Cancel flash
            </MagneticButton>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'rgb(var(--warn))' }}>
              Cancelling mid-write leaves the USB partially written and not bootable — it must be
              re-flashed before use.
            </p>
          </div>
        </div>
      )}

      {(state === 'SCANNING_USB' || state === 'USB_SELECTED' || state === 'AWAITING_FLASH_CONFIRMATION') && (
        <div>
          <p style={{ margin: 0, fontSize: 13, color: 'rgb(var(--ok))' }}>
            ✓ Patched image ready.
          </p>
          {snapshot?.patchedImagePath && (
            <p className="mono" style={{ margin: '6px 0 0', fontSize: 12, color: 'rgb(var(--subtle))', wordBreak: 'break-all' }}>
              {snapshot.patchedImagePath}
              {snapshot.patchedImageSizeBytes ? ` · ${formatBytes(snapshot.patchedImageSizeBytes)}` : ''}
            </p>
          )}
          <p style={{ margin: '10px 0 0', fontSize: 13, color: 'rgb(var(--muted))' }}>
            Select and confirm a USB drive below to flash.
          </p>
        </div>
      )}
    </Panel>
  );
}
