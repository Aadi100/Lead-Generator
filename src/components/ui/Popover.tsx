"use client";

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { cx } from './cx';
import { usePresence } from './Motion';

type TriggerProps = {
  ref: Ref<HTMLButtonElement>;
  onClick: () => void;
  'aria-expanded': boolean;
  'aria-haspopup': 'menu' | 'dialog';
  'aria-controls': string;
};

/** Anchored panel for menus and small forms. Closes on outside click and Escape, then returns focus to the trigger. */
export function Popover({
  trigger,
  children,
  align = 'end',
  placement = 'bottom',
  width = 'w-72',
  role = 'dialog',
  label,
  className,
}: {
  trigger: (props: TriggerProps & { open: boolean }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'start' | 'end';
  placement?: 'bottom' | 'top-start';
  width?: string;
  role?: 'menu' | 'dialog';
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  const { mounted, closing } = usePresence(open, 120);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const origin = placement === 'top-start' ? 'origin-bottom-left' : align === 'end' ? 'origin-top-right' : 'origin-top-left';
  const pos = placement === 'top-start' ? 'bottom-full mb-2 left-0' : cx('top-full mt-2', align === 'end' ? 'right-0' : 'left-0');

  return (
    <div ref={wrap} className="relative">
      {trigger({ ref: btn, onClick: () => setOpen((v) => !v), 'aria-expanded': open, 'aria-haspopup': role, 'aria-controls': id, open })}
      {mounted && (
        <div
          id={id}
          role={role}
          aria-label={label}
          className={cx(closing ? 'animate-pop-out' : 'animate-pop', origin, 'absolute z-40 max-w-[calc(100vw-1.5rem)] rounded-card border border-border bg-surface text-sm text-fg shadow-float', pos, width, className)}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}

const ITEM = 'btn flex w-full cursor-pointer items-center gap-2.5 rounded-ctl px-2.5 py-1.5 text-left text-sm text-fg transition-colors duration-fast hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50';

export function MenuItem({
  children,
  onClick,
  href,
  icon,
  selected,
  danger,
  disabled,
  hint,
}: {
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  href?: string;
  icon?: ReactNode;
  selected?: boolean;
  danger?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  const cls = cx(ITEM, danger && 'text-danger', selected && 'bg-surface-2 font-medium');
  const inner = (
    <>
      {icon && <span className={cx('shrink-0', danger ? 'text-danger' : 'text-fg-subtle')}>{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-xs text-fg-subtle">{hint}</span>}
    </>
  );
  if (href) {
    return (
      <Link href={href} role="menuitem" onClick={onClick} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" role="menuitem" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="px-2.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{children}</p>;
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-border" />;
}
