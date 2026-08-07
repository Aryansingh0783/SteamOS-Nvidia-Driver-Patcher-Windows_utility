import { useState } from 'react';
import { isValidDriverSpec } from '@shared/driver-spec.js';
import { assessGpuCompat } from '@shared/gpu-compat.js';
import type { UpdateMode } from '@shared/types.js';
import { useStore } from '../lib/store.js';
import { Panel, Chip } from './ui.js';

const UPDATE_MODES: { id: UpdateMode; label: string; desc: string }[] = [
  { id: 'selfheal', label: 'Self-healing', desc: 'Updates work; driver is rebuilt for each new OS version. (default)' },
  { id: 'hold', label: 'Hold updates', desc: 'Steam always reports "up to date"; OS frozen.' },
  { id: 'stock', label: 'Stock', desc: 'Danger: an OS update removes the driver.' },
];

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  background: 'rgb(0 0 0 / 0.25)',
  border: '1px solid rgb(var(--line) / 0.16)',
  borderRadius: 8,
  color: 'rgb(var(--foreground))',
  padding: '8px 10px',
  fontSize: 13,
  width: '100%',
};

export function OptionsPanel(): JSX.Element {
  const options = useStore((s) => s.options);
  const setOptions = useStore((s) => s.setOptions);
  const [gpu, setGpu] = useState('');

  const driverValid = isValidDriverSpec(options.driverSpec);
  const compat = gpu.trim() ? assessGpuCompat(gpu) : null;

  return (
    <Panel label="03 · Options" title="Driver & build options">
      <label className="label" style={{ display: 'block', marginBottom: 6 }}>
        Driver spec
      </label>
      <input
        style={{ ...inputStyle, borderColor: driverValid ? 'rgb(var(--line) / 0.16)' : 'rgb(var(--danger))' }}
        value={options.driverSpec}
        spellCheck={false}
        onChange={(e) => setOptions({ driverSpec: e.target.value })}
        aria-label="NVIDIA driver spec"
      />
      <p style={{ margin: '6px 0 0', fontSize: 12, color: driverValid ? 'rgb(var(--subtle))' : 'rgb(var(--danger))' }}>
        {driverValid
          ? 'latest, or a version prefix: 580, 580.105.08, 580.105.08-4'
          : 'Invalid — use latest or a version prefix like 580 / 580.105.08 / 580.105.08-4'}
      </p>

      <div className="label" style={{ margin: '16px 0 8px' }}>
        OS update strategy
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {UPDATE_MODES.map((m) => (
          <label
            key={m.id}
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              cursor: 'pointer',
              padding: 8,
              borderRadius: 8,
              border: '1px solid',
              borderColor:
                options.updateMode === m.id ? 'rgb(var(--accent) / 0.5)' : 'rgb(var(--line) / 0.08)',
              background: options.updateMode === m.id ? 'rgb(var(--accent) / 0.08)' : 'transparent',
            }}
          >
            <input
              type="radio"
              name="update-mode"
              checked={options.updateMode === m.id}
              onChange={() => setOptions({ updateMode: m.id })}
              style={{ marginTop: 2 }}
            />
            <span>
              <span className="mono" style={{ fontSize: 13 }}>
                {m.label}
              </span>
              <span style={{ display: 'block', fontSize: 12, color: 'rgb(var(--subtle))' }}>{m.desc}</span>
            </span>
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={options.addInstaller}
            onChange={(e) => setOptions({ addInstaller: e.target.checked })}
          />
          One-click installer
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={options.trimCuda}
            onChange={(e) => setOptions({ trimCuda: e.target.checked })}
          />
          Trim CUDA (~350 MB smaller)
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }} title="Only if signature checks fail; packages come over HTTPS from Arch infrastructure.">
          <input
            type="checkbox"
            checked={options.skipSigCheck}
            onChange={(e) => setOptions({ skipSigCheck: e.target.checked })}
          />
          Skip pacman sig check
        </label>
      </div>

      <hr className="hairline" style={{ margin: '16px 0' }} />

      <label className="label" style={{ display: 'block', marginBottom: 6 }}>
        Check your GPU (optional)
      </label>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          style={inputStyle}
          placeholder="e.g. NVIDIA GeForce RTX 4070"
          value={gpu}
          onChange={(e) => setGpu(e.target.value)}
          aria-label="GPU model to check"
        />
        {compat && (
          <Chip tone={compat.supported ? 'ok' : 'danger'}>{compat.supported ? 'Supported' : 'Not supported'}</Chip>
        )}
      </div>
      {compat && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'rgb(var(--muted))' }}>
          {compat.reason}
          {compat.caveat && <span style={{ color: 'rgb(var(--warn))' }}> {compat.caveat}</span>}
        </p>
      )}
    </Panel>
  );
}
