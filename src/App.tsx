import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { onUnauthorized } from './api';
import type { User } from './api';
import { Breadcrumbs } from './components/Breadcrumbs';
import type { Crumb } from './components/Breadcrumbs';
import { Composer } from './components/Composer';
import { HamburgerButton } from './components/HamburgerButton';
import { ListFormModal } from './components/ListFormModal';
import type { ListModalState } from './components/ListFormModal';
import { SideMenu } from './components/SideMenu';
import { AppSkeleton } from './components/Skeleton';
import { qk, useLists, useMe, useTaskDetail } from './hooks';
import { ErrorState, NotFound } from './pages/common';
import { HomePage } from './pages/HomePage';
import { ListPage } from './pages/ListPage';
import { LoginScreen } from './pages/LoginScreen';
import { TaskPage } from './pages/TaskPage';

export function App({ initialDraft, focusComposer }: { initialDraft: string; focusComposer: boolean }) {
  const me = useMe();
  const qc = useQueryClient();

  useEffect(() => {
    onUnauthorized(() => qc.setQueryData(qk.me, null));
  }, [qc]);

  if (me.isPending) return <AppSkeleton />;
  if (me.isError) {
    return (
      <main className="page page-center">
        <ErrorState onRetry={() => me.refetch()} />
      </main>
    );
  }
  if (!me.data) return <LoginScreen />;
  return <Shell user={me.data} initialDraft={initialDraft} focusComposer={focusComposer} />;
}

function parseRoute(path: string) {
  const m = path.match(/^\/lists\/([^/]+)(?:\/tasks\/([^/]+))?\/?$/);
  return { listId: m?.[1], taskId: m?.[2] };
}

const depthOf = (path: string) => (path === '/' ? 0 : path.split('/').filter(Boolean).length >= 4 ? 2 : 1);

const pageVariants = {
  initial: (dir: number) => ({ opacity: 0, x: dir * 36, scale: 0.985 }),
  animate: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 34 } },
  exit: (dir: number) => ({ opacity: 0, x: dir * -36, scale: 0.985, transition: { duration: 0.14 } }),
} as const;

function Shell({ user, initialDraft, focusComposer }: { user: User; initialDraft: string; focusComposer: boolean }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [listModal, setListModal] = useState<ListModalState>(null);
  const { listId, taskId } = parseRoute(location);

  // Slide direction follows hierarchy depth: deeper → from the right, back up → from the left
  const prevDepth = useRef(depthOf(location));
  const depth = depthOf(location);
  const direction = depth === prevDepth.current ? 0 : depth > prevDepth.current ? 1 : -1;
  useEffect(() => {
    prevDepth.current = depth;
  }, [depth]);

  // Block body on purpose: scrollTo() returns a Promise in recent Chrome, which must not become the effect cleanup
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location]);

  const crumbs = useBreadcrumbs(listId, taskId);

  return (
    <div className="app">
      <header className="topbar glass">
        <HamburgerButton open={menuOpen} onClick={() => setMenuOpen(true)} controls="side-menu" />
        <Breadcrumbs items={crumbs} />
      </header>

      <main className="page">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={location}
            custom={direction}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <Switch location={location}>
              <Route path="/">
                <HomePage onCreateList={() => setListModal({ mode: 'create' })} />
              </Route>
              <Route path="/lists/:listId">
                {(p) => <ListPage listId={p.listId} onEditList={setListModal} />}
              </Route>
              <Route path="/lists/:listId/tasks/:taskId">
                {(p) => <TaskPage listId={p.listId} taskId={p.taskId} />}
              </Route>
              <Route>
                <NotFound />
              </Route>
            </Switch>
          </motion.div>
        </AnimatePresence>
      </main>

      <Composer defaultListId={listId} initialDraft={initialDraft} focusOnMount={focusComposer} />

      <SideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        user={user}
        onCreateList={() => {
          setMenuOpen(false);
          setListModal({ mode: 'create' });
        }}
      />
      <ListFormModal state={listModal} onClose={() => setListModal(null)} />
    </div>
  );
}

function useBreadcrumbs(listId?: string, taskId?: string): Crumb[] {
  const lists = useLists();
  // Shares the cache with TaskPage; only enabled on task routes
  const detail = useTaskDetail(taskId);
  return useMemo(() => {
    const items: Crumb[] = [{ label: 'ホーム', href: '/' }];
    if (listId) {
      const list = lists.data?.find((l) => l.id === listId);
      items.push({ label: list?.name ?? (lists.isPending ? null : '見つかりません'), href: `/lists/${listId}` });
    }
    if (listId && taskId) {
      items.push({
        label: detail.data?.task.title ?? (detail.isPending ? null : '見つかりません'),
        href: `/lists/${listId}/tasks/${taskId}`,
      });
    }
    return items;
  }, [listId, taskId, lists.data, lists.isPending, detail.data, detail.isPending]);
}
