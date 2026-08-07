import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Decorative atmosphere: floating blobs, grid overlay, film grain and a
 * slow mouse-following glow. All aria-hidden + pointer-events:none. Disabled
 * under reduced motion (CSS also hides them as a belt-and-braces measure).
 */
export function Ambient(): JSX.Element {
  const glowRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const el = glowRef.current;
    if (!el) return;
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let x = targetX;
    let y = targetY;
    let raf = 0;

    const onMove = (e: MouseEvent): void => {
      targetX = e.clientX;
      targetY = e.clientY;
    };
    const tick = (): void => {
      // heavy lag — the whole point of the effect
      x += (targetX - x) * 0.06;
      y += (targetY - y) * 0.06;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('mousemove', onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <div className="ambient" aria-hidden="true">
      <div className="blob a" />
      <div className="blob b" />
      <div className="grid-overlay" />
      {!reduced && <div ref={glowRef} className="mouse-glow" />}
      <div className="grain" />
    </div>
  );
}
