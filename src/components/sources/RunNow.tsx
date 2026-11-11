"use client";

import { Button } from '@/components/ui';
import { PlayIcon } from '@/components/Icons';
import { useShell } from '@/components/AppShell';
import { useJob } from '@/lib/jobs';
import { summarizeJob, type SourceDef } from '@/lib/sources-model';

/** "Run now" for sources that have a worker job. Shows progress on the button and a toast with the result. */
export function RunNow({ def, disabled, disabledReason, onDone }: { def: SourceDef; disabled?: boolean; disabledReason?: string; onDone: () => void }) {
  const { pushToast } = useShell();
  const job = useJob();
  if (!def.job) return null;
  const { type, label } = def.job;

  const run = async () => {
    pushToast('info', `${def.name}: started. This can take a minute.`);
    const out = await job.start(type, {});
    if (out.phase === 'done') pushToast('success', `${def.name}: ${summarizeJob(type, out.result)}`);
    else pushToast('error', `${def.name}: ${out.error ?? 'The job failed.'}`);
    onDone();
  };

  return (
    <Button
      size="sm"
      variant="secondary"
      loading={job.running}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      leftIcon={job.running ? undefined : <PlayIcon className="h-3.5 w-3.5" />}
      onClick={() => void run()}
      aria-label={`${label}: ${def.name}`}
    >
      {job.running ? 'Running' : label}
    </Button>
  );
}
