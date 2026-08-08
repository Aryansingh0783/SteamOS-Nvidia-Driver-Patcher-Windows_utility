import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { formatBytes } from '@shared/format.js';
import type { DiskDevice, FlashRequest } from '@shared/types.js';
import { useStore } from '../lib/store.js';
import { FLASH_WARNING } from '../constants/copy.js';
import { Readout } from './ui.js';

/**
 * Final confirmation before an irreversible write. Shows the exact drive
 * identity, traps focus, closes on Esc, restores focus to the trigger, and
 * requires an explicit acknowledgement (plus a typed "ERASE" for suspicious
 * drives) before the destructive action is enabled.
 */
export function ConfirmFlashDialog({
  device,
  imagePath,
  requiresExtraConfirmation,
  onClose,
}: {
  device: DiskDevice;
  imagePath: string;
  requiresExtraConfirmation: boolean;
  onClose: () => void;
}): JSX.Element {
  const startFlash = useStore((s) => s.startFlash);
  const [ack, setAck] = useState(false);
  const [typed, setTyped] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    triggerRef.current = document.activeElement;
    const el = dialogRef.current;
    el?.focus();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && el) {
        const focusables = el.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      (triggerRef.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  const typedOk = !requiresExtraConfirmation || typed.trim().toUpperCase() === 'ERASE';
  const canConfirm = ack && typedOk;

  const confirm = async (): Promise<void> => {
    if (!canConfirm) return;
    const request: FlashRequest = {
      imagePath,
      device,
      confirmedModel: device.model,
      confirmedSizeBytes: device.sizeBytes,
      confirmedSerial: device.serial,
    };
    await startFlash(request);
    onClose();
  };

  return (
    <div className="scrim" role="presentation">
      <motion.div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        tabIndex={-1}
        initial={{ y: 30, scale: 0.97, filter: 'blur(12px)', opacity: 0 }}
        animate={{ y: 0, scale: 1, filter: 'blur(0px)', opacity: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="glass-strong"
        style={{ maxWidth: 520, width: '100%', padding: 24 }}
      >
        <h2 id="confirm-title" style={{ margin: '0 0 4px', color: 'rgb(var(--danger))' }}>
          ⚠ Confirm destructive flash
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'rgb(var(--foreground))' }}>{FLASH_WARNING}</p>

        <Readout k="Model" v={device.model} tone="danger" />
        <Readout k="Capacity" v={formatBytes(device.sizeBytes)} />
        <Readout k="Device" v={device.devicePath} />
        <Readout k="Bus" v={`${device.bus.toUpperCase()}${device.removable ? ' · removable' : ''}`} />
        <Readout k="Serial" v={device.serial ?? 'n/a'} />
        {device.mountedVolumes.length > 0 && (
          <Readout k="Mounted" v={device.mountedVolumes.join(', ')} tone="warn" />
        )}
        <Readout k="Image" v={imagePath} tone="muted" />

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, fontSize: 13 }}>
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 3 }} />
          I understand every partition and file on <strong>&nbsp;{device.model}&nbsp;</strong> will be
          permanently erased.
        </label>

        {requiresExtraConfirmation && (
          <div style={{ marginTop: 12 }}>
            <label className="label" style={{ display: 'block', marginBottom: 6 }}>
              This drive is unusually large or has mounted volumes. Type ERASE to continue.
            </label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label="Type ERASE to confirm"
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'rgb(0 0 0 / 0.3)',
                border: '1px solid rgb(var(--danger) / 0.5)',
                borderRadius: 8,
                color: 'rgb(var(--foreground))',
                padding: '8px 10px',
                width: '100%',
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-danger" disabled={!canConfirm} onClick={() => void confirm()}>
            Erase &amp; flash
          </button>
        </div>
      </motion.div>
    </div>
  );
}
