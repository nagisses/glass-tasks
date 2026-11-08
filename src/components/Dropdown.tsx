import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Check, ChevronDown } from './Icons';

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface Props<T extends string> {
  /** Accessible name of the control */
  label: string;
  value: T | undefined;
  options: DropdownOption<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  /** Button content override (e.g. compact chip) */
  renderValue?: (o: DropdownOption<T> | undefined) => ReactNode;
  className?: string;
  align?: 'start' | 'end';
  disabled?: boolean;
}

/** Pull-down select: press to show the options as a list below (flips upward near the screen bottom). */
export function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  renderValue,
  className,
  align = 'start',
  disabled,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const uid = useId();
  const selected = options.find((o) => o.value === value);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const needed = Math.min(options.length * 46 + 16, 300);
    setUp(below < needed && r.top > below);
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const openList = () => {
    if (disabled) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const choose = (i: number) => {
    const o = options[i];
    if (o) onChange(o.value);
    setOpen(false);
    btnRef.current?.focus({ preventScroll: true });
  };

  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openList();
    }
  };

  const onListKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      btnRef.current?.focus({ preventScroll: true });
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className={`dropdown ${className ?? ''}`} ref={rootRef} data-open={open || undefined}>
      <motion.button
        ref={btnRef}
        type="button"
        className="dropdown-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${uid}-list` : undefined}
        aria-label={`${label}: ${selected?.label ?? placeholder ?? ''}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onButtonKey}
        whileTap={{ scale: 0.96 }}
        disabled={disabled}
      >
        {renderValue ? (
          renderValue(selected)
        ) : (
          <>
            {selected?.icon}
            <span className="dropdown-value">{selected?.label ?? placeholder}</span>
          </>
        )}
        <motion.span className="dropdown-chevron" animate={{ rotate: open ? 180 : 0 }}>
          <ChevronDown size={14} />
        </motion.span>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.ul
            ref={listRef}
            id={`${uid}-list`}
            role="listbox"
            aria-label={label}
            tabIndex={-1}
            aria-activedescendant={`${uid}-opt-${active}`}
            className={`dropdown-list glass ${up ? 'is-up' : ''} align-${align}`}
            onKeyDown={onListKey}
            initial={{ opacity: 0, scale: 0.92, y: up ? 8 : -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: up ? 6 : -6, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 600, damping: 34 }}
          >
            {options.map((o, i) => (
              <motion.li
                key={o.value}
                id={`${uid}-opt-${i}`}
                role="option"
                aria-selected={o.value === value}
                className={`dropdown-option ${i === active ? 'is-active' : ''}`}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(i)}
                initial={{ opacity: 0, y: up ? 4 : -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.015 * i }}
              >
                {o.icon}
                <span className="dropdown-option-label">{o.label}</span>
                {o.value === value && <Check size={16} className="dropdown-check" />}
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
