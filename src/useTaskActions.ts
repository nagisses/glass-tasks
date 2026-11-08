import type { Task } from './api';
import { useToast } from './components/Toast';
import { NEXT_STATUS, STATUS_LABEL } from './format';
import { useDeleteTask, useRestoreTask, useUpdateTask } from './hooks';

/** Status change / delete with an undo toast; shared by swipe gestures and buttons. */
export function useTaskActions() {
  const update = useUpdateTask();
  const del = useDeleteTask();
  const restore = useRestoreTask();
  const toast = useToast();
  const failed = () => toast({ message: '保存できませんでした', tone: 'error' });

  const advance = (task: Task) => {
    const next = NEXT_STATUS[task.status];
    update.mutate(
      { id: task.id, patch: { status: next } },
      {
        onError: failed,
      },
    );
    toast({
      message: `${STATUS_LABEL[next]}にしました`,
      action: {
        label: '元に戻す',
        onClick: () => update.mutate({ id: task.id, patch: { status: task.status } }, { onError: failed }),
      },
    });
  };

  const remove = (task: Task, after?: () => void) => {
    del.mutate(task, {
      onError: failed,
      onSuccess: after,
    });
    toast({
      message: '削除しました',
      action: { label: '元に戻す', onClick: () => restore.mutate(task.id, { onError: failed }) },
    });
  };

  return { advance, remove };
}
