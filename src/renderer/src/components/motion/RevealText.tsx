import { motion } from 'framer-motion';
import { wordVariants, revealGroup } from '../../lib/motion.js';

interface RevealTextProps {
  text: string;
  className?: string;
}

/**
 * Word-by-word headline reveal. The full string is the accessible label; the
 * animated words are aria-hidden so screen readers read one clean sentence.
 */
export function RevealText({ text, className }: RevealTextProps): JSX.Element {
  const words = text.split(' ');
  return (
    <motion.h1
      className={className}
      aria-label={text}
      variants={revealGroup}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexWrap: 'wrap', gap: '0.28em', margin: 0 }}
    >
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          aria-hidden="true"
          style={{ display: 'inline-block', overflow: 'hidden', lineHeight: 1.05 }}
        >
          <motion.span variants={wordVariants} style={{ display: 'inline-block' }}>
            {word}
          </motion.span>
        </span>
      ))}
    </motion.h1>
  );
}
