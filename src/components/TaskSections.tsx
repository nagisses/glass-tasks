import { AnimatePresence } from 'motion/react';
import { useMemo } from 'react';
import type { List, Status, Task } from '../api';
import { sortTasks, STATUS_LABEL } from '../format';
import { usePrefs } from '../prefs';
import { useTaskActions } from '../useTaskActions';
import { Accordion } from './Accordion';
import { StatusIcon, TaskRow } from './TaskRow';

interface Props {
  tasks: Task[];
  /** Accordion state key prefix, e.g. "home" or "list:<id>" */
  scope: string;
  lists?: List[];
}

/** Tasks grouped by status, each group in an accordion. */
export function TaskSections({ tasks, scope, lists }: Props) {
  const prefs = usePrefs();
  const { advance, remove } = useTaskActions();
  const listNames = useMemo(() => new Map(lists?.map((l) => [l.id, l.name])), [lists]);

  const groups = useMemo(() => {
    const sorted = sortTasks(tasks, prefs.sort);
    const g: Record<Status, Task[]> = { todo: [], doing: [], done: [] };
    for (const t of sorted) g[t.status].push(t);
    return g;
  }, [tasks, prefs.sort]);

  const statuses: Status[] = prefs.showDone ? ['todo', 'doing', 'done'] : ['todo', 'doing'];

  return (
    <div className="sections">
      {statuses.map((s) => (
        <Accordion
          key={s}
          id={`${scope}:${s}`}
          title={STATUS_LABEL[s]}
          badge={groups[s].length}
          defaultOpen={s !== 'done'}
          icon={<StatusIcon status={s} />}
          className={`section-${s}`}
        >
          {groups[s].length === 0 ? (
            <p className="empty">タスクはありません</p>
          ) : (
            <ul className="task-group glass" aria-label={STATUS_LABEL[s]}>
              <AnimatePresence initial={false}>
                {groups[s].map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    listName={lists ? listNames.get(t.listId) : undefined}
                    onAdvance={advance}
                    onDelete={remove}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </Accordion>
      ))}
    </div>
  );
}
