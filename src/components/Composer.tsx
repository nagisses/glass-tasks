import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { COVER_TINT } from '../format';
import { ApiError } from '../api';
import { useAiQuickAdd, useCreateTask, useFeatures, useLists } from '../hooks';
import { load, save } from '../storage';
import { Dropdown } from './Dropdown';
import { ArrowUp, Sparkles } from './Icons';
import { useToast } from './Toast';

const DRAFT_KEY = 'gt.draft';

interface Props {
  /** List the composer adds to by default (the list being viewed); inbox when undefined */
  defaultListId?: string;
  initialDraft?: string;
  focusOnMount?: boolean;
}

/** Always-visible quick add bar. Usable immediately, even while lists are still loading. */
export function Composer({ defaultListId, initialDraft, focusOnMount }: Props) {
  const lists = useLists();
  const create = useCreateTask();
  const aiAdd = useAiQuickAdd();
  const features = useFeatures();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => initialDraft || load<string>(DRAFT_KEY, ''));
  const [chosen, setChosen] = useState<string | undefined>(defaultListId);

  useEffect(() => {
    setChosen(defaultListId);
  }, [defaultListId]);
  useEffect(() => {
    save(DRAFT_KEY, text);
  }, [text]);

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus({ preventScroll: true });
    // "/" or "n" focuses the composer from anywhere (desktop)
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea, select, [contenteditable], [role=listbox]')) return;
      if (e.key === '/' || e.key === 'n') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [focusOnMount]);

  // Before lists load, trust the route's list so typing right away still lands in the right place
  const known = lists.data?.find((l) => l.id === chosen);
  const listId = lists.data ? (known?.id ?? lists.data.find((l) => l.isInbox)?.id) : chosen;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const title = text.trim();
    if (!title) return;
    create.mutate(
      { id: crypto.randomUUID(), title: title.slice(0, 200), listId },
      { onError: () => toast({ message: '追加できませんでした', tone: 'error' }) },
    );
    setText('');
    inputRef.current?.focus({ preventScroll: true });
  };

  const submitWithAi = () => {
    const input = text.trim();
    if (!input || aiAdd.isPending) return;
    aiAdd.mutate(
      { text: input.slice(0, 300), listId },
      {
        onSuccess: () => {
          setText('');
          toast({ message: 'AIで追加しました' });
        },
        onError: (e) =>
          toast({
            message:
              e instanceof ApiError && e.status === 429
                ? 'AIの利用上限に達しました'
                : e instanceof ApiError && e.status === 503
                  ? 'Geminiが設定されていません'
                  : 'AIで追加できませんでした',
            tone: 'error',
          }),
      },
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter that confirms Japanese IME conversion must not submit
    if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) {
      e.preventDefault();
    }
  };

  return (
    <motion.form
      className="composer glass"
      onSubmit={submit}
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      data-testid="composer"
    >
      {lists.data ? (
        <Dropdown
          label="追加先リスト"
          className="composer-list"
          value={listId}
          onChange={setChosen}
          options={lists.data.map((l) => ({
            value: l.id,
            label: l.name,
            icon: <span className="list-dot" style={{ background: COVER_TINT[l.cover] }} />,
          }))}
          renderValue={(o) => (
            <>
              <span className="list-dot" style={{ background: COVER_TINT[lists.data!.find((l) => l.id === o?.value)?.cover ?? 0] }} />
              <span className="chip-label">{o?.label}</span>
            </>
          )}
        />
      ) : (
        <span className="sk sk-chip" aria-hidden="true" />
      )}
      <input
        ref={inputRef}
        className="composer-input"
        placeholder="タスクを追加"
        aria-label="タスクを追加"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        readOnly={aiAdd.isPending}
        maxLength={300}
        autoComplete="off"
        enterKeyHint="done"
      />
      <AnimatePresence>
        {features.ai && text.trim() && (
          <motion.button
            key="ai"
            type="button"
            className={`composer-ai ${aiAdd.isPending ? 'is-pending' : ''}`}
            aria-label="AIで追加"
            aria-busy={aiAdd.isPending || undefined}
            onClick={submitWithAi}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            whileTap={{ scale: 0.85 }}
            transition={{ type: 'spring', stiffness: 600, damping: 30 }}
          >
            <Sparkles size={18} />
          </motion.button>
        )}
        {text.trim() && (
          <motion.button
            key="send"
            type="submit"
            className="composer-send"
            aria-label="追加"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            whileTap={{ scale: 0.85 }}
            transition={{ type: 'spring', stiffness: 600, damping: 30 }}
          >
            <ArrowUp size={18} />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.form>
  );
}
