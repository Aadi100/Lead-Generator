"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronIcon, PlusIcon, XIcon } from '../Icons';
import { cx } from './cx';
import { btnSecondary } from './Button';

// Class string for any raw <input>/<textarea>/<select> (also used by older call sites).
export const inputCls =
  'ctl w-full rounded-ctl border border-border-strong bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-fg-subtle transition-colors duration-fast hover:border-fg-subtle disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-subtle';
const invalidCls = '!border-danger focus-visible:!border-danger';

type FieldControl = { invalid?: boolean };

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldControl>(function Input({ invalid, className, ...rest }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cx(inputCls, invalid && invalidCls, className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldControl>(function Textarea({ invalid, className, ...rest }, ref) {
  return <textarea ref={ref} aria-invalid={invalid || undefined} className={cx(inputCls, 'leading-relaxed', invalid && invalidCls, className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldControl>(function Select({ invalid, className, children, ...rest }, ref) {
  return (
    <span className="relative block">
      <select ref={ref} aria-invalid={invalid || undefined} className={cx(inputCls, 'cursor-pointer appearance-none pr-8', invalid && invalidCls, className)} {...rest}>
        {children}
      </select>
      <ChevronIcon className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
    </span>
  );
});

/** Visible label, optional helper and error text. Pass htmlFor (the control's id) so the label is associated. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1 block text-[13px] font-medium text-fg">
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>
      )}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  id,
  tone = 'primary',
  disabled,
  labelledBy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  id?: string;
  tone?: 'primary' | 'danger' | 'accent';
  disabled?: boolean;
  labelledBy?: string;
}) {
  const on = tone === 'danger' ? 'bg-danger-solid' : tone === 'accent' ? 'bg-accent' : 'bg-primary';
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'ctl group relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-base disabled:cursor-not-allowed disabled:opacity-50',
        checked ? on : 'bg-border-strong',
      )}
    >
      <span className={cx('switch-thumb inline-block h-5 w-5 rounded-full bg-white shadow-sm group-active:scale-x-[1.2]', checked ? 'origin-right translate-x-5' : 'origin-left translate-x-0.5')} />
    </button>
  );
}

/** Switch with label and description (kept API: id is required). */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  id,
  tone = 'primary',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  id: string;
  tone?: 'primary' | 'danger' | 'accent' | 'indigo' | 'rose';
}) {
  const t = tone === 'rose' ? 'danger' : tone === 'indigo' ? 'primary' : tone;
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5">
        <Switch id={id} checked={checked} onChange={onChange} labelledBy={`${id}-label`} tone={t} />
      </span>
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-sm font-medium text-fg">
          {label}
        </p>
        {description && <p className="text-xs text-fg-subtle">{description}</p>}
      </div>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  id,
  disabled,
  indeterminate,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  id?: string;
  disabled?: boolean;
  indeterminate?: boolean;
  className?: string;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <label htmlFor={inputId} className={cx('inline-flex cursor-pointer items-center gap-2 text-sm text-fg', disabled && 'cursor-not-allowed opacity-50', className)}>
      <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-checked={indeterminate ? 'mixed' : checked}
          className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-[4px] border border-border-strong bg-surface transition-colors duration-fast checked:border-primary checked:bg-primary hover:border-fg-subtle disabled:cursor-not-allowed"
        />
        {(checked || indeterminate) && (
          <span className="pointer-events-none relative text-primary-on">
            {indeterminate && !checked ? <span className="block h-0.5 w-2 rounded bg-primary-on" /> : <svg key="tick" className="tick-draw h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" pathLength={1} /></svg>}
          </span>
        )}
      </span>
      {label}
    </label>
  );
}

export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  label,
  max,
  lowercase,
}: {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  label: string;
  max?: number;
  lowercase?: boolean;
}) {
  const [text, setText] = useState('');

  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((p) => (lowercase ? p.trim().toLowerCase() : p.trim()))
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value];
    parts.forEach((p) => {
      if (max && next.length >= max) return;
      if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p);
    });
    onChange(next);
    setText('');
  };

  return (
    <div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${label} list`}>
          {value.map((tag) => (
            <li key={tag} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pl-2.5 pr-1 text-[13px] text-fg">
              <span className="min-w-0 break-words">{tag}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((t) => t !== tag))}
                aria-label={`Remove ${tag}`}
                className="ctl inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-fg-subtle transition-colors duration-fast hover:bg-border hover:text-fg"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={cx('flex gap-2', value.length > 0 && 'mt-2')}>
        <input
          id={id}
          aria-label={label}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(text);
            }
          }}
          onBlur={() => add(text)}
          placeholder={placeholder}
          className={inputCls}
        />
        <button type="button" onClick={() => add(text)} className={btnSecondary} aria-label={`Add to ${label}`}>
          <PlusIcon className="h-4 w-4" />
          Add
        </button>
      </div>
    </div>
  );
}

export function RepeatableInput({
  id,
  value,
  onChange,
  placeholder,
  addLabel,
  label,
}: {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  addLabel: string;
  label: string;
}) {
  const rows = value.length === 0 ? [''] : value;
  const update = (i: number, v: string) => onChange(rows.map((r, idx) => (idx === i ? v : r)));
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2">
          <input
            id={i === 0 ? id : undefined}
            aria-label={`${label} ${i + 1}`}
            value={row}
            onChange={(e) => update(i, e.target.value)}
            placeholder={placeholder}
            className={inputCls}
          />
          <button type="button" onClick={() => onChange(rows.filter((_, idx) => idx !== i))} aria-label={`Remove ${label} ${i + 1}`} className={cx(btnSecondary, '!px-2')}>
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...rows, ''])} className={btnSecondary}>
        <PlusIcon className="h-4 w-4" />
        {addLabel}
      </button>
    </div>
  );
}
