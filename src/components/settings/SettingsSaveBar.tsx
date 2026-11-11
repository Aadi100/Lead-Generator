"use client";

import { CheckIcon } from '../Icons';
import { Spinner, btnPrimary, btnSecondary, cx } from '../ui';

/**
 * Settings save bar. Quiet "All changes saved" line when clean; a sticky floating
 * "Unsaved changes: Discard / Save" bar once something is edited (or saving / failed).
 * Same props as the shared SaveBar so each tab keeps its own save logic.
 */
export default function SettingsSaveBar({
  dirty,
  saving,
  onSave,
  onReset,
  error,
  savedLabel = 'All changes saved',
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
  error?: string | null;
  savedLabel?: string;
}) {
  const active = dirty || saving || !!error;
  if (!active) {
    return (
      <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-fg-subtle" role="status" aria-live="polite">
        <CheckIcon className="h-4 w-4 text-success" />
        {savedLabel}
      </p>
    );
  }
  return (
    <div
      className={cx(
        'glass-strong sticky bottom-[4.75rem] z-20 mt-4 flex flex-wrap items-center gap-3 rounded-card border px-4 py-3 shadow-float md:bottom-4',
        error ? 'border-danger-border' : 'border-warning-border',
      )}
      role="region"
      aria-label="Unsaved changes"
    >
      <p className="min-w-0 flex-1 text-sm" role="status" aria-live="polite">
        {error ? <span className="break-words font-medium text-danger">{error}</span> : <span className="font-medium text-fg">Unsaved changes</span>}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onReset} disabled={saving || !dirty} className={btnSecondary}>
          Discard
        </button>
        <button type="button" onClick={onSave} disabled={!dirty || saving} className={btnPrimary}>
          {saving && <Spinner />}
          Save
        </button>
      </div>
    </div>
  );
}
