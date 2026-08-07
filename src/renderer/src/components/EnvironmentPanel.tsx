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
  const provisionDistro = useStore((s) => s.provisionDistro);
  const [checking, setChecking] = useState(false);
  const [setup, setSetup] = useState<'idle' | 'consent' | 'running'>('idle');

  const recheck = async (): Promise<void> => {
    setChecking(true);
    try {
      await checkEnvironment();
    } finally {
      setChecking(false);
    }
  };

  const runProvision = async (): Promise<void> => {
    setSetup('running');
    try {
      await provisionDistro();
    } finally {
      setSetup('idle');
    }
  };

  const canProvision =
    !!env && env.platform === 'win32' && env.wsl.installed && !env.wsl.builderDistroPresent;

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

      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <MagneticButton onClick={recheck} disabled={checking || setup === 'running'}>
          {checking ? 'Checking…' : 'Re-check'}
        </MagneticButton>
        {env && !env.wsl.installed && (
          <MagneticButton className="btn-ghost" onClick={() => void openWslDocs()}>
            Install WSL2 ↗
          </MagneticButton>
        )}
        {canProvision && setup === 'idle' && (
          <MagneticButton className="btn-primary" onClick={() => setSetup('consent')}>
            Set up builder distro (beta)
          </MagneticButton>
        )}
        {setup === 'running' && (
          <span className="chip working" style={{ alignSelf: 'center' }}>
            <span className="dot" /> Provisioning… watch the log
          </span>
        )}
      </div>

      {setup === 'consent' && (
        <div
          className="glass"
          style={{ marginTop: 14, padding: 14, borderColor: 'rgb(var(--accent) / 0.4)' }}
        >
          <div className="label" style={{ marginBottom: 6 }}>
            One-time builder setup
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'rgb(var(--muted))' }}>
            This installs the <strong>official Arch Linux WSL distribution</strong> and re-imports it
            under a dedicated name (<code>SteamOS-NVIDIA-Builder</code>), then installs the required
            build tools. Your other WSL distros are not touched. It downloads several GB and can take
            5–15 minutes; progress streams to the log below. Best-effort — if it fails, the manual
            steps are in TROUBLESHOOTING.md.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <MagneticButton className="btn-primary" onClick={() => void runProvision()}>
              Proceed
            </MagneticButton>
            <button className="btn btn-ghost" onClick={() => setSetup('idle')}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
