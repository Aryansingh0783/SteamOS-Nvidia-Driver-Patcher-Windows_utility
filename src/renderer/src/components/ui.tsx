import type { ReactNode } from 'react';
import { GlowCard } from './motion/GlowCard.js';
import { Reveal } from './motion/Reveal.js';

/** A glass HUD panel with a monospace label, corner brackets and glow. */
export function Panel({
  label,
  title,
  children,
  right,
  delay,
}: {
  label: string;
  title?: string;
  children: ReactNode;
  right?: ReactNode;
  delay?: number;
}): JSX.Element {
  return (
    <Reveal delay={delay}>
      <GlowCard className="glass bracketed">
        <div style={{ padding: '18px 20px 20px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: title ? 4 : 12,
            }}
          >
            <span className="label">{label}</span>
            {right}
          </div>
          {title && (
            <h2 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 600 }}>{title}</h2>
          )}
          {children}
        </div>
      </GlowCard>
    </Reveal>
  );
}

/** A key/value HUD row. */
export function Readout({
  k,
  v,
  tone = 'default',
}: {
  k: string;
  v: ReactNode;
  tone?: 'default' | 'muted' | 'ok' | 'warn' | 'danger';
}): JSX.Element {
  const color =
    tone === 'ok'
      ? 'rgb(var(--ok))'
      : tone === 'warn'
        ? 'rgb(var(--warn))'
        : tone === 'danger'
          ? 'rgb(var(--danger))'
          : tone === 'muted'
            ? 'rgb(var(--subtle))'
            : 'rgb(var(--foreground))';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 16,
        padding: '7px 0',
        borderBottom: '1px solid rgb(var(--line) / 0.06)',
      }}
    >
      <span className="label" style={{ letterSpacing: '0.1em' }}>
        {k}
      </span>
      <span className="mono" style={{ fontSize: 13, color, textAlign: 'right', wordBreak: 'break-word' }}>
        {v}
      </span>
    </div>
  );
}

export type ChipTone = 'default' | 'ok' | 'warn' | 'danger' | 'working';

export function Chip({ tone = 'default', children }: { tone?: ChipTone; children: ReactNode }): JSX.Element {
  return (
    <span className={`chip ${tone === 'default' ? '' : tone}`}>
      <span className="dot" />
      {children}
    </span>
  );
}

export function Meter({
  fraction,
  tone = 'default',
}: {
  fraction: number;
  tone?: 'default' | 'ok' | 'warn' | 'danger';
}): JSX.Element {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div className={`meter ${tone === 'default' ? '' : tone}`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
