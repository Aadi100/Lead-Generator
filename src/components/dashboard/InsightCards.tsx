"use client";

import Link from 'next/link';
import { SparkIcon } from '@/components/Icons';
import { BarList, FunnelChart, buttonClass } from '@/components/ui';
import type { DashModel } from '@/lib/dashboard-data';
import { Panel, PanelEmpty } from './Panel';

export function FunnelCard({ funnel }: { funnel: DashModel['funnel'] }) {
  const empty = funnel.found === 0;
  const winRate = funnel.pitched ? Math.round((funnel.won / funnel.pitched) * 100) : 0;
  return (
    <Panel title="Pipeline" subtitle="Service leads, from found to won" href="/pipeline" linkLabel="Open pipeline">
      {empty ? (
        <PanelEmpty icon={<SparkIcon className="h-5 w-5" />} title="No leads in the pipeline yet" text="When leads arrive they move through Found, Pitched, Replied and Won here." action={<Link href="/capture" className={buttonClass('secondary', 'sm')}>Add a lead</Link>} />
      ) : (
        <>
          <FunnelChart
            stages={[
              { label: 'Found', value: funnel.found, tone: 'info' },
              { label: 'Pitched', value: funnel.pitched, tone: 'primary' },
              { label: 'Replied', value: funnel.replied, tone: 'warning' },
              { label: 'Won', value: funnel.won, tone: 'success' },
            ]}
          />
          <p className="mt-3 text-[13px] text-fg-muted">
            {funnel.pitched ? (
              <>
                You have won <span className="font-num font-semibold text-fg">{funnel.won}</span> of <span className="font-num font-semibold text-fg">{funnel.pitched}</span> pitched leads ({winRate}%).
              </>
            ) : (
              'Nothing pitched yet. Review a draft to start the funnel.'
            )}
          </p>
        </>
      )}
    </Panel>
  );
}

export function LeadsPerDayCard({ data }: { data: DashModel['perDay'] }) {
  const totalS = data.reduce((s, d) => s + d.services, 0);
  const totalT = data.reduce((s, d) => s + d.trading, 0);
  const max = Math.max(1, ...data.map((d) => d.services + d.trading));
  const W = 600;
  const H = 150;
  const gap = 4;
  const bw = (W - gap * (data.length - 1)) / data.length;
  const busiest = data.reduce((b, d) => (d.services + d.trading > b.services + b.trading ? d : b), data[0]);
  const summary = `Leads per day over the last 30 days: ${totalS} service leads and ${totalT} trading leads. Busiest day ${busiest.label} with ${busiest.services + busiest.trading}.`;
  return (
    <Panel
      title="Leads per day"
      subtitle="Last 30 days"
      href="/analytics"
      linkLabel="Analytics"
      aside={
        <div className="flex items-center gap-3 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-primary" aria-hidden="true" />
            Services <span className="font-num font-semibold text-fg">{totalS}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden="true" />
            Trading <span className="font-num font-semibold text-fg">{totalT}</span>
          </span>
        </div>
      }
    >
      {totalS + totalT === 0 ? (
        <PanelEmpty icon={<SparkIcon className="h-5 w-5" />} title="No leads in the last 30 days" text="Once your sources find something, the daily bars appear here." />
      ) : (
        <figure>
          <svg role="img" aria-label={summary} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <line key={f} x1="0" x2={W} y1={H - f * (H - 4)} y2={H - f * (H - 4)} stroke="rgb(var(--border))" strokeWidth="1" strokeDasharray="3 4" opacity="0.7" />
            ))}
            {data.map((d, i) => {
              const sh = (d.services / max) * (H - 4);
              const th = (d.trading / max) * (H - 4);
              const x = i * (bw + gap);
              return (
                <g key={i} className="grow-y" style={{ animationDelay: `${i * 12}ms` }}>
                  <title>{`${d.label}: ${d.services} services, ${d.trading} trading`}</title>
                  <rect x={x} y={0} width={bw} height={H} fill="transparent" />
                  {d.services > 0 && <rect x={x} y={H - sh - th} width={bw} height={sh} rx="2" className="fill-primary" />}
                  {d.trading > 0 && <rect x={x} y={H - th} width={bw} height={th} rx="2" className="fill-accent" />}
                  {d.services + d.trading === 0 && <rect x={x} y={H - 2} width={bw} height="2" rx="1" className="fill-border-strong" />}
                </g>
              );
            })}
          </svg>
          <div className="mt-1.5 flex justify-between text-[11px] text-fg-subtle" aria-hidden="true">
            <span>{data[0].label}</span>
            <span>{data[Math.floor(data.length / 2)].label}</span>
            <span>Today</span>
          </div>
          <figcaption className="sr-only">{summary}</figcaption>
        </figure>
      )}
    </Panel>
  );
}

export function TopSourcesCard({ items }: { items: DashModel['topSources'] }) {
  return (
    <Panel title="Top sources" subtitle="Leads found in the last 7 days" href="/sources" linkLabel="All sources">
      {items.length === 0 ? (
        <PanelEmpty icon={<SparkIcon className="h-5 w-5" />} title="No leads this week" text="Check Source health to see which feeds have gone quiet." />
      ) : (
        <BarList
          tone="primary"
          items={items.map((s) => ({ label: s.name, value: s.count, sub: s.avgTrust != null ? `Average trust ${s.avgTrust}/100` : 'Not scored yet' }))}
        />
      )}
    </Panel>
  );
}
