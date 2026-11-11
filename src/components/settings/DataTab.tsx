"use client";

import { useState } from 'react';
import { EXPORT_TABLES, downloadCsv, exportTable, type ExportTable } from '@/lib/settings-export';
import { useShell } from '../AppShell';
import { CheckIcon, FolderIcon } from '../Icons';
import { Card, Spinner, btnSecondary } from '../ui';

export default function DataTab() {
  const { pushToast } = useShell();
  const [busy, setBusy] = useState<ExportTable | null>(null);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState<Partial<Record<ExportTable, number>>>({});
  const [failed, setFailed] = useState<Partial<Record<ExportTable, string>>>({});

  const run = async (table: ExportTable, label: string) => {
    setBusy(table);
    setProgress(0);
    setFailed((f) => ({ ...f, [table]: undefined }));
    const res = await exportTable(table, setProgress);
    setBusy(null);
    if (res.error) {
      setFailed((f) => ({ ...f, [table]: res.error ?? 'Failed' }));
      pushToast('error', `Could not export ${label.toLowerCase()}: ${res.error}`);
      return;
    }
    if (res.rows === 0) {
      pushToast('info', `There are no ${label.toLowerCase()} to export yet.`);
      return;
    }
    downloadCsv(table, res.csv);
    setDone((d) => ({ ...d, [table]: res.rows }));
    pushToast('success', `Exported ${res.rows.toLocaleString()} ${label.toLowerCase()}.`);
  };

  return (
    <Card title="Export your data" subtitle="Download a spreadsheet (CSV) copy. Big tables are read 1000 rows at a time. This only reads. It never changes or deletes anything.">
      <ul className="divide-y divide-border">
        {EXPORT_TABLES.map((t) => (
          <li key={t.table} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-subtle ring-1 ring-inset ring-border">
              <FolderIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">{t.label}</p>
              <p className="text-xs text-fg-subtle" role="status" aria-live="polite">
                {busy === t.table ? (
                  `Reading… ${progress.toLocaleString()} rows so far`
                ) : failed[t.table] ? (
                  <span className="text-danger">{failed[t.table]}</span>
                ) : done[t.table] !== undefined ? (
                  <span className="inline-flex items-center gap-1">
                    <CheckIcon className="h-3.5 w-3.5 text-success" />
                    Downloaded {done[t.table]?.toLocaleString()} rows
                  </span>
                ) : (
                  t.hint
                )}
              </p>
            </div>
            <button type="button" onClick={() => void run(t.table, t.label)} disabled={busy !== null} className={btnSecondary}>
              {busy === t.table && <Spinner />}
              Download CSV
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
