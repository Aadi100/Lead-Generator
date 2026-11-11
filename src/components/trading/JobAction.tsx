"use client";

import { useEffect, useState, type ReactNode } from 'react';
import { useShell } from '@/components/AppShell';
import { Button, JobNote, type ButtonVariant } from '@/components/ui';
import { useJob } from '@/lib/jobs';
import type { JobType } from '@/lib/types';

/** Button that queues a worker job, shows progress while it runs and reports the result with a toast. */
export default function JobAction({
  type,
  label,
  runningText,
  icon,
  variant = 'secondary',
  successText,
  onDone,
  beforeStart,
  className,
}: {
  type: JobType;
  label: string;
  runningText: string;
  icon?: ReactNode;
  variant?: ButtonVariant;
  successText: (result: Record<string, unknown> | null) => string;
  onDone?: () => void;
  beforeStart?: () => Promise<boolean>;
  className?: string;
}) {
  const { pushToast } = useShell();
  const job = useJob();
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (!job.running) {
      setSecs(0);
      return;
    }
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [job.running]);

  const run = async () => {
    if (beforeStart && !(await beforeStart())) return;
    const out = await job.start(type, {});
    if (out.phase === 'done') pushToast('success', successText(out.result));
    else pushToast('error', out.error ?? 'That did not finish. Check that the worker is running.');
    onDone?.();
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Button variant={variant} loading={job.running} leftIcon={icon} onClick={() => void run()}>
          {label}
        </Button>
        {job.running && (
          <span className="text-sm text-fg-muted" role="status">
            {runningText} <span className="font-num text-fg-subtle">{secs}s</span>
          </span>
        )}
        {!job.running && <JobNote phase={job.phase} error={job.error} runningText={runningText} />}
      </div>
      {job.running && (
        <div className="mt-2 h-1 w-full max-w-xs overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
        </div>
      )}
    </div>
  );
}
