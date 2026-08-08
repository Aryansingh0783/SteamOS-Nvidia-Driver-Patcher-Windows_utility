/**
 * Shared motion configuration. One easing curve + one timing family, per the
 * Premium Motion System. Respect `prefers-reduced-motion` at the JS level too.
 */
import type { Variants } from 'framer-motion';

export const EASE_PREMIUM = [0.22, 1, 0.36, 1] as const;

export const revealVariants: Variants = {
  hidden: { opacity: 0, y: 28, filter: 'blur(10px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.75, ease: EASE_PREMIUM },
  },
};

export const revealGroup: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

export const wordVariants: Variants = {
  hidden: { y: '110%' },
  show: { y: '0%', transition: { duration: 0.85, ease: EASE_PREMIUM } },
};

export const magneticSpring = { stiffness: 220, damping: 16, mass: 0.35 } as const;
