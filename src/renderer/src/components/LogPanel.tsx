import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store.js';
import { Panel } from './ui.js';

export function LogPanel(): JSX.Element {
  const logs = useStore((s) => s.logs);
  const [expanded, setExpanded] = useState(true);
  const [follow, setFollow] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (follow && expanded) endRef.current?.scrollIntoView({ block: 'end' });
  }, [logs, follow, expanded]);

  return (
    <Panel
      label="Log · audit trail"
      right={
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ padding: '4px 10px' }} onClick={() => setFollow((v) => !v)}>
            {follow ? 'Following' : 'Paused'}
          </button>
          <button className="btn btn-ghost" style={{ padding: '4px 10px' }} onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      }
    >
      {expanded ? (
        <div className="log scroll-y" style={{ maxHeight: 260 }} aria-live="polite">
          {logs.length === 0 ? (
            <div className="ln">Waiting for activity…</div>
          ) : (
            logs.map((l, i) => (
              <div key={i} className={`ln ${l.level === 'warn' ? 'warn' : l.level === 'error' ? 'error' : ''}`}>
                <span className="t">{new Date(l.ts).toLocaleTimeString()}</span>
                <span className="t">[{l.source}]</span>
                {l.message}
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
      ) : (
        <p className="mono" style={{ fontSize: 12, color: 'rgb(var(--subtle))' }}>
          {logs.length} entries — expand to view.
        </p>
      )}
    </Panel>
  );
}
