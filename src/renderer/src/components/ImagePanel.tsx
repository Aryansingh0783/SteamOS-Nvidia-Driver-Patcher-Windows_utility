import { useState } from 'react';
import { formatBytes } from '@shared/format.js';
import { useStore } from '../lib/store.js';
import { SUPPORT_MATRIX, HARDWARE_REQUIREMENTS, HYBRID_LAPTOP } from '../constants/hardware.js';
import { Panel, Readout, Chip } from './ui.js';
import { MagneticButton } from './motion/MagneticButton.js';

export function ImagePanel(): JSX.Element {
  const image = useStore((s) => s.snapshot?.image ?? null);
  const validation = useStore((s) => s.snapshot?.imageValidation ?? null);
  const info = useStore((s) => s.snapshot?.imageInfo ?? null);
  const selectImage = useStore((s) => s.selectImage);
  const [showHw, setShowHw] = useState(false);

  const hasError = validation?.issues.some((i) => i.severity === 'error') ?? false;

  return (
    <Panel
      label="02 · Image"
      title="SteamOS recovery image"
      right={
        image ? (
          hasError ? (
            <Chip tone="danger">Invalid</Chip>
          ) : (
            <Chip tone="ok">Accepted</Chip>
          )
        ) : (
          <Chip>None selected</Chip>
        )
      }
    >
      {!image && (
        <p style={{ color: 'rgb(var(--muted))', fontSize: 13, marginTop: 0 }}>
          Provide the decompressed official SteamOS recovery <code>.img</code>. The original file is
          never modified — a working copy is used.
        </p>
      )}

      {image && (
        <>
          <Readout k="File" v={image.path} tone="muted" />
          <Readout k="Size" v={formatBytes(image.sizeBytes)} />
          {info && (
            <>
              <Readout k="SteamOS" v={info.steamosVersion ?? 'unknown'} />
              <Readout k="Kernel" v={info.kernelVersion ?? 'unknown'} />
              <Readout k="glibc" v={info.glibc ?? 'unknown'} />
              <Readout k="Partitions" v={info.partitions.join(', ') || '—'} />
              <Readout
                k="One-click installer"
                v={info.hasRepairDevice ? 'Available' : 'Not available'}
                tone={info.hasRepairDevice ? 'ok' : 'warn'}
              />
            </>
          )}
        </>
      )}

      {validation?.issues.map((issue, i) => (
        <p
          key={i}
          style={{
            margin: '10px 0 0',
            fontSize: 13,
            color:
              issue.severity === 'error'
                ? 'rgb(var(--danger))'
                : issue.severity === 'warning'
                  ? 'rgb(var(--warn))'
                  : 'rgb(var(--muted))',
          }}
        >
          ▸ {issue.message}
          {issue.hint && <span style={{ color: 'rgb(var(--subtle))' }}> — {issue.hint}</span>}
        </p>
      ))}

      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <MagneticButton className="btn-primary" onClick={() => void selectImage()}>
          {image ? 'Choose a different image' : 'Select SteamOS image'}
        </MagneticButton>
        <button className="btn btn-ghost" onClick={() => setShowHw((v) => !v)}>
          {showHw ? 'Hide' : 'Show'} NVIDIA compatibility
        </button>
      </div>

      {showHw && (
        <div style={{ marginTop: 16 }}>
          <div className="label" style={{ marginBottom: 8 }}>
            Supported hardware (nvidia-open — Turing or newer)
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {SUPPORT_MATRIX.map((row) => (
              <div
                key={row.arch}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '130px 1fr auto',
                  gap: 10,
                  alignItems: 'center',
                  fontSize: 12,
                }}
              >
                <span className="mono">{row.arch}</span>
                <span style={{ color: 'rgb(var(--subtle))' }}>{row.examples}</span>
                <Chip
                  tone={
                    row.status === 'supported'
                      ? 'ok'
                      : row.status === 'supported-caveat'
                        ? 'warn'
                        : 'danger'
                  }
                >
                  {row.status === 'supported'
                    ? 'Supported'
                    : row.status === 'supported-caveat'
                      ? 'Caveat'
                      : 'No'}
                </Chip>
              </div>
            ))}
          </div>
          <ul style={{ margin: '12px 0 0', paddingLeft: 18, color: 'rgb(var(--muted))', fontSize: 12 }}>
            {HARDWARE_REQUIREMENTS.map((r, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {r}
              </li>
            ))}
          </ul>

          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 10,
              border: '1px solid rgb(var(--warn) / 0.35)',
              background: 'rgb(var(--warn) / 0.06)',
            }}
          >
            <div className="label" style={{ color: 'rgb(var(--warn))', marginBottom: 6 }}>
              {HYBRID_LAPTOP.title}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: 'rgb(var(--muted))' }}>{HYBRID_LAPTOP.summary}</p>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'rgb(var(--muted))', fontSize: 12 }}>
              {HYBRID_LAPTOP.steps.map((s, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  {s}
                </li>
              ))}
            </ul>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'rgb(var(--warn))' }}>{HYBRID_LAPTOP.honest}</p>
          </div>
        </div>
      )}
    </Panel>
  );
}
