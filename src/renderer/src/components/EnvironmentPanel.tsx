import { useState } from 'react';
import type { EnvironmentReport } from '@shared/types.js';
import { formatBytes } from '@shared/format.js';
import { useStore } from '../lib/store.js';
import { Panel, Readout, Chip } from './ui.js';
import { MagneticButton } from './motion/MagneticButton.js';

function statusChip(env: EnvironmentReport | null): JSX.Element {
  if (!env) return <Chip tone="working">Checking…</Chip>;
  if (env.ready) return <Chip tone="ok">Ready</Chip>;
  if (env.blockers.length > 0) return <Chip tone="danger">Blocked</Chip>;
  return <Chip tone="warn">Advisory</Chip>;
}

export function EnvironmentPanel(): JSX.Element {
  const env = useStore((s) => s.snapshot?.environment ?? null);
  const checkEnvironment = useStore((s) => s.checkEnvironment);
  const openWslDocs = useStore((s) => s.openWslDocs);
  const [checking, setChecking] = useState(false);

  const recheck = async (): Promise<void> => {
    setChecking(true);
    try {
      await checkEnvironment();
    } finally {
      setChecking(false);
    }
  };

  return (
    <Panel label="01 · Environment" title="Build environment (WSL2)" right={statusChip(env)}>
      {env ? (
        <>
          <Readout k="Platform" v={env.platform} tone={env.platform === 'win32' ? 'default' : 'warn'} />
          <Readout
            k="WSL2"
            v={env.wsl.installed ? `Installed${env.wsl.kernelVersion ? ` · ${env.wsl.kernelVersion}` : ''}` : 'Not installed'}
            tone={env.wsl.installed ? 'ok' : 'danger'}
          />
          <Readout
            k="Builder distro"
            v={env.wsl.builderDistroPresent ? 'Present' : 'Not set up'}
            tone={env.wsl.builderDistroPresent ? 'ok' : 'danger'}
          />
          <Readout
            k="Workspace free"
            v={env.workspaceFreeBytes !== null ? formatBytes(env.workspaceFreeBytes) : '—'}
          />
          <Readout
            k="Elevation"
            v={env.elevated ? 'Administrator' : 'Standard (needed for flashing)'}
            tone={env.elevated ? 'ok' : 'warn'}
          />

          {env.blockers.map((b, i) => (
            <p key={`b${i}`} style={{ margin: '10px 0 0', color: 'rgb(var(--danger))', fontSize: 13 }}>
              ▸ {b}
            </p>
          ))}
          {env.warnings.map((w, i) => (
            <p key={`w${i}`} style={{ margin: '10px 0 0', color: 'rgb(var(--warn))', fontSize: 13 }}>
              ▸ {w}
            </p>
          ))}
        </>
      ) : (
        <p className="mono" style={{ color: 'rgb(var(--subtle))' }}>
          Running environment checks…
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <MagneticButton onClick={recheck} disabled={checking}>
          {checking ? 'Checking…' : 'Re-check'}
        </MagneticButton>
        {env && !env.wsl.installed && (
          <MagneticButton className="btn-ghost" onClick={() => void openWslDocs()}>
            Install WSL2 ↗
          </MagneticButton>
        )}
      </div>
    </Panel>
  );
}
