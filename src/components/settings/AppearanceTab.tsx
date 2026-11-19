"use client";

import Advanced from './Advanced';
import type { ReactNode } from 'react';
import { useTheme, type Theme } from '@/components/theme/ThemeProvider';
import { MonitorIcon, MoonIcon, SunIcon } from '../Icons';
import { Card, cx } from '../ui';
import AppNotificationsCard from './AppNotificationsCard';

const OPTIONS: { id: Theme; label: string; hint: string; icon: ReactNode }[] = [
  { id: 'light', label: 'Light', hint: 'Bright and airy', icon: <SunIcon className="h-5 w-5" /> },
  { id: 'dark', label: 'Dark', hint: 'Easy on the eyes at night', icon: <MoonIcon className="h-5 w-5" /> },
  { id: 'system', label: 'System', hint: 'Follows your device', icon: <MonitorIcon className="h-5 w-5" /> },
];

export default function AppearanceTab() {
  const { theme, resolved, setTheme } = useTheme();
  return (
    <div className="space-y-4">
      <Card title="Theme" subtitle="Your choice is remembered on this device.">
        <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
          {OPTIONS.map((o) => {
            const on = theme === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={(e) => setTheme(o.id, { x: e.clientX, y: e.clientY })}
                className={cx(
                  'ctl flex min-h-[4.5rem] cursor-pointer items-center gap-3 rounded-card border p-3 text-left transition-colors duration-fast',
                  on ? 'border-primary-border bg-primary-soft ring-1 ring-primary-border' : 'border-border bg-surface-2/60 hover:border-border-strong',
                )}
              >
                <span className={cx('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full', on ? 'bg-primary text-primary-on' : 'bg-surface text-fg-muted ring-1 ring-inset ring-border')}>{o.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-fg">{o.label}</span>
                  <span className="block text-sm text-fg-subtle">{o.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-fg-subtle" aria-live="polite">
          Showing the {resolved} look right now.
        </p>
      </Card>

      <AppNotificationsCard />

      <Advanced id="appearance" title="Show about the glass look" className="!mt-2">
      <Card title="About the glass look">
        <div className="space-y-2 text-sm text-fg-muted">
          <p>
            Panels are slightly see-through and blur what is behind them, like frosted glass. Behind everything sits a slow, soft colour glow (the aurora) that gives the glass something to catch.
          </p>
          <p>
            It is only decoration. Text always keeps strong contrast, and the glow moves only transform and opacity, so it stays smooth. If your device asks for reduced motion or reduced transparency, the glow
            stops and panels become solid automatically.
          </p>
        </div>
      </Card>
      </Advanced>
    </div>
  );
}
