"use client";

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '../Icons';
import { cx } from './cx';
import { IconButton } from './Button';
import { usePresence } from './Motion';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/** Keeps focus inside `ref` while active, closes on Escape, locks page scroll, and returns focus on close. */
export function useOverlay(ref: React.RefObject<HTMLElement>, active: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const first = root ? focusables(root).find((el) => el.dataset.autofocus !== undefined) ?? focusables(root)[0] : null;
    (first ?? root)?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;
      const list = focusables(ref.current);
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, [active, ref]);
}

type OverlayProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  hideTitle?: boolean;
};

function Shell({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  hideTitle,
  panelClass,
  enter,
  exit,
  align,
  exitMs,
}: OverlayProps & { panelClass: string; enter: string; exit: string; align: string; exitMs: number }) {
  const { mounted, closing } = usePresence(open, exitMs);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useOverlay(panelRef, mounted && !closing, onClose);
  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div className={cx('fixed inset-0 z-50 flex', align)}>
      <div className={cx('absolute inset-0', closing ? 'animate-fade-out' : 'animate-fade-in')} style={{ backgroundColor: 'rgb(var(--backdrop))' }} onMouseDown={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hideTitle ? undefined : titleId}
        aria-label={hideTitle ? title : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx('relative flex max-h-full flex-col overflow-hidden border border-border bg-surface shadow-float outline-none', panelClass, closing ? exit : enter)}
      >
        <header className={cx('flex items-start justify-between gap-3 border-b border-border px-4 py-3', hideTitle && 'sr-only')}>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-[13px] text-fg-subtle">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Close" onClick={onClose} size="sm">
            <XIcon className="h-4 w-4" />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-2 px-4 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

const MODAL_SIZE = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' } as const;

/** Centered dialog for short tasks (confirm, create). Prefer Drawer for anything that edits a record. */
export function Modal({ size = 'md', ...props }: OverlayProps & { size?: keyof typeof MODAL_SIZE }) {
  return <Shell {...props} align="items-center justify-center p-4" panelClass={cx('w-full rounded-card', MODAL_SIZE[size])} enter="animate-pop" exit="animate-pop-out" exitMs={120} />;
}

/** Side panel (right/left) or bottom sheet. Focus is trapped, Escape closes, focus returns to the opener. */
export function Drawer({ side = 'right', width = 'max-w-[560px]', ...props }: OverlayProps & { side?: 'right' | 'left' | 'bottom'; width?: string }) {
  if (side === 'bottom') {
    return <Shell {...props} align="items-end justify-center" panelClass="w-full max-h-[88vh] rounded-t-card" enter="animate-slide-up" exit="animate-slide-down" exitMs={170} />;
  }
  return (
    <Shell
      {...props}
      align={side === 'left' ? 'justify-start' : 'justify-end'}
      panelClass={cx('h-full w-full', width, side === 'left' ? 'border-l-0' : 'border-r-0')}
      enter="animate-slide-in-right"
      exit="animate-slide-out-right"
      exitMs={170}
    />
  );
}
