import type { ReactNode } from 'react';

/** Number badge used for the numbered steps on the Capture page. */
export function StepBadge({ n }: { n: number }) {
  return (
    <span aria-hidden="true" className="font-num inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-on shadow-glow">
      {n}
    </span>
  );
}

/** A numbered step: badge, title, optional text, and the content underneath. */
export function Step({ n, title, text, children }: { n: number; title: string; text?: ReactNode; children?: ReactNode }) {
  return (
    <li className="flex gap-3">
      <StepBadge n={n} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">
          <span className="sr-only">Step {n}: </span>
          {title}
        </p>
        {text && <p className="mt-0.5 text-sm text-fg-muted">{text}</p>}
        {children && <div className="mt-3">{children}</div>}
      </div>
    </li>
  );
}
