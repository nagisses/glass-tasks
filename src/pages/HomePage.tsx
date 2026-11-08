import { useLocation } from 'wouter';
import { Carousel } from '../components/Carousel';
import { HomeSkeleton } from '../components/Skeleton';
import { TaskSections } from '../components/TaskSections';
import { coverUrl } from '../format';
import { useLists, useTasks } from '../hooks';
import { ErrorState, SortDropdown } from './common';

export function HomePage({ onCreateList }: { onCreateList: () => void }) {
  const lists = useLists();
  const tasks = useTasks();
  const [, navigate] = useLocation();

  if (lists.isPending || tasks.isPending) return <HomeSkeleton />;
  if (lists.isError || tasks.isError) {
    return (
      <ErrorState
        onRetry={() => {
          lists.refetch();
          tasks.refetch();
        }}
      />
    );
  }

  const slides = [
    ...lists.data.map((l) => ({
      key: l.id,
      image: coverUrl(l.cover),
      title: l.name,
      meta: `未完了 ${l.counts.todo + l.counts.doing}件`,
      label: `${l.name}を開く`,
    })),
    { key: 'new', image: '/covers/new.svg', title: '新しいリスト', label: '新しいリストを作成' },
  ];

  return (
    <div className="home">
      <Carousel
        label="リスト"
        slides={slides}
        onSelect={(i) => (i < lists.data.length ? navigate(`/lists/${lists.data[i].id}`) : onCreateList())}
      />
      <div className="toolbar">
        <h1 className="page-title">すべてのタスク</h1>
        <SortDropdown />
      </div>
      <TaskSections tasks={tasks.data} scope="home" lists={lists.data} />
    </div>
  );
}
