// Product Hunt launches as OUTBOUND PROSPECTS (makers who might want a better site, app or design).
// They did not ask for anything. Public Atom feed by default; official GraphQL API when a token is saved.

export const PH_FEED = 'https://www.producthunt.com/feed';
export const PH_API = 'https://api.producthunt.com/v2/api/graphql';
export const PH_QUERY = '{ posts(first: 30, order: NEWEST) { edges { node { name tagline description url website createdAt makers { name } } } } }';

const WEAK_HOSTS = /(^|\.)(carrd\.co|notion\.site|notion\.so|framer\.website|framer\.app|webflow\.io|wixsite\.com|squarespace\.com|godaddysites\.com|linktr\.ee|bio\.link|github\.io|vercel\.app|netlify\.app|lovable\.app|bubble\.io|bubbleapps\.io|glitch\.me|replit\.app|repl\.co|herokuapp\.com|pages\.dev|onrender\.com|streamlit\.app|google\.com|forms\.gle|typeform\.com|tally\.so)$/i;
const STAGE_RE = /\b(waitlist|wait list|beta|early access|mvp|prototype|no[- ]code|landing page|coming soon|side project|solo founder|indie|just launched|first launch|template)\b/i;

const decode = (s) => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
const tagText = (xml, tag) => decode((new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(xml) || [])[1] || '').trim();

export function parseFeed(xml) {
  const out = [];
  for (const m of String(xml || '').matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const link = (/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i.exec(e) || [])[1];
    const content = tagText(e, 'content');
    const tagline = content.replace(/<a [\s\S]*?<\/a>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
    const authorBlock = (/<author>([\s\S]*?)<\/author>/i.exec(e) || [])[1] || '';
    out.push({
      name: tagText(e, 'title'), tagline, url: link ? link.split('?')[0] : '',
      maker: tagText(authorBlock, 'name') || null,
      createdAt: tagText(e, 'published') || null, website: null,
    });
  }
  return out.filter((p) => p.name && p.url);
}

export function parseApi(json) {
  return ((json && json.data && json.data.posts && json.data.posts.edges) || []).map((e) => e.node).filter((n) => n && n.name).map((n) => ({
    name: n.name, tagline: n.tagline || '', description: n.description || '', url: String(n.url || '').split('?')[0],
    maker: ((n.makers || [])[0] || {}).name || null, createdAt: n.createdAt || null, website: n.website || '', api: true,
  })).filter((p) => p.url);
}

export function siteWeakness(website) {
  if (!website) return 'No website listed on Product Hunt';
  let host = '';
  try { host = new URL(website).hostname; } catch { return 'Website link looks broken'; }
  if (WEAK_HOSTS.test(host)) return `Site lives on a free/builder host (${host})`;
  return null;
}

// Returns lead rows (lead_kind 'prospect'). Feed-only launches are kept only if the text reads like an early-stage product.
export function leadsFromLaunches(posts, { scorer, max = 10, nowIso = new Date().toISOString() }) {
  const out = [];
  for (const p of posts) {
    if (out.length >= max) break;
    const text = `${p.name}. ${p.tagline} ${p.description || ''}`;
    const cls = scorer.classify(p.name, p.tagline);
    let weak = null;
    if (p.api) {
      weak = siteWeakness(p.website);
      if (!weak) continue;
    } else if (!(STAGE_RE.test(text) || ['Website', 'App', 'Design'].includes(cls.category))) continue;
    const category = cls.category || 'Website';
    const trust = p.api ? 66 : 58;
    out.push({
      title: `${p.name} launched on Product Hunt: ${p.tagline}`.slice(0, 300),
      description: [
        p.tagline, p.description && p.description !== p.tagline ? p.description : '',
        'Outbound prospect: this maker did not ask for help. Found in the Product Hunt launch feed.',
        weak ? `Why: ${weak}.` : 'Site not checked (the public feed does not list it). Add a Product Hunt token in Settings to check sites.',
      ].filter(Boolean).join('\n').slice(0, 4000),
      url: p.url, budget: 'TBD', source: 'Product Hunt', source_detail: 'new launches (outbound prospect)', type: 'Outbound', status: 'New',
      category, categories: cls.categories && cls.categories.length ? cls.categories : [category], tags: ['Outbound prospect', 'product hunt'],
      author: p.maker, author_info: 'Maker on Product Hunt', contact: null, posted_at: p.createdAt || null,
      trust_score: trust, trust_level: trust >= 70 ? 'High' : 'Medium', is_suspicious: false,
      flags: ['Outbound prospect: they did not ask for help', weak || 'Website not checked'],
      lead_kind: 'prospect', alerted_at: nowIso, website: p.website || null,
      enrich_status: p.api && p.website ? 'pending' : 'skipped', socials: {},
    });
  }
  return out;
}
