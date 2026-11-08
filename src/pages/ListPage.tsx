import { motion } from 'motion/react';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { ConfirmModal } from '../components/ConfirmModal';
import { Pencil, Trash } from '../components/Icons';
import type { ListModalState } from '../components/ListFormModal';
import { ListSkeleton } from '../components/Skeleton';
import { TaskSections } from '../components/TaskSections';
import { useToast } from '../components/Toast';
import { coverUrl } from '../format';
import { useDeleteList, useLists, useTasks } from '../hooks';
import { ErrorState, NotFound, SortDropdown } from './common';

export function ListPage({ listId, onEditList }: { listId: string; onEditList: (s: ListModalState) => void }) {
  const lists = useLists();
  const tasks = useTasks(listId);
  const del = useDeleteList();
  const [confirm, setConfirm] = useState(false);
  const [, navigate] = useLocation();
  const toast = useToast();

  if (lists.isPending || tasks.isPending) return <ListSkeleton />;
  if (lists.isError || tasks.isError) return <ErrorState onRetry={() => (lists.refetch(), tasks.refetch())} />;
  const list = lists.data.find((l) => l.id === listId);
  if (!list) return <NotFound />;
  const open = list.counts.todo + list.counts.doing;

  return (
    <div className="list-page">
      <motion.div
        className="list-hero"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
      >
        <img className="list-hero-image" src={coverUrl(list.cover)} alt="" />
        <div className="list-hero-caption glass">
          <h1 className="list-hero-title">{list.name}</h1>
          <span className="list-hero-meta">未完了 {open}件</span>
        </div>
        <div className="list-hero-actions">
          <motion.button
            type="button"
            className="icon-btn glass"
            aria-label="リストを編集"
            onClick={() => onEditList({ mode: 'edit', list })}
            whileTap={{ scale: 0.88 }}
          >
            <Pencil size={17} />
          </motion.button>
          {!list.isInbox && (
            <motion.button
              type="button"
              className="icon-btn glass"
              aria-label="リストを削除"
              onClick={() => setConfirm(true)}
              whileTap={{ scale: 0.88 }}
            >
              <Trash size={17} />
            </motion.button>
          )}
        </div>
      </motion.div>
      <div className="toolbar">
        <span className="toolbar-count">{tasks.data.length}件</span>
        <SortDropdown />
      </div>
      <TaskSections tasks={tasks.data} scope={`list:${list.id}`} />
      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="リストを削除しますか？"
        message="リスト内のタスクもすべて削除されます。"
        confirmLabel="削除"
        onConfirm={() =>
          del.mutate(list.id, {
            onSuccess: () => {
              navigate('/');
              toast({ message: 'リストを削除しました' });
            },
            onError: () => toast({ message: '削除できませんでした', tone: 'error' }),
          })
        }
      />
    </div>
  );
}
