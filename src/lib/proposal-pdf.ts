// One-page A4 proposal PDF, drawn in the browser with jsPDF (loaded on demand). Nothing leaves the machine.
import { moneyPdf, type ProposalDoc } from './proposals-data';

type Doc = import('jspdf').jsPDF;

const W = 595.28;
const H = 841.89;
const M = 52;
const INK: [number, number, number] = [24, 30, 42];
const MUTED: [number, number, number] = [104, 112, 126];
const FAINT: [number, number, number] = [208, 213, 221];
const ACCENT: [number, number, number] = [37, 84, 199];

/** The built-in PDF fonts only draw Latin-1/Windows-1252: swap anything else for a close plain character. */
export function pdfSafe(s: string): string {
  return s
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•●▪]/g, '-')
    .replace(/ | | /g, ' ')
    .replace(/[^\x09\x0a\x0d\x20-\x7e¡-ÿ]/g, '?');
}

type Opts = { k: number; termLines: number; maxRows: number };
type Result = { endY: number; limit: number; hidden: number; termsCut: boolean };

function render(doc: Doc, d: ProposalDoc, o: Opts): Result {
  const k = o.k;
  const cw = W - M * 2;
  const text = (s: string, x: number, y: number, size: number, style: 'normal' | 'bold', color: [number, number, number], opts?: { align?: 'left' | 'right' }) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size * k);
    doc.setTextColor(...color);
    doc.text(pdfSafe(s), x, y, { align: opts?.align ?? 'left' });
  };
  const wrap = (s: string, width: number, size: number, style: 'normal' | 'bold' = 'normal'): string[] => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size * k);
    return doc.splitTextToSize(pdfSafe(s), width) as string[];
  };
  const rule = (y: number, color = FAINT, w = 0.6) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(w);
    doc.line(M, y, W - M, y);
  };

  // Accept block, pinned to the bottom of the page.
  const footTop = H - M - 58;
  rule(footTop, INK, 0.8);
  text('ACCEPTANCE', M, footTop + 16, 7.5, 'bold', MUTED);
  const by = `Accepted by ${d.clientName ? d.clientName : 'client'}`;
  text(by, M, footTop + 52, 9, 'normal', MUTED);
  const byW = doc.getTextWidth(pdfSafe(by));
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.6);
  const dateX = W - M - 150;
  doc.line(M + byW + 8, footTop + 49, dateX - 14, footTop + 49);
  text('Date', dateX, footTop + 52, 9, 'normal', MUTED);
  doc.line(dateX + 26, footTop + 49, W - M, footTop + 49);
  const limit = footTop - 14;

  // Header
  let y = M + 6;
  text(d.business.name, M, y + 10, 15, 'bold', INK);
  const contact = [d.business.person, d.business.email, d.business.website, d.business.phone].filter(Boolean);
  contact.forEach((c, i) => text(c, W - M, y + 2 + i * 11 * k, 8.5, 'normal', MUTED, { align: 'right' }));
  y += Math.max(26, 6 + contact.length * 11 * k + 4);
  rule(y, INK, 1);
  y += 30 * k;

  // Title block
  text('PROPOSAL', M, y, 7.5, 'bold', ACCENT);
  y += 22 * k;
  const titleLines = wrap(d.title, cw, 21, 'bold').slice(0, 2);
  titleLines.forEach((l, i) => text(l, M, y + i * 25 * k, 21, 'bold', INK));
  y += (titleLines.length - 1) * 25 * k + 20 * k;
  const prepared = [d.clientName ? `Prepared for ${d.clientName}` : '', d.dateLabel].filter(Boolean).join('   |   ');
  text(prepared, M, y, 9.5, 'normal', MUTED);
  y += 24 * k;

  // Summary
  if (d.summary.trim()) {
    const lines = wrap(d.summary.trim(), cw, 10.5);
    lines.forEach((l, i) => text(l, M, y + i * 14.5 * k, 10.5, 'normal', INK));
    y += lines.length * 14.5 * k + 14 * k;
  }

  // Scope
  text('SCOPE AND PRICE', M, y, 7.5, 'bold', MUTED);
  y += 8 * k;
  rule(y);
  const priceW = 96;
  const rows = d.lines.slice(0, o.maxRows);
  const hidden = d.lines.length - rows.length;
  for (const r of rows) {
    const ls = wrap(r.label || ' ', cw - priceW - 12, 10);
    const rh = ls.length * 13 * k + 12 * k;
    ls.forEach((l, i) => text(l, M, y + 16 * k + i * 13 * k - 3 * k, 10, r.price > 0 ? 'bold' : 'normal', r.price > 0 ? INK : [60, 68, 82]));
    if (r.price > 0) text(moneyPdf(r.price, d.currency), W - M, y + 13 * k, 10, 'normal', INK, { align: 'right' });
    else text('Included', W - M, y + 13 * k, 9, 'normal', MUTED, { align: 'right' });
    y += rh;
    rule(y);
  }
  if (hidden > 0) {
    text(`+ ${hidden} more item${hidden === 1 ? '' : 's'} (included in the total)`, M, y + 14 * k, 9, 'normal', MUTED);
    y += 22 * k;
    rule(y);
  }
  if (d.discount > 0) {
    text('Discount', M, y + 15 * k, 10, 'normal', INK);
    text(`-${moneyPdf(d.discount, d.currency)}`, W - M, y + 15 * k, 10, 'normal', INK, { align: 'right' });
    y += 24 * k;
    rule(y);
  }
  y += 24 * k;
  text('Total', M, y, 11, 'bold', INK);
  text(moneyPdf(d.total, d.currency), W - M, y + 1, 17, 'bold', INK, { align: 'right' });
  y += 14 * k;
  rule(y, INK, 1);
  y += 26 * k;

  // Key facts
  const facts: [string, string][] = [];
  if (d.timeline) facts.push(['TIMELINE', d.timeline]);
  if (d.validUntil) facts.push(['VALID UNTIL', d.validUntil]);
  if (d.paymentTerms.trim()) facts.push(['PAYMENT', d.paymentTerms.trim()]);
  if (facts.length) {
    const colW = cw / facts.length;
    let tallest = 0;
    facts.forEach(([label, value], i) => {
      const x = M + i * colW;
      text(label, x, y, 7.5, 'bold', MUTED);
      const vl = wrap(value, colW - 14, 10);
      vl.forEach((l, j) => text(l, x, y + 14 * k + j * 13 * k, 10, 'normal', INK));
      tallest = Math.max(tallest, vl.length);
    });
    y += 14 * k + tallest * 13 * k + 14 * k;
  }

  // Terms
  let termsCut = false;
  if (d.terms.trim() && o.termLines > 0) {
    text('TERMS', M, y, 7.5, 'bold', MUTED);
    let tl = wrap(d.terms.trim(), cw, 8.5);
    if (tl.length > o.termLines) {
      tl = tl.slice(0, o.termLines);
      tl[tl.length - 1] = tl[tl.length - 1].replace(/\s*\S{0,3}$/, '') + '...';
      termsCut = true;
    }
    tl.forEach((l, i) => text(l, M, y + 13 * k + i * 11.5 * k, 8.5, 'normal', MUTED));
    y += 13 * k + tl.length * 11.5 * k;
  } else if (d.terms.trim()) termsCut = true;

  return { endY: y, limit, hidden, termsCut };
}

