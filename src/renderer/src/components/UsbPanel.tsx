import { useState } from 'react';
import { assessDisks } from '@shared/usb.js';
import { formatBytes } from '@shared/format.js';
import type { DiskAssessment, DiskDevice } from '@shared/types.js';
import { useStore } from '../lib/store.js';
import { Panel, Meter, Chip } from './ui.js';
import { MagneticButton } from './motion/MagneticButton.js';
import { GlowCard } from './motion/GlowCard.js';
import { ConfirmFlashDialog } from './ConfirmFlashDialog.js';

/** Selection is only "fresh" if scanned within this window. */
const SCAN_FRESH_MS = 60_000;

function DeviceCard({
  assessment,
  selected,
  onSelect,
}: {
  assessment: DiskAssessment;
  selected: boolean;
  onSelect: (d: DiskDevice) => void;
}): JSX.Element {
  const { device, eligibility, selectable, notes } = assessment;
  const tone =
    eligibility === 'eligible' ? 'ok' : eligibility === 'system-disk' ? 'danger' : 'warn';
  return (
    <GlowCard className="glass">
      <div
        style={{
          padding: 14,
          border: selected ? '1px solid rgb(var(--accent))' : '1px solid transparent',
          borderRadius: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 600 }}>{device.model}</span>
          <Chip tone={tone}>
            {eligibility === 'eligible' ? 'Eligible' : eligibility.replace('-', ' ')}
          </Chip>
        </div>
        <div style={{ margin: '8px 0' }}>
          <Meter fraction={1} tone={eligibility === 'eligible' ? 'ok' : 'warn'} />
        </div>
        <div className="mono" style={{ fontSize: 11.5, color: 'rgb(var(--subtle))', display: 'grid', gap: 2 }}>
          <span>{formatBytes(device.sizeBytes)} · {device.bus.toUpperCase()} {device.removable ? '· removable' : ''}</span>
          <span>{device.devicePath}</span>
          <span>serial: {device.serial ?? 'n/a'}</span>
          {device.mountedVolumes.length > 0 && <span>mounted: {device.mountedVolumes.join(', ')}</span>}
        </div>
        {notes.map((n, i) => (
          <p key={i} style={{ margin: '6px 0 0', fontSize: 11.5, color: `rgb(var(--${tone === 'danger' ? 'danger' : 'warn'}))` }}>
            {n}
          </p>
        ))}
        <div style={{ marginTop: 10 }}>
          <MagneticButton
            className={selected ? 'btn-primary' : ''}
            disabled={!selectable}
            onClick={() => onSelect(device)}
            title={selectable ? 'Select this drive' : 'This drive cannot be selected'}
          >
            {selected ? '✓ Selected' : selectable ? 'Select' : 'Unavailable'}
          </MagneticButton>
        </div>
      </div>
    </GlowCard>
  );
}

export function UsbPanel(): JSX.Element {
  const devices = useStore((s) => s.devices);
  const selectedDevice = useStore((s) => s.selectedDevice);
  const lastScanTs = useStore((s) => s.lastScanTs);
  const scanUsb = useStore((s) => s.scanUsb);
  const selectUsb = useStore((s) => s.selectUsb);
  const snapshot = useStore((s) => s.snapshot);
  const [scanning, setScanning] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const requiredBytes = snapshot?.patchedImageSizeBytes ?? 0;
  const assessments = assessDisks(devices, requiredBytes);
  const patchedReady = !!snapshot?.patchedImagePath;
  const fresh = lastScanTs !== null && Date.now() - lastScanTs < SCAN_FRESH_MS;
  const selectedAssessment = assessments.find((a) => a.device.index === selectedDevice?.index);

  const canOpenConfirm =
    patchedReady &&
    !!selectedDevice &&
    !!selectedAssessment?.selectable &&
    fresh &&
    (snapshot?.flashUnlocked ?? false);

  const scan = async (): Promise<void> => {
    setScanning(true);
    try {
      await scanUsb();
    } finally {
      setScanning(false);
    }
  };

  return (
    <>
      <Panel
        label="04 · Target USB"
        title="Select a USB drive"
        right={
          <MagneticButton onClick={scan} disabled={scanning}>
            {scanning ? 'Scanning…' : '⟳ Refresh'}
          </MagneticButton>
        }
      >
        {!patchedReady && (
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'rgb(var(--subtle))' }}>
            The flash target is locked until a patched image has been built.
          </p>
        )}

        {devices.length === 0 ? (
          <p className="mono" style={{ color: 'rgb(var(--subtle))', fontSize: 13 }}>
            No disks enumerated yet. Click Refresh. Internal and system disks are shown but can never
            be selected.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {assessments.map((a) => (
              <DeviceCard
                key={a.device.index}
                assessment={a}
                selected={selectedDevice?.index === a.device.index}
                onSelect={(d) => void selectUsb(d)}
              />
            ))}
          </div>
        )}

        {selectedDevice && !fresh && (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'rgb(var(--warn))' }}>
            The drive list is stale. Refresh before flashing so the target identity is re-verified.
          </p>
        )}

        <div style={{ marginTop: 16 }}>
          <MagneticButton
            className="btn-danger"
            disabled={!canOpenConfirm}
            onClick={() => setConfirming(true)}
            title={canOpenConfirm ? 'Review and confirm the destructive flash' : 'Flashing is locked'}
          >
            ⚠ Flash to selected USB
          </MagneticButton>
        </div>
      </Panel>

      {confirming && selectedDevice && snapshot?.patchedImagePath && (
        <ConfirmFlashDialog
          device={selectedDevice}
          imagePath={snapshot.patchedImagePath}
          requiresExtraConfirmation={selectedAssessment?.requiresExtraConfirmation ?? false}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
