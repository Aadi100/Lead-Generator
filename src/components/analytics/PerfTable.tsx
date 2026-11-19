"use client";

import { useMemo, useState } from 'react';
import { Table, THead, Th, Tr, Td, EmptyState } from '@/components/ui';
import { pctText, sortPerf, type PerfKey, type PerfRow } from '@/lib/analytics-data';

const COLS: { key: PerfKey; label: string; numeric?: boolean }[] = [
  { key: 'leads', label: 'Leads', numeric: true },
  { key: 'pitched', label: 'Pitched', numeric: true },
  { key: 'replied', label: 'Replied', numeric: true },
  { key: 'won', label: 'Won', numeric: true },
  { key: 'winRate', label: 'Win rate', numeric: true },
  { key: 'avgTrust', label: 'Looks real (avg)', numeric: true },
];

/** Sortable performance table. A small in-cell bar next to the lead count helps scanning, the number is always printed. */
export default function PerfTable({ rows, nameLabel, caption }: { rows: PerfRow[]; nameLabel: string; caption: string }) {
  const [key, setKey] = useState<PerfKey>('leads');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const sorted = useMemo(() => sortPerf(rows, key, dir), [rows, key, dir]);
  const maxLeads = Math.max(1, ...rows.map((r) => r.leads));
  const sortBy = (k: PerfKey) => {
    if (k === key) setDir(dir === 'desc' ? 'asc' : 'desc');
    else {
      setKey(k);
      setDir(k === 'name' ? 'asc' : 'desc');
    }
  };
  if (rows.length === 0) {
    return <EmptyState title="No leads in this period" text="Leads appear here once the worker has found some in the chosen date range. Try a longer range." />;
  }
  return (
    <Table caption={caption} maxHeight={420}>
      <THead>
        <tr>
          <Th sort={key === 'name' ? dir : null} onSort={() => sortBy('name')}>
            {nameLabel}
          </Th>
          {COLS.map((c) => (
            <Th key={c.key} align="right" sort={key === c.key ? dir : null} onSort={() => sortBy(c.key)}>
              {c.label}
            </Th>
          ))}
        </tr>
      </THead>
      <tbody>
        {sorted.map((r) => (
          <Tr key={r.name}>
            <Td className="max-w-[14rem] break-words font-medium text-fg">{r.name}</Td>
            <Td numeric>
              <span className="inline-flex items-center justify-end gap-2">
                <span aria-hidden="true" className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-surface-2 sm:block">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${(r.leads / maxLeads) * 100}%` }} />
                </span>
                {r.leads}
              </span>
            </Td>
            <Td numeric>{r.pitched}</Td>
            <Td numeric>{r.replied}</Td>
            <Td numeric className={r.won > 0 ? 'font-semibold text-success' : undefined}>
              {r.won}
            </Td>
            <Td numeric>{pctText(r.winRate)}</Td>
            <Td numeric>{r.avgTrust ?? 'n/a'}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
