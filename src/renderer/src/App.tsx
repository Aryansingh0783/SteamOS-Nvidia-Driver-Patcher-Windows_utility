import { useEffect, useState } from 'react';
import { progressFraction } from '@shared/workflow.js';
import { useStore } from './lib/store.js';
import { APP, DISCLAIMER } from './constants/copy.js';
import { Ambient } from './components/motion/Ambient.js';
import { Preloader } from './components/Preloader.js';
import { RevealText } from './components/motion/RevealText.js';
import { Reveal } from './components/motion/Reveal.js';
import { StepRail } from './components/StepRail.js';
import { EnvironmentPanel } from './components/EnvironmentPanel.js';
import { ImagePanel } from './components/ImagePanel.js';
import { OptionsPanel } from './components/OptionsPanel.js';
import { ProgressPanel } from './components/ProgressPanel.js';
import { UsbPanel } from './components/UsbPanel.js';
import { LogPanel } from './components/LogPanel.js';
import { SuccessScreen, FailureScreen } from './components/Screens.js';
import { Meter } from './components/ui.js';

export function App(): JSX.Element {
  const init = useStore((s) => s.init);
  const checkEnvironment = useStore((s) => s.checkEnvironment);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const theme = useStore((s) => s.theme);
  const snapshot = useStore((s) => s.snapshot);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    try {
      init();
      void checkEnvironment();
    } catch {
      // Running outside Electron (e.g. a plain browser preview) — the bridge is
      // unavailable; the UI still renders so the design can be reviewed.
    }
  }, [init, checkEnvironment]);

  const state = snapshot?.state ?? 'INITIALIZING';
  const overall = progressFraction(state);

  return (
    <>
      <Ambient />
      <Preloader onDone={() => setBooted(true)} />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          opacity: booted ? 1 : 0,
          transition: 'opacity 600ms var(--ease-premium)',
        }}
      >
        <header
          className="glass-strong"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            margin: 16,
            padding: '14px 20px',
            borderRadius: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                aria-hidden
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: 'linear-gradient(135deg, rgb(var(--accent)), rgb(var(--accent-2)))',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#1a0603',
                  fontWeight: 800,
                }}
              >
                ◆
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1 }}>{APP.name}</div>
                <div className="label" style={{ marginTop: 3 }}>
                  v{APP.version} · {APP.tagline}
                </div>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 200 }}>
              <StepRail state={state} />
            </div>

            <button
              className="btn btn-ghost"
              style={{ padding: '8px 12px' }}
              onClick={toggleTheme}
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? '☾' : '☀'}
            </button>
          </div>

          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Meter fraction={overall} tone={state === 'FAILED' ? 'danger' : 'default'} />
            </div>
            <span className="mono" style={{ fontSize: 12, color: 'rgb(var(--muted))', minWidth: 180, textAlign: 'right' }}>
              {snapshot?.operation ?? 'Starting…'}
            </span>
          </div>
        </header>

        <main className="scroll-y" style={{ flex: 1, padding: '8px 16px 24px' }}>
          <section style={{ maxWidth: 1080, margin: '0 auto' }}>
            <Reveal>
              <div style={{ padding: '18px 4px 8px' }}>
                <RevealText
                  text={APP.headline}
                  className="mono"
                />
                <p style={{ maxWidth: 620, marginTop: 14, color: 'rgb(var(--muted))', fontSize: 14, lineHeight: 1.6 }}>
                  {APP.sub}
                </p>
              </div>
            </Reveal>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                gap: 16,
                marginTop: 16,
                alignItems: 'start',
              }}
            >
              <div style={{ display: 'grid', gap: 16 }}>
                <EnvironmentPanel />
                <ImagePanel />
                <OptionsPanel />
              </div>
              <div style={{ display: 'grid', gap: 16 }}>
                <ProgressPanel />
                <UsbPanel />
                <LogPanel />
              </div>
            </div>

            <Reveal>
              <p
                style={{
                  maxWidth: 1080,
                  margin: '20px auto 0',
                  fontSize: 11.5,
                  lineHeight: 1.6,
                  color: 'rgb(var(--subtle))',
                }}
              >
                {DISCLAIMER}
              </p>
            </Reveal>
          </section>
        </main>
      </div>

      {state === 'COMPLETED' && <SuccessScreen />}
      {(state === 'FAILED' || state === 'CANCELLED') && <FailureScreen />}
    </>
  );
}
