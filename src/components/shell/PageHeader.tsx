import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRightIcon } from '@/components/Icons';
import { EmptyState, cx } from '@/components/ui';

/** Page wrapper: consistent side padding and max width inside the shell. width: wide 1440 (default), narrow 960, full. */
export function PageContainer({ children, width = 'wide', className }: { children: ReactNode; width?: 'wide' | 'narrow' | 'full'; className?: string }) {
  return (
    <div className={cx('w-full px-4 py-5 sm:px-6 lg:px-8', width !== 'narrow' && 'mx-auto', width === 'wide' && 'max-w-[1440px]', width === 'narrow' && 'max-w-[960px]', className)}>{children}</div>
  );
}

/** The one h1 of a page. Put primary actions in `actions` (they wrap under the title on phones). */
export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  className?: string;
}) {
  return (
    <header className={cx('mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3', className)}>
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1">
            <ol className="flex flex-wrap items-center gap-1 text-[13px] text-fg-subtle">
              {breadcrumbs.map((b, i) => (
                <li key={`${b.label}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <ChevronRightIcon className="h-3 w-3" />}
                  {b.href ? (
                    <Link href={b.href} className="hover:text-fg hover:underline">
                      {b.label}
                    </Link>
                  ) : (
                    <span aria-current="page">{b.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="text-xl font-semibold text-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 max-w-2xl text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Temporary body for a module that its owner has not built yet. Replace it with the real page content. */
export function ComingTogether({ title, subtitle, icon, children }: { title: string; subtitle: string; icon?: ReactNode; children?: ReactNode }) {
  return (
    <PageContainer>
      <PageHeader title={title} subtitle={subtitle} />
      <EmptyState icon={icon} title="Coming together" text={`${title} is being built. Its links, badges and shortcuts already work, so nothing else needs to change when it lands.`} action={children} />
    </PageContainer>
  );
}
