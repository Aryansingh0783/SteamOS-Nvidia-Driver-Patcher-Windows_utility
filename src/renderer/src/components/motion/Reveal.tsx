import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { revealVariants, revealGroup } from '../../lib/motion.js';

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

/** Single element: fade + slide + blur-in, once, slightly before fully visible. */
export function Reveal({ children, className, delay = 0 }: RevealProps): JSX.Element {
  return (
    <motion.div
      className={className}
      variants={revealVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

/** Parent that staggers Reveal children (card grids / lists). */
export function RevealGroup({ children, className }: RevealProps): JSX.Element {
  return (
    <motion.div
      className={className}
      variants={revealGroup}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
    >
      {children}
    </motion.div>
  );
}