export type Fit = { scale: number; hidden: number; termsCut: boolean };

function fitOpts(make: () => Doc, d: ProposalDoc): { opts: Opts; res: Result } {
  const termsMax = 40;
  for (let k = 1; k >= 0.76; k -= 0.04) {
    const o = { k, termLines: termsMax, maxRows: 999 };
    const r = render(make(), d, o);
    if (r.endY <= r.limit) return { opts: o, res: r };
  }
  const k = 0.76;
  for (let t = termsMax; t >= 0; t -= 1) {
    const o = { k, termLines: t, maxRows: 999 };
    const r = render(make(), d, o);
    if (r.endY <= r.limit) return { opts: o, res: r };
  }
  for (let rows = d.lines.length; rows >= 1; rows -= 1) {
    const o = { k, termLines: 0, maxRows: rows };
    const r = render(make(), d, o);
    if (r.endY <= r.limit) return { opts: o, res: r };
  }
  const o = { k, termLines: 0, maxRows: 1 };
  return { opts: o, res: render(make(), d, o) };
}

/** Builds the PDF and reports how much had to shrink to stay on one page. */
export async function buildProposalPdf(d: ProposalDoc): Promise<{ doc: Doc; fit: Fit }> {
  const { jsPDF } = await import('jspdf');
  const make = () => new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const { opts, res } = fitOpts(make, d);
  const doc = make();
  render(doc, d, opts);
  doc.setProperties({ title: pdfSafe(d.title), author: pdfSafe(d.business.name), creator: 'Lead Radar' });
  return { doc, fit: { scale: opts.k, hidden: res.hidden, termsCut: res.termsCut } };
}

export async function proposalFit(d: ProposalDoc): Promise<Fit> {
  const { jsPDF } = await import('jspdf');
  const { opts, res } = fitOpts(() => new jsPDF({ unit: 'pt', format: 'a4' }), d);
  return { scale: opts.k, hidden: res.hidden, termsCut: res.termsCut };
}

export function pdfFileName(d: ProposalDoc): string {
  const base = (d.clientName ? `${d.title} ${d.clientName}` : d.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `proposal-${base || 'draft'}.pdf`;
}

/** Call from a click handler. */
export async function downloadProposalPdf(d: ProposalDoc): Promise<Fit> {
  const { doc, fit } = await buildProposalPdf(d);
  doc.save(pdfFileName(d));
  return fit;
}
