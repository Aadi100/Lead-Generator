"use client";

import { Badge, Popover, type Tone } from '@/components/ui';
import { InfoIcon } from '@/components/Icons';
import { SOURCE_RULES, type SourceStatus } from '@/lib/sources-model';

export const STATUS_LABEL: Record<SourceStatus, string> = {
  healthy: 'Working',
  quiet: 'Quiet',
  needs_key: 'Needs a key',
  off: 'Off',
  problem: 'Not working',
};

const TONE: Record<SourceStatus, Tone> = { healthy: 'success', quiet: 'info', needs_key: 'warning', off: 'neutral', problem: 'danger' };

export function StatusChip({ status, reason }: { status: SourceStatus; reason: string }) {
  return (
    <Badge tone={TONE[status]} dot title={reason}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/** Explains how each status is decided. */
export function StatusRules() {
  return (
    <Popover
      label="How statuses are decided"
      align="start"
      width="w-[22rem] max-w-[calc(100vw-2rem)]"
      trigger={({ open: _open, ...p }) => (
        <button {...p} type="button" className="btn inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-ctl px-2 text-[13px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">
          <InfoIcon className="h-4 w-4" />
          How statuses work
        </button>
      )}
    >
      <div className="p-3.5 text-[13px] leading-relaxed text-fg-muted">
        <p className="mb-2 font-semibold text-fg">How a source gets its status</p>
        <ul className="space-y-1.5">
          {SOURCE_RULES.map((r) => {
            const [head, ...rest] = r.split(': ');
            return (
              <li key={head}>
                <span className="font-semibold text-fg">{head}.</span> {rest.join(': ')}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-fg-subtle">Checks refresh every 20 seconds. Hover a status to see why.</p>
      </div>
    </Popover>
  );
}
