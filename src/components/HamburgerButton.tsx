import { motion } from 'motion/react';

/** Three-line menu button that morphs into an X while the menu is open. */
export function HamburgerButton({ open, onClick, controls }: { open: boolean; onClick: () => void; controls: string }) {
  const t = { type: 'spring', stiffness: 520, damping: 32 } as const;
  return (
    <motion.button
      type="button"
      className="hamburger icon-btn"
      aria-label={open ? 'メニューを閉じる' : 'メニューを開く'}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onClick}
      whileTap={{ scale: 0.86 }}
    >
      <motion.span className="hamburger-line" animate={open ? { y: 6, rotate: 45 } : { y: 0, rotate: 0 }} transition={t} />
      <motion.span className="hamburger-line" animate={{ opacity: open ? 0 : 1, scaleX: open ? 0.3 : 1 }} transition={t} />
      <motion.span className="hamburger-line" animate={open ? { y: -6, rotate: -45 } : { y: 0, rotate: 0 }} transition={t} />
    </motion.button>
  );
}
