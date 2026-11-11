"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from './cx';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'btn inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-ctl font-medium transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-50';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-on hover:bg-primary-hover active:brightness-95',
  secondary: 'border border-border-strong bg-surface text-fg hover:bg-surface-2 active:bg-border',
  ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg active:bg-border',
  danger: 'border border-danger-border bg-surface text-danger hover:bg-danger-soft',
  dark: 'bg-fg text-canvas hover:opacity-90',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-7 px-2.5 py-1 text-[13px]',
  md: 'min-h-8 px-3 py-1.5 text-sm',
  lg: 'min-h-10 px-4 py-2 text-sm',
};

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra?: string) {
  return cx(BASE, VARIANT[variant], SIZE[size], extra);
}

// Class strings for plain <button className=...> call sites that predate <Button>.
export const btnBase = cx(BASE, SIZE.md);
export const btnPrimary = buttonClass('primary');
export const btnSecondary = buttonClass('secondary');
export const btnDanger = buttonClass('danger');
export const btnDark = buttonClass('dark');
export const btnGhost = buttonClass('ghost');

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, leftIcon, rightIcon, fullWidth, className, disabled, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, cx(fullWidth && 'w-full', loading && 'disabled:!cursor-progress disabled:!opacity-80', className))}
      {...rest}
    >
      {loading ? <Spinner className="spin-in h-4 w-4" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

export type IconButtonProps = Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'children'> & {
  label: string;
  children: ReactNode;
};

// Icon-only buttons always need an accessible name.
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'md', className, children, title, ...rest },
  ref,
) {
  const square = size === 'sm' ? 'h-7 w-7 !px-0' : size === 'lg' ? 'h-10 w-10 !px-0' : 'h-8 w-8 !px-0';
  return (
    <Button ref={ref} variant={variant} size={size} aria-label={label} title={title ?? label} className={cx(square, 'coarse:h-11 coarse:w-11', className)} {...rest}>
      {children}
    </Button>
  );
});
