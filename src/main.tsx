import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ToastProvider } from './components/Toast';
import { PrefsProvider } from './prefs';
import './styles.css';

// Carry over anything typed into the static boot shell before JS loaded
const bootInput = document.getElementById('boot-input') as HTMLInputElement | null;
const initialDraft = bootInput?.value ?? '';
const focusComposer =
  document.activeElement === bootInput || (!!initialDraft || matchMedia('(pointer: fine)').matches);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <PrefsProvider>
          <ToastProvider>
            <App initialDraft={initialDraft} focusComposer={focusComposer} />
          </ToastProvider>
        </PrefsProvider>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
