"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useShell } from '@/components/AppShell';
import { Badge, Button, Drawer, Field, Input, Skeleton, StatusBadge } from '@/components/ui';
import { CopyIcon, ExternalIcon, PlusIcon } from '@/components/Icons';
import { supabase } from '@/lib/supabaseClient';
import { copyText } from '@/lib/clipboard';
import { fmtDateTime, isHttpUrl, timeAgo, truncate, EMAIL_STATUS_INFO } from '@/lib/format';
import type { Contact } from '@/lib/contacts-data';
import { EmailChip, OutreachChip, SocialLinks } from './ContactBits';

type TimelineItem = { id: string; at: string; kind: 'sent' | 'draft' | 'reply' | 'failed' | 'scheduled'; title: string; text: string; leadTitle: string };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </div>
  );
}

export default function ContactDrawer({ contact, open, onClose, onCopy }: { contact: Contact | null; open: boolean; onClose: () => void; onCopy: (c: Contact) => void }) {
  const { pushToast } = useShell();
  const router = useRouter();
  const [timeline, setTimeline] = useState<TimelineItem[] | null>(null);
  const [tlError, setTlError] = useState<string | null>(null);
  const [task, setTask] = useState('');
  const [saving, setSaving] = useState(false);

  // Keep the last contact while the drawer animates out.
  const [last, setLast] = useState<Contact | null>(contact);
  useEffect(() => {
    if (contact) setLast(contact);
  }, [contact]);
  const c = contact ?? last;

  const leadIds = useMemo(() => (c ? c.leads.map((l) => l.id) : []), [c]);
  const leadTitle = useMemo(() => new Map((c?.leads ?? []).map((l) => [l.id, l.title])), [c]);

  useEffect(() => {
    if (!open || !c) return;
    let dead = false;
    setTimeline(null);
    setTlError(null);
    setTask('');
    (async () => {
      const ids = leadIds.slice(0, 60);
      const [o, r] = await Promise.all([
        supabase.from('outreach').select('id,lead_id,status,subject,body,sent_at,created_at,error').in('lead_id', ids).order('created_at', { ascending: false }).limit(100),
        supabase.from('replies').select('id,lead_id,subject,body,summary,received_at,created_at,from_name,from_email').in('lead_id', ids).order('created_at', { ascending: false }).limit(100),
      ]);
      if (dead) return;
      if (o.error && r.error) {
        setTlError(o.error.message);
        setTimeline([]);
        return;
      }
      const items: TimelineItem[] = [];
      for (const row of (o.data ?? []) as Record<string, string | null>[]) {
        const st = row.status ?? 'draft';
        items.push({
          id: `o${row.id}`,
          at: row.sent_at ?? row.created_at ?? '',
          kind: st === 'sent' || st === 'replied' ? 'sent' : st === 'failed' ? 'failed' : st === 'draft' ? 'draft' : 'scheduled',
          title: row.subject || '(no subject)',
          text: row.error && st === 'failed' ? `Failed: ${row.error}` : row.body ?? '',
          leadTitle: leadTitle.get(row.lead_id ?? '') ?? '',
        });
      }
      for (const row of (r.data ?? []) as Record<string, string | null>[]) {
        items.push({
          id: `r${row.id}`,
          at: row.received_at ?? row.created_at ?? '',
          kind: 'reply',
          title: `Reply from ${row.from_name || row.from_email || 'them'}`,
          text: row.summary || row.body || '',
          leadTitle: leadTitle.get(row.lead_id ?? '') ?? '',
        });
      }
      items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setTimeline(items);
    })();
    return () => {
      dead = true;
    };
  }, [open, c, leadIds, leadTitle]);

  const addTask = async () => {
    if (!c || !task.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('tasks').insert({ title: task.trim(), lead_id: c.leads[0]?.id ?? null, priority: 'normal' });
    setSaving(false);
    if (error) {
      pushToast('error', `Could not add the task: ${error.message}`);
      return;
    }
    pushToast('success', 'Task added');
    setTask('');
  };

  const copy = async (text: string) => {
    const ok = await copyText(text);
    pushToast(ok ? 'success' : 'error', ok ? `Copied ${text}` : 'Could not copy');
  };

  const dealLead = c?.leads[0]?.id;

  return (
    <Drawer open={open} onClose={onClose} title={c?.name ?? 'Contact'} description={c ? `${c.leads.length} lead${c.leads.length === 1 ? '' : 's'}, last activity ${timeAgo(c.lastActivity)}` : undefined} width="max-w-[620px]">
      {c && (
        <div className="space-y-6 p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => dealLead && router.push(`/deals?new=1&lead=${dealLead}`)} disabled={!dealLead} leftIcon={<PlusIcon className="h-4 w-4" />}>
              Create deal
            </Button>
            <Button onClick={() => onCopy(c)} disabled={!c.bestEmail} leftIcon={<CopyIcon className="h-4 w-4" />}>
              Copy best email
            </Button>
            <OutreachChip state={c.outreach} />
          </div>

          <section aria-labelledby="ct-details">
            <h3 id="ct-details" className="mb-1 text-sm font-semibold text-fg">Details</h3>
            <dl className="divide-y divide-border">
              <Row label="Name">{c.name}</Row>
              <Row label="Website">
                {c.website ? (
                  isHttpUrl(c.website.startsWith('http') ? c.website : `https://${c.website}`) ? (
                    <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-text hover:underline">
                      {c.host ?? c.website}
                      <ExternalIcon className="h-3 w-3" />
                    </a>
                  ) : (
                    c.website
                  )
                ) : (
                  <span className="text-fg-subtle">Not found</span>
                )}
              </Row>
              <Row label="Company">{c.company ?? <span className="text-fg-subtle">Not found</span>}</Row>
              <Row label="Owner">{c.owner ? `${c.owner}${c.ownerTitle ? `, ${c.ownerTitle}` : ''}` : <span className="text-fg-subtle">Not found</span>}</Row>
              <Row label="Posted by">{c.person ?? <span className="text-fg-subtle">Unknown</span>}</Row>
              <Row label="Phones">
                {c.phones.length ? (
                  <span className="flex flex-wrap gap-1.5">
                    {c.phones.map((p) => (
                      <button key={p} type="button" onClick={() => void copy(p)} className="inline-flex min-h-6 items-center gap-1 rounded-md bg-surface-2 px-1.5 text-xs ring-1 ring-inset ring-border hover:bg-border coarse:min-h-9">
                        {p}
                        <CopyIcon className="h-3 w-3" />
                      </button>
                    ))}
                  </span>
                ) : (
                  <span className="text-fg-subtle">None</span>
                )}
              </Row>
              <Row label="Social">
                <SocialLinks socials={c.socials} />
              </Row>
              <Row label="Sources">
                {c.sources.length ? (
                  <span className="flex flex-wrap gap-1">
                    {c.sources.map((s) => (
                      <Badge key={s}>{s}</Badge>
                    ))}
                  </span>
                ) : (
                  <span className="text-fg-subtle">None</span>
                )}
              </Row>
            </dl>
          </section>

          <section aria-labelledby="ct-emails">
            <h3 id="ct-emails" className="mb-2 text-sm font-semibold text-fg">Emails</h3>
            {c.emails.length === 0 ? (
              <p className="text-sm text-fg-subtle">No email found yet. Enrich the lead from the Leads page to look for one.</p>
            ) : (
              <ul className="space-y-1.5">
                {c.emails.map((e) => (
                  <li key={e.email} className="flex flex-wrap items-center gap-2 rounded-ctl bg-surface-2/60 px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{e.email}</span>
                    <EmailChip status={e.status} />
                    {e.email === c.bestEmail && <Badge tone="primary">Best</Badge>}
                    <span className="sr-only">{EMAIL_STATUS_INFO[e.status].label}</span>
                    <Button size="sm" variant="ghost" onClick={() => void copy(e.email)} aria-label={`Copy ${e.email}`}>
                      <CopyIcon className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="ct-task">
            <h3 id="ct-task" className="mb-2 text-sm font-semibold text-fg">Add a task</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void addTask();
              }}
              className="flex items-end gap-2"
            >
              <div className="min-w-0 flex-1">
                <Field label="What needs doing?" htmlFor="ct-task-input">
                  <Input id="ct-task-input" value={task} onChange={(e) => setTask(e.target.value)} placeholder={`Follow up with ${c.owner ?? c.name}`} maxLength={200} />
                </Field>
              </div>
              <Button type="submit" variant="primary" loading={saving} disabled={!task.trim()}>
                Add task
              </Button>
            </form>
            <p className="mt-1 text-xs text-fg-subtle">Linked to the latest lead for this contact.</p>
          </section>

          <section aria-labelledby="ct-leads">
            <h3 id="ct-leads" className="mb-2 text-sm font-semibold text-fg">Linked leads ({c.leads.length})</h3>
            <ul className="space-y-1.5">
              {c.leads.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-ctl bg-surface-2/60 px-2.5 py-2">
                  <Link href={`/leads?lead=${l.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-fg hover:underline">
                    {truncate(l.title, 90)}
                  </Link>
                  <StatusBadge status={l.status} />
                  <span className="text-xs text-fg-subtle">{timeAgo(l.created_at)}</span>
                  <Link href={`/deals?new=1&lead=${l.id}`} className="text-xs text-primary-text hover:underline">
                    Create deal
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="ct-msgs">
            <h3 id="ct-msgs" className="mb-2 text-sm font-semibold text-fg">Messages</h3>
            {timeline === null ? (
              <div className="space-y-2" aria-busy="true">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : tlError ? (
              <p className="text-sm text-danger">Could not load messages: {tlError}</p>
            ) : timeline.length === 0 ? (
              <p className="text-sm text-fg-subtle">No messages yet. Drafts, sent emails and replies for these leads will show up here.</p>
            ) : (
              <ol className="relative space-y-3 border-l border-border pl-4">
                {timeline.map((t) => (
                  <li key={t.id} className="relative">
                    <span aria-hidden="true" className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${t.kind === 'reply' ? 'bg-success-solid' : t.kind === 'failed' ? 'bg-danger-solid' : t.kind === 'sent' ? 'bg-info-solid' : 'bg-border-strong'}`} />
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-fg-subtle">
                      <span className="font-medium text-fg-muted">{t.kind === 'reply' ? 'Reply' : t.kind === 'sent' ? 'Sent' : t.kind === 'failed' ? 'Failed' : t.kind === 'draft' ? 'Draft' : 'Scheduled'}</span>
                      <time dateTime={t.at} title={fmtDateTime(t.at)}>{timeAgo(t.at)}</time>
                    </div>
                    <p className="text-sm font-medium text-fg">{truncate(t.title, 100)}</p>
                    {t.text && <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-fg-muted">{truncate(t.text, 320)}</p>}
                    {t.leadTitle && <p className="mt-0.5 text-xs text-fg-subtle">About: {truncate(t.leadTitle, 70)}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
