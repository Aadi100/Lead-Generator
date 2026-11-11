import type { ReactNode } from 'react';
import { cx } from './cx';

/** Scroll container + table. Wide tables scroll sideways inside the card, never the page. */
export function Table({ children, caption, maxHeight, className }: { children: ReactNode; caption?: string; maxHeight?: number | string; className?: string }) {
  return (
    <div className={cx('overflow-auto rounded-card border border-border bg-surface', className)} style={{ maxHeight }}>
      <table className="w-full border-collapse text-[13px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="sticky top-0 z-10 bg-surface-2 text-left text-xs font-semibold text-fg-subtle shadow-[0_1px_0_rgb(var(--border))]">{children}</thead>;
}

export function Th({
  children,
  sort,
  onSort,
  align = 'left',
  className,
}: {
  children: ReactNode;
  sort?: 'asc' | 'desc' | null;
  onSort?: () => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  const a = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <th scope="col" aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : onSort ? 'none' : undefined} className={cx('whitespace-nowrap px-3 py-2', a, className)}>
      {onSort ? (
        <button type="button" onClick={onSort} className="btn inline-flex cursor-pointer items-center gap-1 font-semibold hover:text-fg">
          {children}
          <span aria-hidden="true" className={cx('text-[10px]', sort ? 'text-primary-text' : 'text-fg-subtle/60')}>
            {sort === 'asc' ? '▲' : sort === 'desc' ? '▼' : '↕'}
          </span>
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function Tr({ children, selected, onClick, className }: { children: ReactNode; selected?: boolean; onClick?: () => void; className?: string }) {
  return (
    <tr
      onClick={onClick}
      className={cx('border-t border-border transition-colors duration-fast', selected ? 'bg-primary-soft' : 'hover:bg-surface-2', onClick && 'cursor-pointer', className)}
    >
      {children}
    </tr>
  );
}

export function Td({ children, align = 'left', numeric, className }: { children?: ReactNode; align?: 'left' | 'right' | 'center'; numeric?: boolean; className?: string }) {
  const a = align === 'right' || numeric ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return <td className={cx('px-3 py-2 align-middle', a, numeric && 'font-num', className)}>{children}</td>;
}
