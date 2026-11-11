"use client";

import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { EyeIcon, EyeOffIcon } from '../Icons';
import { inputCls, cx } from '../ui';

/** Password-style field with a show/hide button. Drop-in for <input type="password" className={inputCls} />. */
const SecretInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { invalid?: boolean }>(function SecretInput(
  { className, invalid, ...rest },
  ref,
) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <input
        ref={ref}
        type={show ? 'text' : 'password'}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        className={cx(inputCls, 'pr-11', invalid && '!border-danger', className)}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide secret' : 'Show secret'}
        aria-pressed={show}
        className="ctl absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-ctl text-fg-subtle transition-colors duration-fast hover:bg-surface-2 hover:text-fg"
      >
        {show ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
      </button>
    </span>
  );
});

export default SecretInput;
