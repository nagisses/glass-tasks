import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import type { Priority, Status, Task } from '../api';
import { PRIORITY_LABEL, STATUS_LABEL } from '../format';
import { useUpdateTask } from '../hooks';
import { useTaskActions } from '../useTaskActions';
import { ChevronRight, Close, Trash } from './Icons';
import { Modal } from './Modal';
import { RadioGroup } from './RadioGroup';
import { useToast } from './Toast';

interface Props {
  /** Live task from the list cache; null closes the sheet */
  task: Task | null;
  onClose: () => void;
}

/** Bottom sheet with quick edits for one task (opened from the swipe action). */
export function TaskSheet({ task, onClose }: Props) {
  return (
    <Modal open={!!task} onClose={onClose} title={task?.title ?? ''} variant="sheet" initialFocus="sheet-status">
      {task && <SheetBody task={task} onClose={onClose} />}
    </Modal>
  );
}

function SheetBody({ task, onClose }: { task: Task; onClose: () => void }) {
  const update = useUpdateTask();
  const { remove } = useTaskActions();
  const toast = useToast();
  const [due, setDue] = useState(task.dueDate ?? '');
  useEffect(() => setDue(task.dueDate ?? ''), [task.dueDate]);

  const save = (patch: Parameters<typeof update.mutate>[0]['patch']) =>
    update.mutate({ id: task.id, patch }, { onError: () => toast({ message: '保存できませんでした', tone: 'error' }) });
  const changeDue = (v: string) => {
    setDue(v);
    save({ dueDate: v || null });
  };

  return (
    <div className="task-sheet" data-testid="task-sheet">
      <div id="sheet-status" tabIndex={-1} />
      <RadioGroup<Status>
        legend="ステータス"
        name="sheet-status"
        value={task.status}
        onChange={(status) => save({ status })}
        options={(['todo', 'doing', 'done'] as Status[]).map((s) => ({ value: s, label: STATUS_LABEL[s], tone: s }))}
      />
      <RadioGroup<Priority>
        legend="優先度"
        name="sheet-priority"
        value={task.priority}
        onChange={(priority) => save({ priority })}
        options={(['high', 'medium', 'low'] as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p], tone: p }))}
      />
      <div className="field-row">
        <label className="field-label" htmlFor="sheet-due">
          期限
        </label>
        <div className="date-field">
          <input id="sheet-due" type="date" className="date-input" value={due} onChange={(e) => changeDue(e.target.value)} />
          {due && (
            <button type="button" className="icon-btn icon-btn-sm" aria-label="期限をクリア" onClick={() => changeDue('')}>
              <Close size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="sheet-actions">
        <motion.button
          type="button"
          className="btn btn-danger-ghost"
          whileTap={{ scale: 0.96 }}
          onClick={() => {
            onClose();
            remove(task);
          }}
        >
          <Trash size={17} />
          削除
        </motion.button>
        <Link href={`/lists/${task.listId}/tasks/${task.id}`} className="btn btn-secondary" onClick={onClose}>
          詳細
          <ChevronRight size={16} />
        </Link>
      </div>
    </div>
  );
}
