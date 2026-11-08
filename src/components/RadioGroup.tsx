import { motion } from 'motion/react';
import { useEffect, useId, useState } from 'react';

interface Option<T extends string> {
  value: T;
  label: string;
  tone?: string;
}

interface Props<T extends string> {
  legend: string;
  name: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  hideLegend?: boolean;
}

/** Segmented control built on native radio inputs (arrow keys, labels and form semantics for free). */
export function RadioGroup<T extends string>({ legend, name, value, options, onChange, hideLegend }: Props<T>) {
  const uid = useId();
  // Local copy so the checked state flips immediately, even if the saved value arrives a tick later
  const [current, setCurrent] = useState(value);
  useEffect(() => {
    setCurrent(value);
  }, [value]);
  return (
    <fieldset className="radio-group">
      <legend className={hideLegend ? 'sr-only' : 'field-label'}>{legend}</legend>
      <div className="segmented">
        {options.map((o) => {
          const checked = o.value === current;
          return (
            <label key={o.value} className={`segment ${checked ? 'is-checked' : ''}`} data-tone={o.tone}>
              <input
                type="radio"
                name={`${name}-${uid}`}
                value={o.value}
                checked={checked}
                onChange={() => {
                  setCurrent(o.value);
                  onChange(o.value);
                }}
              />
              {checked && (
                <motion.span
                  layoutId={`seg-${uid}`}
                  className="segment-pill"
                  transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                />
              )}
              <span className="segment-label">{o.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
