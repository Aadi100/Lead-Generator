"use client";

import { useEffect, useState } from 'react';
import { CATEGORIES, STATUSES, type SortKey, type StatusTab, type TrustFilter } from '@/lib/types';
import type { LeadsKind, LeadsState, LeadsView } from '@/lib/leads-query';
import { Button, Chip, Kbd, Popover, SegmentedControl, Select, Tabs, cx } from '@/components/ui';
import { FilterIcon, GridIcon, ListIcon, SearchIcon, XIcon } from './Icons';

const TRUST_OPTIONS: { value: TrustFilter; label: string }[] = [
  { value: 'All', label: 'Any' },
  { value: 'High', label: 'Looks real' },
  { value: 'Medium', label: 'Check first' },
  { value: 'Low', label: 'Be careful' },
  { value: 'Suspicious', label: 'Only the ones to be careful with' },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'fit', label: 'Best match first' },
  { value: 'newest', label: 'Newest first' },
  { value: 'trust', label: 'Most trustworthy' },
  { value: 'budget', label: 'Biggest budget' },
];

export type FilterBarProps = {
  state: LeadsState;
  onChange: (patch: Partial<LeadsState>) => void;
  sources: string[];
  statusCounts: Record<StatusTab, number>;
  kindCounts: Record<LeadsKind, number>;
  hasActive: boolean;
  onClear: () => void;
  searchRef: React.RefObject<HTMLInputElement>;
};

/** Sticky toolbar: lead kind, search, filters popover, sort, view toggle and status tabs with counts. */
export default function FilterBar({ state, onChange, sources, statusCounts, kindCounts, hasActive, onClear, searchRef }: FilterBarProps) {
  const [q, setQ] = useState(state.q);

  useEffect(() => {
    setQ(state.q);
  }, [state.q]);

  useEffect(() => {
    if (q === state.q) return;
    const t = setTimeout(() => onChange({ q }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filterCount = (state.category !== 'All' ? 1 : 0) + (state.source !== 'All' ? 1 : 0) + (state.trust !== 'All' ? 1 : 0);

  return (
    <section aria-label="Filters" className="glass rounded-card p-3">
      <div className="relative w-full">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
          <label htmlFor="lead-search" className="sr-only">
            Search leads
          </label>
          <input
            id="lead-search"
            ref={searchRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by title, company or person"
            className="ctl w-full rounded-ctl border border-border-strong bg-surface py-1.5 pl-8 pr-8 text-sm text-fg placeholder:text-fg-subtle coarse:min-h-11"
          />
          <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 lg:block">{!q && <Kbd>/</Kbd>}</span>
        </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <div className="max-w-full overflow-x-auto">
        <SegmentedControl<LeadsKind>
          label="Kind of lead"
          value={state.kind}
          onChange={(kind) => onChange({ kind, source: 'All', category: 'All' })}
          options={[
            { id: 'all', label: 'All', count: kindCounts.all },
            { id: 'request', label: 'People asking', count: kindCounts.request },
            { id: 'prospect', label: 'Local prospects', count: kindCounts.prospect },
          ]}
        />
        </div>
        <Popover
          label="Filters"
          align="end"
          width="w-80"
          trigger={({ open: _open, ...p }) => (
            <Button {...p} variant="secondary" leftIcon={<FilterIcon className="h-4 w-4" />} className="coarse:min-h-11">
              Filters
              {filterCount > 0 && <span className="font-num rounded-full bg-primary px-1.5 text-xs text-primary-on">{filterCount}</span>}
            </Button>
          )}
        >
          <div className="space-y-4 p-3.5">
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-fg">What they want</p>
              <div className="flex flex-wrap gap-1.5">
                {(['All', ...CATEGORIES] as const).map((c) => (
                  <Chip key={c} selected={state.category === c} onClick={() => onChange({ category: c })}>
                    {c === 'All' ? 'All categories' : c}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="filter-source" className="mb-1 block text-[13px] font-medium text-fg">
                Where it was found
              </label>
              <Select id="filter-source" value={state.source} onChange={(e) => onChange({ source: e.target.value })}>
                <option value="All">All sources</option>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="filter-trust" className="mb-1 block text-[13px] font-medium text-fg">
                Can I trust it?
              </label>
              <Select id="filter-trust" value={state.trust} onChange={(e) => onChange({ trust: e.target.value as TrustFilter })}>
                {TRUST_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            {hasActive && (
              <Button variant="ghost" onClick={onClear} leftIcon={<XIcon className="h-4 w-4" />}>
                Clear all filters
              </Button>
            )}
          </div>
        </Popover>
        <div className="w-[11rem]">
          <label htmlFor="lead-sort" className="sr-only">
            Sort by
          </label>
          <Select id="lead-sort" value={state.sort} onChange={(e) => onChange({ sort: e.target.value as SortKey })} className="coarse:min-h-11">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <SegmentedControl<LeadsView>
          label="View"
          value={state.view}
          onChange={(view) => onChange({ view })}
          options={[
            { id: 'list', label: 'List', icon: <ListIcon className="h-4 w-4" aria-hidden="true" /> },
            { id: 'cards', label: 'Cards', icon: <GridIcon className="h-4 w-4" aria-hidden="true" /> },
          ]}
        />
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <div className="min-w-0 flex-1 overflow-x-auto pb-0.5" style={{ WebkitMaskImage: 'linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 28px), transparent 100%)', maskImage: 'linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 28px), transparent 100%)' }}>
        <Tabs<StatusTab>
          variant="pill"
          label="Status"
          active={state.status}
          onChange={(status) => onChange({ status })}
          className="!flex-nowrap w-max px-2 [&>*]:shrink-0 [&>*]:whitespace-nowrap"
          tabs={([...STATUSES, 'All'] as StatusTab[]).map((s) => ({ id: s, label: s, count: statusCounts[s] }))}
        />
        </div>
        {hasActive && (
          <button type="button" onClick={onClear} className="btn ml-auto inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1 rounded-ctl px-2 text-[13px] font-medium text-fg-subtle hover:bg-surface-2 hover:text-fg">
            <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Clear
          </button>
        )}
      </div>
    </section>
  );
}
