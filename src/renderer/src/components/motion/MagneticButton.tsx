import { useRef, useState, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion } from 'framer-motion';
import { magneticSpring } from '../../lib/motion.js';

interface MagneticButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

/** Magnetic pull toward the cursor + click ripple. Both disabled under reduced motion. */
export function MagneticButton({
  children,
  onClick,
  disabled = false,
  className = '',
  title,
}: MagneticButtonProps): JSX.Element {
  const ref = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, magneticSpring);
  const y = useSpring(my, magneticSpring);
  const [ripples, setRipples] = useState<Ripple[]>([]);

  const onMove = (e: React.MouseEvent<HTMLButtonElement>): void => {
    if (reduced || disabled) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    mx.set((e.clientX - (rect.left + rect.width / 2)) * 0.35);
    my.set((e.clientY - (rect.top + rect.height / 2)) * 0.35);
  };
  const reset = (): void => {
    mx.set(0);
    my.set(0);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>): void => {
    if (disabled) return;
    if (!reduced) {
      const el = ref.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const id = Date.now();
        setRipples((r) => [...r, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
        setTimeout(() => setRipples((r) => r.filter((rp) => rp.id !== id)), 600);
      }
    }
    onClick?.();
  };

  return (
    <motion.button
      ref={ref}
      type="button"
      title={title}
      className={`btn ${className}`}
      disabled={disabled}
      onMouseMove={onMove}
      onMouseLeave={reset}
      onClick={handleClick}
      style={{ x, y }}
    >
      {children}
      {ripples.map((r) => (
        <span key={r.id} className="ripple" style={{ left: r.x, top: r.y, width: 12, height: 12, marginLeft: -6, marginTop: -6 }} />
      ))}
    </motion.button>
  );
}
