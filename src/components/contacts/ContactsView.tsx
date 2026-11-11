"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageContainer, PageHeader } from '@/components/shell';
import { useShell } from '@/components/AppShell';
import { Banner, Button, Chip, EmptyState, IconButton, Input, Select, Skeleton, SkeletonRows, Stagger, Table, THead, Th, Tr, Td, cx } from '@/components/ui';
import { ContactsIcon, CopyIcon, ExternalIcon, SearchIcon, MailIcon, PhoneIcon, GlobeIcon } from '@/components/Icons';
import { copyText } from '@/lib/clipboard';
import { timeAgo, EMAIL_STATUS_INFO } from '@/lib/format';
import {
  CONTACT_LEAD_CAP,
  OUTREACH_STATE_LABEL,
  buildContacts,
  contactsToCsv,
  downloadCsv,
  fetchContactSources,
  filterContacts,
  type Contact,
  type ContactSort,
  type OutreachState,
} from '@/lib/contacts-data';
import type { Lead } from '@/lib/types';
import { STATUSES } from '@/lib/types';
import ContactDrawer from './ContactDrawer';
import { EmailChip, OutreachChip, SocialLinks } from './ContactBits';

const PAGE = 50;

export default function ContactsView() {
  const router = useRouter();
  const pathname = usePathname() ?? '/contacts';
  const sp = useSearchParams();
  const { pushToast } = useShell();

  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [outreach, setOutreach] = useState<Map<string, OutreachState>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

  const q = sp.get('q') ?? '';
  const hasEmail = sp.get('email') === '1';
  const verified = sp.get('verified') === '1';
  const source = sp.get('source') ?? '';
  const status = sp.get('status') ?? '';
  const sort = (['recent', 'leads', 'name'].includes(sp.get('sort') ?? '') ? sp.get('sort') : 'recent') as ContactSort;
  const selectedKey = sp.get('contact');

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, sp],
  );

  // Search box keeps its own text so typing is instant; the URL follows after a short pause.
  const [qText, setQText] = useState(q);
  useEffect(() => setQText(q), [q]);
  useEffect(() => {
    if (qText === q) return;
    const t = setTimeout(() => setParams({ q: qText }), 250);
    return () => clearTimeout(t);
  }, [qText, q, setParams]);

  const load = useCallback(async () => {
    setError(null);
    setLeads(null);
    try {
      const r = await fetchContactSources();
      setLeads(r.leads);
      setOutreach(r.outreach);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load contacts');
      setLeads([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const contacts = useMemo(() => (leads ? buildContacts(leads, outreach) : []), [leads, outreach]);
  const sources = useMemo(() => Array.from(new Set(contacts.flatMap((c) => c.sources))).sort(), [contacts]);
  const filtered = useMemo(() => filterContacts(contacts, { q, hasEmail, verified, source, status, sort }), [contacts, q, hasEmail, verified, source, status, sort]);
  useEffect(() => setShown(PAGE), [q, hasEmail, verified, source, status, sort]);
  const selected = useMemo(() => contacts.find((c) => c.key === selectedKey) ?? null, [contacts, selectedKey]);

  const copyEmail = async (c: Contact) => {
    if (!c.bestEmail) return;
    const ok = await copyText(c.bestEmail);
    pushToast(ok ? 'success' : 'error', ok ? `Copied ${c.bestEmail}` : 'Could not copy. Select the address and copy it by hand.');
  };

  const exportCsv = () => {
    if (!filtered.length) return;
    downloadCsv(`contacts-${new Date().toISOString().slice(0, 10)}.csv`, contactsToCsv(filtered));
    pushToast('success', `Exported ${filtered.length} contact${filtered.length === 1 ? '' : 's'}`);
  };

  const filtersActive = !!(q || hasEmail || verified || source || status);
  const loading = leads === null;
  const withEmail = contacts.filter((c) => c.bestEmail).length;

  return (
    <PageContainer>
      <PageHeader
        title="Contacts"
        subtitle={loading ? 'Everyone your leads have led to, in one place.' : `${contacts.length} people and companies from your most recent ${Math.min(leads?.length ?? 0, CONTACT_LEAD_CAP)} leads. ${withEmail} have an email.`}
        actions={
          <Button onClick={exportCsv} disabled={!filtered.length}>
            Export CSV{filtersActive ? ' (filtered)' : ''}
          </Button>
        }
      />

      {error && (
        <Banner tone="danger" title="Could not load contacts" className="mb-4" action={<Button size="sm" onClick={() => void load()}>Retry</Button>}>
          {error}
        </Banner>
      )}

      <div className="glass sticky top-0 z-20 mb-4 rounded-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <Input aria-label="Search contacts" value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Search name, email, phone..." className="pl-8" />
          </div>
          <div className="w-40">
            <Select aria-label="Source" value={source} onChange={(e) => setParams({ source: e.target.value })}>
              <option value="">All sources</option>
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-36">
            <Select aria-label="Lead status" value={status} onChange={(e) => setParams({ status: e.target.value })}>
              <option value="">Any status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-44">
            <Select aria-label="Sort by" value={sort} onChange={(e) => setParams({ sort: e.target.value === 'recent' ? null : e.target.value })}>
              <option value="recent">Latest activity</option>
              <option value="leads">Most leads</option>
              <option value="name">Name A to Z</option>
            </Select>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Chip selected={hasEmail} onClick={() => setParams({ email: hasEmail ? null : '1' })}>
            Has email
          </Chip>
          <Chip selected={verified} onClick={() => setParams({ verified: verified ? null : '1' })}>
            Verified email
          </Chip>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={() => { setQText(''); router.replace(pathname, { scroll: false }); }}>
              Clear filters
            </Button>
          )}
          <span className="ml-auto text-[13px] text-fg-subtle" role="status">
            {loading ? 'Loading' : `${filtered.length} shown`}
          </span>
        </div>
      </div>

      {loading ? (
        <div>
          <Skeleton className="mb-3 h-5 w-40" />
          <SkeletonRows rows={8} rowClassName="h-16" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ContactsIcon className="h-5 w-5" />}
          title={contacts.length === 0 ? 'No contacts yet' : 'No contacts match these filters'}
          text={contacts.length === 0 ? 'Contacts appear here once leads have a website, company or author. Capture a few leads to get started.' : 'Try a different search, or clear the filters.'}
          action={
            contacts.length === 0 ? (
              <Button variant="primary" onClick={() => router.push('/capture')}>
                Capture leads
              </Button>
            ) : (
              <Button onClick={() => { setQText(''); router.replace(pathname, { scroll: false }); }}>Clear filters</Button>
            )
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table caption="Contacts">
              <THead>
                <tr>
                  <Th>Contact</Th>
                  <Th>Owner</Th>
                  <Th>Best email</Th>
                  <Th>Phone</Th>
                  <Th>Social</Th>
                  <Th align="right">Leads</Th>
                  <Th>Last activity</Th>
                  <Th>Outreach</Th>
                  <Th className="w-10">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </THead>
              <tbody>
                {filtered.slice(0, shown).map((c) => (
                  <Tr key={c.key} selected={selectedKey === c.key} onClick={() => setParams({ contact: c.key })}>
                    <Td className="max-w-[240px]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setParams({ contact: c.key });
                        }}
                        className="block max-w-full truncate text-left font-medium text-fg hover:underline"
                      >
                        {c.name}
                      </button>
                      <p className="truncate text-xs text-fg-subtle">{c.host && c.host !== c.name ? c.host : c.person && c.person !== c.name ? c.person : ' '}</p>
                    </Td>
                    <Td className="max-w-[180px]">
                      {c.owner ? (
                        <>
                          <p className="truncate">{c.owner}</p>
                          {c.ownerTitle && <p className="truncate text-xs text-fg-subtle">{c.ownerTitle}</p>}
                        </>
                      ) : (
                        <span className="text-fg-subtle" aria-label="Not found">&mdash;</span>
                      )}
                    </Td>
                    <Td className="max-w-[240px]">
                      {c.bestEmail ? (
                        <div className="flex flex-col items-start gap-0.5">
                          <span className="max-w-full truncate font-mono text-xs">{c.bestEmail}</span>
                          <EmailChip status={c.bestEmailStatus} />
                        </div>
                      ) : (
                        <span className="text-fg-subtle" aria-label="No email">&mdash;</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-xs">{c.phones[0] ?? <span className="text-fg-subtle" aria-label="None">&mdash;</span>}</Td>
                    <Td>
                      <SocialLinks socials={c.socials} dash />
                    </Td>
                    <Td numeric>{c.leads.length}</Td>
                    <Td className="whitespace-nowrap text-fg-muted">{timeAgo(c.lastActivity)}</Td>
                    <Td>
                      <OutreachChip state={c.outreach} />
                    </Td>
                    <Td>
                      <IconButton label={c.bestEmail ? `Copy email for ${c.name}` : 'No email to copy'} size="sm" disabled={!c.bestEmail} onClick={(e) => { e.stopPropagation(); void copyEmail(c); }}>
                        <CopyIcon className="h-4 w-4" />
                      </IconButton>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>

          <Stagger as="ul" className="space-y-2 md:hidden" max={8}>
            {filtered.slice(0, shown).map((c) => (
              <li key={c.key} className="rounded-card border border-border bg-surface p-3">
                <button type="button" onClick={() => setParams({ contact: c.key })} className="block w-full min-w-0 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate font-medium text-fg">{c.name}</p>
                    <span className="font-num shrink-0 text-xs text-fg-subtle">{c.leads.length} lead{c.leads.length === 1 ? '' : 's'}</span>
                  </div>
                  {(c.owner || c.host) && (
                    <p className="mt-0.5 truncate text-xs text-fg-muted">
                      {c.owner ? `${c.owner}${c.ownerTitle ? `, ${c.ownerTitle}` : ''}` : c.host}
                    </p>
                  )}
                  {c.bestEmail && (
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <MailIcon className="h-3.5 w-3.5 text-fg-subtle" />
                      <span className="min-w-0 truncate font-mono">{c.bestEmail}</span>
                      <EmailChip status={c.bestEmailStatus} />
                    </p>
                  )}
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
                    <OutreachChip state={c.outreach} />
                    <span>{timeAgo(c.lastActivity)}</span>
                    {c.phones[0] && (
                      <span className="inline-flex items-center gap-1">
                        <PhoneIcon className="h-3 w-3" />
                        {c.phones[0]}
                      </span>
                    )}
                    {c.website && <GlobeIcon className="h-3 w-3" />}
                  </p>
                </button>
                {c.bestEmail && (
                  <Button size="sm" className="mt-2 coarse:min-h-11" leftIcon={<CopyIcon className="h-3.5 w-3.5" />} onClick={() => void copyEmail(c)}>
                    Copy email
                  </Button>
                )}
              </li>
            ))}
          </Stagger>

          {filtered.length > shown && (
            <div className="mt-4 text-center">
              <Button onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, filtered.length - shown)} more</Button>
            </div>
          )}
        </>
      )}

      <ContactDrawer contact={selected} open={!!selected} onClose={() => setParams({ contact: null })} onCopy={copyEmail} />
    </PageContainer>
  );
}
