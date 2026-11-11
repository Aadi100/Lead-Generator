"use client";

import Link from 'next/link';
import type { ReactNode } from 'react';
import { CheckCircleIcon } from '@/components/Icons';
import { Badge, CountBadge, buttonClass, cx } from '@/components/ui';
import { outreachLeadTitle, type TodayData } from '@/lib/dashboard-data';
import { timeAgo, truncate } from '@/lib/format';
import { Panel, PanelEmpty } from './Panel';

const OPEN = buttonClass('secondary', 'sm', 'shrink-0');

function Group({ title, count, href, children }: { title: string; count: number; href: string; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {title}
          <CountBadge n={count} tone="neutral" label={`${count} ${title}`} />
        </h3>
        <Link href={href} className="text-xs font-medium text-primary-text hover:underline">
          See all
        </Link>
      </div>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

function Row({ lead, children, action }: { lead?: ReactNode; children: ReactNode; action: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-ctl bg-surface-2/60 px-3 py-2">
      {lead}
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </li>
  );
}

const Title = ({ children }: { children: ReactNode }) => <p className="truncate text-sm font-medium text-fg">{children}</p>;
const Sub = ({ children }: { children: ReactNode }) => <p className="truncate text-xs text-fg-subtle">{children}</p>;

export function TodayCard({ today, onToggleTask }: { today: TodayData; onToggleTask: (id: string) => void }) {
  const now = Date.now();
  const sod = new Date();
  sod.setHours(0, 0, 0, 0);
  return (
    <Panel title="Today" subtitle={today.total ? `${today.total} thing${today.total === 1 ? '' : 's'} need you` : undefined} aside={today.total > 0 ? <CountBadge n={today.total} label={`${today.total} items today`} /> : undefined}>
      {today.total === 0 ? (
        <PanelEmpty icon={<CheckCircleIcon className="h-5 w-5" />} title="You are all caught up" text="No tasks, drafts, replies or follow-ups are waiting. New strong leads will show up here." action={<Link href="/leads" className={buttonClass('secondary', 'sm')}>Browse leads</Link>} />
      ) : (
        <div className="space-y-4">
          <Group title="Tasks due" count={today.tasks.length} href="/tasks">
            {today.tasks.slice(0, 5).map((t) => {
              const overdue = t.due_at && new Date(t.due_at).getTime() < sod.getTime();
              return (
                <Row
                  key={t.id}
                  lead={
                    <button
                      type="button"
                      onClick={() => onToggleTask(t.id)}
                      aria-label={`Mark done: ${t.title}`}
                      className="group/c flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-border-strong text-transparent transition-colors duration-fast hover:border-success hover:text-success focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [@media(pointer:coarse)]:h-8 [@media(pointer:coarse)]:w-8"
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m5 12 5 5 9-10" />
                      </svg>
                    </button>
                  }
                  action={
                    <Link href={t.lead_id ? `/leads?lead=${t.lead_id}` : '/tasks'} className={OPEN}>
                      Open
                    </Link>
                  }
                >
                  <Title>{t.title}</Title>
                  <Sub>
                    <span className={cx(overdue && 'font-medium text-danger')}>{overdue ? 'Overdue' : 'Due today'}</span>
                    {t.priority === 'high' && ' · High priority'}
                  </Sub>
                </Row>
              );
            })}
          </Group>

          <Group title="Replies waiting" count={today.replies.length} href="/outbox?tab=replies">
            {today.replies.slice(0, 3).map((r) => (
              <Row key={r.id} action={<Link href="/outbox?tab=replies" className={OPEN}>Open</Link>}>
                <Title>{r.from_name || r.from_email || 'Someone'}</Title>
                <Sub>{truncate(r.summary || r.subject || 'Wrote back', 80)}</Sub>
              </Row>
            ))}
          </Group>

          <Group title="Drafts to review" count={today.drafts.length} href="/outbox">
            {today.drafts.slice(0, 3).map((d) => (
              <Row key={d.id} action={<Link href="/outbox" className={OPEN}>Review</Link>}>
                <Title>{outreachLeadTitle(d)}</Title>
                <Sub>{d.step > 1 ? 'Follow-up draft' : 'First message'} · {timeAgo(d.created_at, now)}</Sub>
              </Row>
            ))}
          </Group>

          <Group title="Follow-ups due" count={today.followups.length} href="/outbox">
            {today.followups.slice(0, 3).map((d) => (
              <Row key={d.id} action={<Link href="/outbox" className={OPEN}>Open</Link>}>
                <Title>{outreachLeadTitle(d)}</Title>
                <Sub>Scheduled follow-up</Sub>
              </Row>
            ))}
          </Group>

          <Group title="Hot new leads" count={today.hot.length} href="/leads?status=New&sort=fit">
            {today.hot.map((l) => (
              <Row key={l.id} lead={<Badge tone="success" className="font-num">{l.fit_score}</Badge>} action={<Link href={`/leads?lead=${l.id}`} className={OPEN}>Open</Link>}>
                <Title>{l.title}</Title>
                <Sub>{l.source} · {timeAgo(l.created_at, now)}</Sub>
              </Row>
            ))}
          </Group>
        </div>
      )}
    </Panel>
  );
}
