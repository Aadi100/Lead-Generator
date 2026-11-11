"use client";

import { useState } from 'react';
import { Button, Kbd, Modal, Textarea } from '@/components/ui';
import { XIcon } from '@/components/Icons';

/** Floating bar shown while rows are ticked. Sits above the phone tab bar. */
export function BulkBar({
  count,
  busy,
  onPitched,
  onIgnore,
  onRestore,
  onNote,
  onClear,
}: {
  count: number;
  busy: boolean;
  onPitched: () => void;
  onIgnore: () => void;
  onRestore: () => void;
  onNote: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-center px-3 md:bottom-6" role="region" aria-label="Actions for selected leads">
      <div className="glass-strong pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-card px-3 py-2 shadow-float animate-pop">
        <span className="font-num px-1 text-sm font-medium text-fg" aria-live="polite">
          {count} selected
        </span>
        <Button variant="primary" onClick={onPitched} disabled={busy} className="coarse:min-h-11">
          Mark pitched
        </Button>
        <Button onClick={onIgnore} disabled={busy} className="coarse:min-h-11">
          Ignore
        </Button>
        <Button onClick={onRestore} disabled={busy} className="coarse:min-h-11">
          Restore
        </Button>
        <Button onClick={onNote} disabled={busy} className="coarse:min-h-11">
          Add note
        </Button>
        <Button variant="ghost" onClick={onClear} leftIcon={<XIcon className="h-4 w-4" />} className="coarse:min-h-11">
          Clear
        </Button>
      </div>
    </div>
  );
}

export function BulkNoteModal({ open, count, onClose, onSave }: { open: boolean; count: number; onClose: () => void; onSave: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a note to the selected leads"
      description={`The note is added to the end of the existing notes on ${count} lead${count === 1 ? '' : 's'}.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!text.trim()}
            onClick={() => {
              onSave(text.trim());
              setText('');
            }}
          >
            Add note
          </Button>
        </>
      }
    >
      <label htmlFor="bulk-note" className="sr-only">
        Note
      </label>
      <Textarea id="bulk-note" data-autofocus rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: waiting on their budget, call next week" />
    </Modal>
  );
}

const SHORTCUTS: [string, string][] = [
  ['j / k', 'Move down / up the list'],
  ['Enter', 'Open the highlighted lead'],
  ['x', 'Tick or untick the highlighted lead'],
  ['p', 'Mark the highlighted (or ticked) leads as pitched'],
  ['e', 'Ignore the highlighted (or ticked) leads'],
  ['/', 'Search'],
  ['Esc', 'Close the lead panel'],
  ['?', 'Show this list'],
];

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" size="sm">
      <dl className="space-y-2">
        {SHORTCUTS.map(([k, d]) => (
          <div key={k} className="flex items-center justify-between gap-4">
            <dd className="text-sm text-fg-muted">{d}</dd>
            <dt className="shrink-0">
              {k.split(' / ').map((p, i) => (
                <span key={p}>
                  {i > 0 && <span className="px-1 text-fg-subtle">/</span>}
                  <Kbd>{p}</Kbd>
                </span>
              ))}
            </dt>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
