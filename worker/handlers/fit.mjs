import { sb } from '../lib/db.mjs';
import { log } from '../lib/log.mjs';
import { getSetting, setSetting } from '../lib/settings.mjs';
import { computeFit } from '../lib/fit-core.mjs';
import { fetchAllLeads } from '../lib/fit-db.mjs';
import { loadStockForMatch } from '../lib/stock-db.mjs';
import { tradingHash } from '../lib/trade-match.mjs';

const COLS = 'id,title,description,tags,category,source,source_detail,lead_kind,trust_score,trust_level,budget_amount,best_email,is_suspicious,fit_score,trade_side,game,item_type,trade_match';
const FULL_EVERY_MS = 6 * 3600 * 1000;

async function rescore(leads, ctx) {
  let n = 0;
  for (let i = 0; i < leads.length; i += 10) {
    await Promise.all(leads.slice(i, i + 10).map(async (l) => {
      const r = computeFit(l, ctx);
      const patch = { fit_score: r.score, fit_reasons: r.reasons };
      if (r.trade_match !== undefined) patch.trade_match = r.trade_match;
      const { error } = await sb.from('leads').update(patch).eq('id', l.id);
      if (!error) n++;
    }));
  }
  return n;
}

async function recentTradeLeads() {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data } = await sb.from('leads').select(COLS).eq('lead_kind', 'trade').gte('created_at', since).limit(2000);
  return data || [];
}

export async function fitScan() {
  const [profile, summary, filterLearning, state, targeting, trading] = await Promise.all([
    getSetting('profile'), getSetting('profile_summary'), getSetting('filter_learning'), getSetting('fit_state'), getSetting('targeting'), getSetting('trading'),
  ]);
  const stock = await loadStockForMatch().catch(() => undefined);
  const ctx = { profile, summary, filterLearning, targeting, trading, stock };
  const hash = tradingHash(trading);
  const changed = (summary.generated_at || null) !== (state.profile_at || null)
    || (filterLearning.generated_at || null) !== (state.filters_at || null)
    || (targeting.updated_at || null) !== (state.targeting_at || null);
  const stale = !state.full_at || Date.now() - new Date(state.full_at).getTime() > FULL_EVERY_MS;
  if (changed || stale) {
    const all = await fetchAllLeads(COLS);
    const n = await rescore(all, ctx);
    await setSetting('fit_state', {
      profile_at: summary.generated_at || null, filters_at: filterLearning.generated_at || null,
      targeting_at: targeting.updated_at || null, trading_hash: hash, full_at: new Date().toISOString(),
    });
    log('fit', `rescored ${n} leads`);
    return { rescored: n };
  }
  if ((state.trading_hash || '') !== hash) {
    const n = await rescore(await recentTradeLeads(), ctx);
    await setSetting('fit_state', { ...state, trading_hash: hash });
    log('fit', `rematched ${n} trade leads after your Trading settings changed`);
    return { rescored: n };
  }
  const { data } = await sb.from('leads').select(COLS).is('fit_score', null).limit(100);
  if (!data?.length) return { rescored: 0 };
  const n = await rescore(data, ctx);
  log('fit', `scored ${n} new leads`);
  return { rescored: n };
}

export const jobs = {};
export const tasks = [{ name: 'fit-scan', everyMs: 60000, initialDelayMs: 10000, run: fitScan }];
