// Client-side CSV export of a table in chunks of 1000 rows. Read-only.
import { supabase } from '@/lib/supabaseClient';

export type ExportTable = 'leads' | 'outreach' | 'deals' | 'tasks';

export const EXPORT_TABLES: { table: ExportTable; label: string; hint: string }[] = [
  { table: 'leads', label: 'Leads', hint: 'Every lead with its score, status and source.' },
  { table: 'outreach', label: 'Outreach', hint: 'Pitches, follow-ups and their send status.' },
  { table: 'deals', label: 'Deals', hint: 'Deals and their stage and value.' },
  { table: 'tasks', label: 'Tasks', hint: 'Your to-dos and due dates.' },
];

const CHUNK = 1000;
const MAX_ROWS = 100000;

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Stop spreadsheet apps from running a cell as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const lines = [columns.map(cell).join(',')];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c])).join(','));
  return lines.join('\r\n');
}

export async function exportTable(table: ExportTable, onProgress?: (rows: number) => void): Promise<{ csv: string; rows: number; error: string | null }> {
  const all: Record<string, unknown>[] = [];
  const cols = new Set<string>();
  for (let from = 0; from < MAX_ROWS; from += CHUNK) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + CHUNK - 1);
    if (error) return { csv: '', rows: all.length, error: error.message };
    const chunk = (data ?? []) as Record<string, unknown>[];
    for (const r of chunk) {
      Object.keys(r).forEach((k) => cols.add(k));
      all.push(r);
    }
    onProgress?.(all.length);
    if (chunk.length < CHUNK) break;
  }
  const columns = Array.from(cols);
  return { csv: toCsv(all, columns), rows: all.length, error: null };
}

export function downloadCsv(name: string, csv: string) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
