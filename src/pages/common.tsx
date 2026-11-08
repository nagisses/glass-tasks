import { motion } from 'motion/react';
import { Link } from 'wouter';
import { SORT_OPTIONS } from '../format';
import { Dropdown } from '../components/Dropdown';
import { usePrefs } from '../prefs';

export function SortDropdown() {
  const prefs = usePrefs();
  return <Dropdown label="並び替え" value={prefs.sort} options={SORT_OPTIONS} onChange={prefs.setSort} align="end" />;
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="state-card glass" role="alert">
      <p>読み込めませんでした</p>
      <motion.button type="button" className="btn btn-secondary" onClick={onRetry} whileTap={{ scale: 0.96 }}>
        再試行
      </motion.button>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="state-card glass">
      <p>見つかりません</p>
      <Link href="/" className="btn btn-secondary">
        ホームへ
      </Link>
    </div>
  );
}
