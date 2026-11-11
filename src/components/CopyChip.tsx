"use client";

import { useState } from 'react';
import { copyText } from '@/lib/clipboard';
import { isHttpUrl } from '@/lib/format';
import { CheckIcon, CopyIcon } from './Icons';

export default function CopyChip({ label, value }: { label: string | null; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (await copyText(value)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-ctl border border-border bg-surface-2/70 py-0.5 pl-2 pr-0.5 text-sm text-fg-muted">
      {label && <span className="text-xs text-fg-subtle">{label}</span>}
      {isHttpUrl(value) ? (
        <a href={value} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-primary-text underline-offset-2 hover:underline">
          {value}
        </a>
      ) : (
        <span className="min-w-0 break-all">{value}</span>
      )}
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : `Copy ${value}`}
        className="btn inline-flex shrink-0 cursor-pointer items-center justify-center rounded-ctl p-1.5 text-fg-subtle transition-colors duration-fast hover:bg-border hover:text-fg coarse:p-3"
      >
        {copied ? <CheckIcon className="h-4 w-4 text-success" /> : <CopyIcon className="h-4 w-4" />}
      </button>
    </span>
  );
}
