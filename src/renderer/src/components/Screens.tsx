import { motion } from 'framer-motion';
import { formatBytes } from '@shared/format.js';
import { useStore } from '../lib/store.js';
import { MagneticButton } from './motion/MagneticButton.js';

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  display: 'grid',
  placeItems: 'center',
  padding: 24,
  background: 'rgb(var(--surface) / 0.86)',
  backdropFilter: 'blur(8px)',
};

const INSTALL_STEPS = [
  'Boot the target PC from this USB (UEFI boot menu; Secure Boot must be OFF).',
  'At the SteamOS desktop, double-click "Install SteamOS (NVIDIA) to Hard Drive" (erases the disk) or "Upgrade … keeps games & data".',
  'Pick the target disk, confirm, and wait a few minutes. The machine powers off when done.',
  'Remove the USB and boot. First boot lands in Steam setup, then it is a normal SteamOS machine.',
];

export function SuccessScreen(): JSX.Element {
  const snapshot = useStore((s) => s.snapshot);
  const reset = useStore((s) => s.reset);
  return (
    <div style={overlayStyle}>
      <motion.div
        initial={{ y: 30, scale: 0.97, filter: 'blur(12px)', opacity: 0 }}
        animate={{ y: 0, scale: 1, filter: 'blur(0px)', opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="glass-strong"
        style={{ maxWidth: 620, width: '100%', padding: 28 }}
      >
        <div className="label" style={{ color: 'rgb(var(--ok))' }}>Complete</div>
        <h1 className="shimmer" style={{ margin: '4px 0 8px', fontSize: 32 }}>
          NVIDIA SteamOS USB is ready
        </h1>
        <p style={{ margin: '0 0 8px', color: 'rgb(var(--muted))', fontSize: 14 }}>
          The image was written and verified byte-for-byte
          {snapshot?.patchedImageSizeBytes ? ` (${formatBytes(snapshot.patchedImageSizeBytes)})` : ''}.
        </p>
        <ol style={{ margin: '12px 0 0', paddingLeft: 20, color: 'rgb(var(--foreground))', fontSize: 13, lineHeight: 1.7 }}>
          {INSTALL_STEPS.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        <div style={{ marginTop: 20 }}>
          <MagneticButton className="btn-primary" onClick={() => void reset()}>
            Build another
          </MagneticButton>
        </div>
      </motion.div>
    </div>
  );
}

export function FailureScreen(): JSX.Element {
  const snapshot = useStore((s) => s.snapshot);
  const reset = useStore((s) => s.reset);
  const cancelled = snapshot?.state === 'CANCELLED';
  return (
    <div style={overlayStyle}>
      <motion.div
        initial={{ y: 30, scale: 0.97, filter: 'blur(12px)', opacity: 0 }}
        animate={{ y: 0, scale: 1, filter: 'blur(0px)', opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="glass-strong"
        style={{ maxWidth: 620, width: '100%', padding: 28 }}
      >
        <div className="label" style={{ color: cancelled ? 'rgb(var(--warn))' : 'rgb(var(--danger))' }}>
          {cancelled ? 'Cancelled' : 'Failed'}
        </div>
        <h1 style={{ margin: '4px 0 8px', fontSize: 30 }}>
          {cancelled ? 'Operation cancelled' : 'Something went wrong'}
        </h1>
        <p
          className="mono"
          style={{
            margin: '0 0 8px',
            padding: 12,
            borderRadius: 10,
            background: 'rgb(0 0 0 / 0.35)',
            color: cancelled ? 'rgb(var(--warn))' : 'rgb(var(--danger))',
            fontSize: 12.5,
            whiteSpace: 'pre-wrap',
          }}
        >
          {snapshot?.error ?? 'No error detail available.'}
        </p>
        <ul style={{ margin: '10px 0 0', paddingLeft: 18, color: 'rgb(var(--muted))', fontSize: 13 }}>
          <li>Review the log panel for the failing step.</li>
          <li>Common fixes: enable WSL2 + the Arch builder distro, free disk space, or try a specific <code>--driver</code> branch.</li>
          <li>Signature errors during the build: enable “Skip pacman sig check”.</li>
          <li>See TROUBLESHOOTING.md for step-by-step recovery.</li>
        </ul>
        <div style={{ marginTop: 20 }}>
          <MagneticButton className="btn-primary" onClick={() => void reset()}>
            Start over
          </MagneticButton>
        </div>
      </motion.div>
    </div>
  );
}
