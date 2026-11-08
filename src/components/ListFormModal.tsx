import { motion } from 'motion/react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation } from 'wouter';
import type { List } from '../api';
import { COVER_COUNT, coverUrl } from '../format';
import { useCreateList, useUpdateList } from '../hooks';
import { Carousel } from './Carousel';
import { Modal } from './Modal';
import { useToast } from './Toast';

export type ListModalState = { mode: 'create' } | { mode: 'edit'; list: List } | null;

export function ListFormModal({ state, onClose }: { state: ListModalState; onClose: () => void }) {
  return (
    <Modal
      open={state !== null}
      onClose={onClose}
      title={state?.mode === 'edit' ? 'リストを編集' : '新しいリスト'}
      initialFocus="list-name"
      footer={
        <>
          <motion.button type="button" className="btn btn-secondary" onClick={onClose} whileTap={{ scale: 0.96 }}>
            キャンセル
          </motion.button>
          <motion.button type="submit" form="list-form" className="btn btn-primary" whileTap={{ scale: 0.96 }}>
            {state?.mode === 'edit' ? '保存' : '作成'}
          </motion.button>
        </>
      }
    >
      {state && <ListForm state={state} onDone={onClose} />}
    </Modal>
  );
}

function ListForm({ state, onDone }: { state: NonNullable<ListModalState>; onDone: () => void }) {
  const editing = state.mode === 'edit' ? state.list : null;
  const [name, setName] = useState(editing?.name ?? '');
  const [cover, setCover] = useState(editing?.cover ?? Math.floor(Math.random() * COVER_COUNT));
  const [invalid, setInvalid] = useState(false);
  const create = useCreateList();
  const update = useUpdateList();
  const [, navigate] = useLocation();
  const toast = useToast();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      setInvalid(true);
      document.getElementById('list-name')?.focus();
      return;
    }
    if (editing) {
      update.mutate(
        { id: editing.id, name: n, cover },
        { onError: () => toast({ message: '保存できませんでした', tone: 'error' }) },
      );
      onDone();
    } else {
      create.mutate(
        { name: n, cover },
        {
          onSuccess: ({ list }) => {
            onDone();
            navigate(`/lists/${list.id}`);
          },
          onError: () => toast({ message: '作成できませんでした', tone: 'error' }),
        },
      );
    }
  };

  return (
    <form id="list-form" className="list-form" onSubmit={submit} noValidate>
      <label className="field-label" htmlFor="list-name">
        名前
      </label>
      <input
        id="list-name"
        className={`text-input ${invalid ? 'is-invalid' : ''}`}
        value={name}
        maxLength={60}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? 'list-name-error' : undefined}
        onChange={(e) => {
          setName(e.target.value);
          setInvalid(false);
        }}
      />
      {invalid && (
        <p id="list-name-error" className="field-error" role="alert">
          名前を入力してください
        </p>
      )}
      <span className="field-label" id="cover-label">
        カバー画像
      </span>
      <Carousel
        variant="picker"
        label="カバー画像"
        initialIndex={cover}
        onIndexChange={setCover}
        slides={Array.from({ length: COVER_COUNT }, (_, i) => ({
          key: String(i),
          image: coverUrl(i),
          label: `カバー ${i + 1}`,
        }))}
      />
    </form>
  );
}
