"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageContainer, PageHeader } from '@/components/shell';
import { useShell } from '@/components/AppShell';
import { Badge, Banner, Button, CountUp, EmptyState, Input, Reveal, SegmentedControl, Skeleton, SkeletonRows, StatTile, Stagger, Table, THead, Th, Tr, Td } from '@/components/ui';
import { PlusIcon, SearchIcon } from '@/components/Icons';
import { timeAgo } from '@/lib/format';
import {
  STATUS_LABEL,
  blankDraft,
  createProposal,
  draftFromDeal,
  draftFromLead,
  effectiveStatus,
  fetchDeal,
  fetchLead,
  fetchPackages,
  fetchProposals,
  fmtDate,
  loadProposalSettings,
  money,
  type Proposal,
  type ProposalStatus,
} from '@/lib/proposals-data';
import { ProposalsIcon } from './ProposalIcon';
import { STATUS_TONE } from './status';

type Filter = 'all' | ProposalStatus;

export default function ProposalsView() {
  const router = useRouter();
  const pathname = usePathname() ?? '/proposals';
  const sp = useSearchParams();
  const { pushToast } = useShell();
  const [list, setList] = useState<Proposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const started = useRef(false);

  const filterParam = sp.get('status');
  const filter: Filter = (['draft', 'sent', 'accepted', 'declined', 'expired'] as const).find((s) => s === filterParam) ?? 'all';

  const load = useCallback(async () => {
    setError(null);
    try {
      setList(await fetchProposals());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load proposals');
      setList((l) => l ?? []);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(
    async (from: { lead?: string | null; deal?: string | null }) => {
      setCreating(true);
      try {
        const [s, packages] = await Promise.all([loadProposalSettings(), fetchPackages().catch(() => [])]);
        let draft = blankDraft(s.value);
        if (from.deal) {
          const deal = await fetchDeal(from.deal);
          if (deal) draft = await draftFromDeal(deal, packages, s.value);
          else pushToast('warning', 'That deal was not found, so the proposal starts empty.');
        } else if (from.lead) {
          const lead = await fetchLead(from.lead);
          if (lead) draft = draftFromLead(lead, packages, s.value);
          else pushToast('warning', 'That lead was not found, so the proposal starts empty.');
        }
        const res = await createProposal(draft);
        if (res.error || !res.proposal) {
          pushToast('error', `Could not create the proposal: ${res.error}`);
          setCreating(false);
          router.replace(pathname);
          return;
        }
        router.replace(`/proposals/${res.proposal.id}`);
      } catch (e) {
        pushToast('error', e instanceof Error ? e.message : 'Could not create the proposal');
        setCreating(false);
        router.replace(pathname);
      }
    },
    [pathname, pushToast, router],
  );

  // ?new=1&lead=<id> or ?new=1&deal=<id> creates a prefilled draft and opens it.
  useEffect(() => {
    if (started.current || sp.get('new') !== '1') return;
    started.current = true;
    void create({ lead: sp.get('lead'), deal: sp.get('deal') });
  }, [sp, create]);

  const setFilter = (f: Filter) => {
    const next = new URLSearchParams(sp.toString());
    if (f === 'all') next.delete('status');
    else next.set('status', f);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const all = useMemo(() => (list ?? []).map((p) => ({ p, st: effectiveStatus(p) })), [list]);
  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter(({ p, st }) => (filter === 'all' || st === filter) && (!t || `${p.title} ${p.client_name} ${p.client_email}`.toLowerCase().includes(t)));
  }, [all, filter, q]);

  const currency = useMemo(() => {
    const c = new Map<string, number>();
    for (const { p } of all) c.set(p.currency, (c.get(p.currency) ?? 0) + 1);
    return Array.from(c.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD';
  }, [all]);
  const mixed = useMemo(() => new Set(all.map(({ p }) => p.currency)).size > 1, [all]);
  const sum = (st: ProposalStatus) => all.filter((x) => x.st === st).reduce((s, x) => s + x.p.total, 0);
  const count = (st: ProposalStatus) => all.filter((x) => x.st === st).length;
  const decided = count('accepted') + count('declined');
  const loading = list === null;
  const fmt = (n: number) => money(n, currency);

  const newBlank = () => void create({});

  return (
    <PageContainer>
      <PageHeader
        title="Proposals"
        subtitle="Quotes you build from a lead or deal, as a clean one page PDF. Nothing is ever sent from here."
        actions={
          <Button variant="primary" leftIcon={<PlusIcon className="h-4 w-4" />} onClick={newBlank} loading={creating}>
            New proposal
          </Button>
        }
      />

      {error && (
        <Banner tone="danger" title="Could not load proposals" className="mb-4" action={<Button size="sm" onClick={() => void load()}>Retry</Button>}>
          {error}
        </Banner>
      )}

      {loading ? (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[98px] rounded-card" />
          ))}
        </div>
      ) : (
        <Stagger className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4" step={50}>
          <StatTile label="Waiting on a reply" tone="primary" value={<CountUp value={sum('sent')} format={fmt} />} sub={`${count('sent')} sent`} />
          <StatTile label="Accepted" tone="success" value={<CountUp value={sum('accepted')} format={fmt} />} sub={`${count('accepted')} proposal${count('accepted') === 1 ? '' : 's'}`} />
          <StatTile label="Win rate" value={decided ? <CountUp value={Math.round((count('accepted') / decided) * 100)} format={(n) => `${Math.round(n)}%`} /> : <span>None yet</span>} sub="Accepted vs declined" />
          <StatTile label="Drafts" value={<CountUp value={count('draft')} format={(n) => String(Math.round(n))} />} sub={money(sum('draft'), currency)} />
        </Stagger>
      )}
      {mixed && !loading && <p className="-mt-3 mb-4 text-xs text-fg-subtle">Proposals use more than one currency. Totals add the numbers together and show {currency}.</p>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="max-w-full overflow-x-auto">
          <SegmentedControl<Filter>
            label="Status"
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'all', label: 'All' },
              { id: 'draft', label: 'Draft' },
              { id: 'sent', label: 'Sent' },
              { id: 'accepted', label: 'Accepted' },
              { id: 'declined', label: 'Declined' },
              { id: 'expired', label: 'Expired' },
            ]}
          />
        </div>
        <div className="relative w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input aria-label="Search proposals" placeholder="Search title or client" value={q} onChange={(e) => setQ(e.target.value)} className="!pl-8" />
        </div>
        <span className="text-[13px] text-fg-subtle sm:ml-auto" role="status">
          {loading ? 'Loading' : `${visible.length} proposal${visible.length === 1 ? '' : 's'}${visible.length ? `, ${money(visible.reduce((s, x) => s + x.p.total, 0), currency)}` : ''}`}
        </span>
      </div>

      {loading || creating ? (
        <SkeletonRows rows={5} rowClassName="h-14" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<ProposalsIcon className="h-5 w-5" />}
          title={all.length === 0 ? 'No proposals yet' : 'No proposals match'}
          text={all.length === 0 ? 'Open a lead or a deal and choose Create proposal. Pick a package, adjust the price and download a one page PDF.' : 'Change the status filter or the search.'}
          action={
            all.length === 0 ? (
              <Button variant="primary" onClick={newBlank}>
                New proposal
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Reveal>
          <div className="hidden md:block">
            <Table caption="Proposals">
              <THead>
                <tr>
                  <Th>Proposal</Th>
                  <Th>Status</Th>
                  <Th align="right">Total</Th>
                  <Th>Valid until</Th>
                  <Th>Updated</Th>
                </tr>
              </THead>
              <tbody>
                {visible.map(({ p, st }) => (
                  <Tr key={p.id} onClick={() => router.push(`/proposals/${p.id}`)}>
                    <Td className="max-w-[360px]">
                      <Link href={`/proposals/${p.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-fg hover:underline">
                        {p.title}
                      </Link>
                      <p className="truncate text-xs text-fg-subtle">{p.client_name || 'No client yet'}</p>
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[st]} dot>
                        {STATUS_LABEL[st]}
                      </Badge>
                    </Td>
                    <Td numeric>{money(p.total, p.currency)}</Td>
                    <Td className="whitespace-nowrap text-fg-muted">{p.valid_until ? fmtDate(p.valid_until) : <span className="text-fg-subtle">Not set</span>}</Td>
                    <Td className="whitespace-nowrap text-fg-muted">{timeAgo(p.updated_at)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="space-y-2 md:hidden">
            {visible.map(({ p, st }) => (
              <li key={p.id}>
                <Link href={`/proposals/${p.id}`} className="block rounded-card border border-border bg-surface p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate font-medium text-fg">{p.title}</p>
                    <span className="font-num shrink-0 text-sm text-fg">{money(p.total, p.currency)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-fg-subtle">{p.client_name || 'No client yet'}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_TONE[st]} dot>
                      {STATUS_LABEL[st]}
                    </Badge>
                    {p.valid_until && <span className="text-xs text-fg-subtle">Valid until {fmtDate(p.valid_until)}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      )}
    </PageContainer>
  );
}
