"use client";

import { Badge, type Tone } from '@/components/ui';

const TRUST: Record<string, { text: string; tone: Tone }> = {
  High: { text: 'Looks real', tone: 'success' },
  Medium: { text: 'Check first', tone: 'warning' },
  Low: { text: 'Be careful', tone: 'danger' },
};

/** Plain-words trust tag: Looks real / Check first / Be careful. The number is only in the tooltip. */
export function PlainTrust({ level, score, suspicious }: { level: string | null; score?: number | null; suspicious?: boolean }) {
  const t = suspicious ? { text: 'Be careful', tone: 'danger' as Tone } : level ? TRUST[level] : undefined;
  if (!t) return <Badge>Not checked</Badge>;
  return (
    <Badge tone={t.tone} title={`${level ?? 'Not scored'}${score != null ? ` (${score}/100)` : ''}`}>
      {t.text}
    </Badge>
  );
}
