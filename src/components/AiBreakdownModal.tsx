import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { Task } from '../api';
import { useAddSubtasks, useBreakdown } from '../hooks';
import { Check, Sparkles } from './Icons';
import { Modal } from './Modal';
import { SuggestionSkeleton } from './Skeleton';
import { useToast } from './Toast';

export function AiBreakdownModal({ task, open, onClose }: { task: Task; open: boolean; onClose: () => void }) {
  const [picked, setPicked] = useState<boolean[]>([]);
  const breakdown = useBreakdown();
  const add = useAddSubtasks(task.id);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    breakdown.reset();
    breakdown.mutate(task.id, { onSuccess: (d) => setPicked(d.suggestions.map(() => true)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task.id]);

  const suggestions = breakdown.data?.suggestions ?? [];
  const count = picked.filter(Boolean).length;

  const confirm = () => {
    const titles = suggestions.filter((_, i) => picked[i]);
    if (titles.length === 0) return;
    add.mutate(titles, {
      onSuccess: () => toast({ message: `サブタスクを${titles.length}件追加しました` }),
      onError: () => toast({ message: '追加できませんでした', tone: 'error' }),
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="ai-title">
          <Sparkles size={18} /> AIで分解
        </span>
      }
      footer={
        breakdown.isSuccess && (
          <>
            <motion.button type="button" className="btn btn-secondary" onClick={onClose} whileTap={{ scale: 0.96 }}>
              キャンセル
            </motion.button>
            <motion.button
              type="button"
              className="btn btn-primary"
              onClick={confirm}
              disabled={count === 0}
              whileTap={{ scale: 0.96 }}
            >
              {count}件を追加
            </motion.button>
          </>
        )
      }
    >
      <p className="ai-target">{task.title}</p>
      <AnimatePresence mode="wait" initial={false}>
        {breakdown.isPending && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <SuggestionSkeleton />
          </motion.div>
        )}
        {breakdown.isError && (
          <motion.div key="error" className="ai-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p role="alert">AIの提案を取得できませんでした</p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => breakdown.mutate(task.id, { onSuccess: (d) => setPicked(d.suggestions.map(() => true)) })}
            >
              再試行
            </button>
          </motion.div>
        )}
        {breakdown.isSuccess && (
          <motion.ul key="list" className="suggestions" aria-label="提案" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {suggestions.map((s, i) => (
              <motion.li
                key={s}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, type: 'spring', stiffness: 500, damping: 34 }}
              >
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={picked[i] ?? false}
                    onChange={(e) => setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))}
                  />
                  <span className="checkbox" aria-hidden="true">
                    <Check size={13} />
                  </span>
                  <span>{s}</span>
                </label>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </Modal>
  );
}
