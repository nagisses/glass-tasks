import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { COVER_TINT } from '../format';
import { ApiError } from '../api';
import { LIST_TOKEN, suggest } from '../autocomplete';
import type { Suggestion } from '../autocomplete';
import { useAiQuickAdd, useCreateTask, useFeatures, useLists, useTasks } from '../hooks';
import { load, save } from '../storage';
import { Dropdown } from './Dropdown';
import { ArrowUp, Clock, Sparkles } from './Icons';
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

  // ----- autocomplete: past task titles, or lists after "#" -----
  const allTasks = useTasks();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const listboxId = useId();
  const suggestions = useMemo(() => suggest(text, allTasks.data, lists.data), [text, allTasks.data, lists.data]);
  const suggestOpen = focused && !dismissed && suggestions.length > 0 && !aiAdd.isPending;
  const edit = (v: string) => {
    setText(v);
    setDismissed(false);
    setActive(-1);
  };
  const choose = (sg: Suggestion) => {
    if (sg.kind === 'list') {
      setChosen(sg.list.id);
      setText(text.replace(LIST_TOKEN, '').trimEnd());
    } else {
      setText(sg.label);
    }
    setDismissed(true);
    setActive(-1);
    inputRef.current?.focus({ preventScroll: true });
  };

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
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      if (e.key === 'Enter') e.preventDefault();
      return;
    }
    if (!suggestOpen) return;
    const n = suggestions.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0 && active < n) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDismissed(true);
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
      <AnimatePresence>
        {suggestOpen && (
          <motion.ul
            key="suggest"
            id={listboxId}
            role="listbox"
            aria-label="候補"
            className="autocomplete glass"
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 560, damping: 36 }}
          >
            {suggestions.map((sg, i) => (
              <li
                key={sg.key}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`autocomplete-option ${i === active ? 'is-active' : ''}`}
                // Keep focus in the input so the keyboard stays open on phones
                onPointerDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(sg)}
              >
                {sg.kind === 'list' ? (
                  <span className="list-dot" style={{ background: COVER_TINT[sg.list.cover] }} />
                ) : (
                  <span className="autocomplete-icon" aria-hidden="true">
                    <Clock size={15} />
                  </span>
                )}
                <span className="autocomplete-label">
                  <Highlight text={sg.label} query={sg.kind === 'list' ? (text.match(LIST_TOKEN)?.[1] ?? '') : text} />
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
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
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={suggestOpen}
        aria-controls={suggestOpen ? listboxId : undefined}
        aria-activedescendant={suggestOpen && active >= 0 ? `${listboxId}-${active}` : undefined}
        value={text}
        onChange={(e) => edit(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
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

/** Bold the part of a suggestion that matches what was typed (plain substring match only). */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}
