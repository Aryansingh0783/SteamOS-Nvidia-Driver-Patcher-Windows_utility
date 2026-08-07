import type { ReactNode } from 'react';
import { useRef } from 'react';

interface GlowCardProps {
  children: ReactNode;
  className?: string;
}

/**
 * Pointer-tracked radial highlight within the card. JS only writes two custom
 * properties on mousemove — no React re-renders. Combine with `.glass`.
 */
export function GlowCard({ children, className = '' }: GlowCardProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  return (
    <div ref={ref} className={`glow-card ${className}`} onMouseMove={onMove}>
      {children}
    </div>
  );
}
