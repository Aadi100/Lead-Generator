"use client";

import { useEffect, useRef, useState } from 'react';
import { money, type ProposalDoc } from '@/lib/proposals-data';

// A paper-coloured replica of the PDF page (595 x 842 units), scaled to fit its container.
const PAGE_W = 595;
const PAGE_H = 842;
const INK = '#181e2a';
const MUTED = '#68707e';
const RULE = '#d0d5dd';
const ACCENT = '#2554c7';

export default function ProposalPreview({ doc }: { doc: ProposalDoc }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.7);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / PAGE_W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const contact = [doc.business.person, doc.business.email, doc.business.website, doc.business.phone].filter(Boolean);
  const facts: [string, string][] = [];
  if (doc.timeline) facts.push(['Timeline', doc.timeline]);
  if (doc.validUntil) facts.push(['Valid until', doc.validUntil]);
  if (doc.paymentTerms.trim()) facts.push(['Payment', doc.paymentTerms.trim()]);
  const label = { fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: MUTED };

  return (
    <div ref={wrap} className="w-full" role="img" aria-label={`Preview of the one page proposal: ${doc.title}`}>
      <div className="relative mx-auto overflow-hidden rounded-[3px] shadow-float ring-1 ring-black/10" style={{ width: PAGE_W * scale, height: PAGE_H * scale }}>
        <div
          style={{
            width: PAGE_W,
            height: PAGE_H,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            background: '#ffffff',
            color: INK,
            fontFamily: 'Helvetica, Arial, sans-serif',
            padding: '58px 52px 52px',
            position: 'relative',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, paddingBottom: 12, borderBottom: `1.5px solid ${INK}` }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{doc.business.name}</div>
            <div style={{ textAlign: 'right', fontSize: 8.5, lineHeight: '11px', color: MUTED }}>
              {contact.map((c) => (
                <div key={c}>{c}</div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 26, ...label, color: ACCENT }}>Proposal</div>
          <div style={{ marginTop: 8, fontSize: 21, fontWeight: 700, lineHeight: '25px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{doc.title}</div>
          <div style={{ marginTop: 8, fontSize: 9.5, color: MUTED }}>{[doc.clientName ? `Prepared for ${doc.clientName}` : '', doc.dateLabel].filter(Boolean).join('   |   ')}</div>

          {doc.summary.trim() && <p style={{ marginTop: 18, fontSize: 10.5, lineHeight: '14.5px', whiteSpace: 'pre-wrap' }}>{doc.summary.trim()}</p>}

          <div style={{ marginTop: 20, ...label, paddingBottom: 6, borderBottom: `0.6px solid ${RULE}` }}>Scope and price</div>
          {doc.lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '6px 0', fontSize: 10, lineHeight: '13px', borderBottom: `0.6px solid ${RULE}` }}>
              <span style={{ fontWeight: l.price > 0 ? 700 : 400, color: l.price > 0 ? INK : '#3c4452' }}>{l.label || '\u00a0'}</span>
              <span style={l.price > 0 ? { whiteSpace: 'nowrap' } : { color: MUTED, fontSize: 9 }}>{l.price > 0 ? money(l.price, doc.currency) : 'Included'}</span>
            </div>
          ))}
          {doc.discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 10, borderBottom: `0.6px solid ${RULE}` }}>
              <span>Discount</span>
              <span>-{money(doc.discount, doc.currency)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14, paddingBottom: 10, borderBottom: `1.5px solid ${INK}` }}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>Total</span>
            <span style={{ fontSize: 17, fontWeight: 700 }}>{money(doc.total, doc.currency)}</span>
          </div>

          {facts.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${facts.length}, 1fr)`, gap: 14, marginTop: 20 }}>
              {facts.map(([k, v]) => (
                <div key={k}>
                  <div style={label}>{k}</div>
                  <div style={{ marginTop: 5, fontSize: 10, lineHeight: '13px' }}>{v}</div>
                </div>
              ))}
            </div>
          )}

          {doc.terms.trim() && (
            <div style={{ marginTop: 20 }}>
              <div style={label}>Terms</div>
              <p style={{ marginTop: 5, fontSize: 8.5, lineHeight: '11.5px', color: MUTED, whiteSpace: 'pre-wrap' }}>{doc.terms.trim()}</p>
            </div>
          )}

          <div style={{ position: 'absolute', left: 52, right: 52, bottom: 52, height: 58, borderTop: `1px solid ${INK}` }}>
            <div style={{ ...label, marginTop: 8 }}>Acceptance</div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', alignItems: 'flex-end', gap: 10, fontSize: 9, color: MUTED }}>
              <span>Accepted by {doc.clientName || 'client'}</span>
              <span style={{ flex: '0 0 124px', borderBottom: `0.6px solid ${INK}`, height: 1 }} />
              <span style={{ marginLeft: 14 }}>Date</span>
              <span style={{ flex: 1, borderBottom: `0.6px solid ${INK}`, height: 1 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
