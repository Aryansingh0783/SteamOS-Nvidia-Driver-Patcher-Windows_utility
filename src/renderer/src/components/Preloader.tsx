import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { APP } from '../constants/copy.js';

/**
 * Full-screen curtain (~1.2s): app name bottom-left, a monospace 000→100 counter
 * bottom-right driven from performance.now() (smooth under load, lands on 100),
 * a 1px hairline scaling with the count. Slides up on completion. Skipped under
 * reduced motion.
 */
export function Preloader({ onDone }: { onDone: () => void }): JSX.Element | null {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(0);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (reduced) {
      onDone();
      setGone(true);
      return;
    }
    const duration = 1200;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number): void => {
      const p = Math.min(1, (now - start) / duration);
      setCount(Math.round(p * 100));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setTimeout(() => {
          onDone();
          setGone(true);
        }, 250);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, onDone]);

  if (gone) return null;

  return (
    <motion.div
      initial={{ y: 0 }}
      animate={count >= 100 ? { y: '-100%' } : { y: 0 }}
      transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgb(var(--surface))',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '40px',
      }}
      aria-hidden="true"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div className="shimmer" style={{ fontFamily: 'var(--font-mono)', fontSize: 22, letterSpacing: '0.04em' }}>
          {APP.name}
        </div>
        <div className="mono" style={{ fontSize: 48, color: 'rgb(var(--accent))' }}>
          {String(count).padStart(3, '0')}
        </div>
      </div>
      <div style={{ height: 1, marginTop: 20, background: 'rgb(var(--line) / 0.12)' }}>
        <div style={{ height: '100%', width: `${count}%`, background: 'rgb(var(--accent))' }} />
      </div>
    </motion.div>
  );
}
