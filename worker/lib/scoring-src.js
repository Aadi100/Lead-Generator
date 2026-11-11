// ===== Lead intelligence (identical copy lives in every workflow's Code node) =====
const TARGET = (() => {
  try { const v = $('Load targeting').first().json.value; return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
})();
const lowerList = (a, max) => (Array.isArray(a) ? a : []).map((s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()).filter((s) => s.length >= 2 && s.length <= 60).slice(0, max);
const CUSTOM_WORDS = [...new Set([...lowerList(TARGET.keywords, 60), ...lowerList(TARGET.topics, 40)])];
const EXCLUDE_WORDS = lowerList(TARGET.exclude, 40);
const CATEGORY_WORDS = {
  Website: ['website','websites','web site','web app','web application','webapp','landing page','wordpress','woocommerce','shopify','wix','webflow','squarespace','e-commerce','ecommerce','online store','web developer','web development','web design','web designer','front-end','frontend','front end','full-stack','full stack','fullstack','next.js','nextjs','reactjs','react.js','laravel','django','saas','cms','portfolio site','portfolio website','html','css'],
  App: ['mobile app','mobile application','ios app','android app','iphone app','app developer','app development','flutter','react native','swiftui','kotlin','mvp','app store','play store','build an app','build me an app','develop an app','ios developer','android developer'],
  Design: ['logo','logos','branding','brand identity','brand design','graphic design','graphic designer','ui/ux','ui ux','ux design','ui design','ux designer','ui designer','figma','photoshop','illustrator','canva','poster','flyer','brochure','packaging','infographic','banner','banners','social media graphics','social media design','thumbnail','thumbnails','pitch deck','presentation design','mockup','mockups','business card','label design','merch design','t-shirt design','book cover','cover design','brand guidelines','style guide','icon set'],
  Automation: ['n8n','zapier','make.com','automation','automations','automate','chatbot','ai agent','ai agents','ai automation','api integration','web scraping','scraper','crm','workflow','openai','llm','discord bot','telegram bot'],
};
const BUYER = ['looking for','looking to hire','looking for someone','in need of','need a','need an','need someone','need help','need to hire','want to hire','want someone','seeking','searching for','who can build','can anyone build','help me build','anyone who can','hire a','hire an','hiring a','hiring an','i need','we need','we are looking','i am looking',"i'm looking",'will pay','paying','budget','recommend a','hiring'];
const SELLER = ['[for hire]','[offer]','[offering]','[available]','for hire','hire me','available for','available now','open for work','open for commissions','commissions open','taking commissions','i will','i can','i do','i offer','i build','i design','my services','my portfolio','accepting clients','dm for rates','services offered'];
const DISPOSABLE = ['mailinator.com','guerrillamail.com','10minutemail.com','tempmail.com','yopmail.com','trashmail.com','sharklasers.com','getnada.com','dispostable.com','throwawaymail.com','maildrop.cc'];

const SEVERE = [
  [/(registration|processing|application|training|security|starter)\s+fee|you (must|need to|will need to) pay|refundable deposit|western union|moneygram/i, 'Asks the freelancer to pay money first'],
  [/gift ?cards?|crypto ?wallet|bitcoin wallet|\busdt\b|investment opportunity|guaranteed (income|returns?|profit)|get rich|passive income/i, 'Investment / easy-money bait'],
  [/(check|cheque) (will be|is) (sent|mailed)|deposit (the )?(check|cheque)|overpay|equipment (purchase|check)/i, 'Cheque / overpayment scam wording'],
  [/\bssn\b|social security|passport (copy|scan)|bank (login|details|account number)|credit card number/i, 'Asks for sensitive personal or bank details'],
];
const MEDIUM = [
  [/\b(unpaid|equity only|rev(enue)?[- ]?share only|profit[- ]?share only|sweat equity|for free|free of charge|no pay|spec work)\b|\b(for|in|as|paid in) exposure\b|\bexposure only\b/i, 'Unpaid / exposure-only work'],
  [/\b(pay(ment)? (outside|off)|outside (of )?)(the )?(platform|upwork|fiverr|freelancer)\b/i, 'Wants to work or pay outside the platform'],
  [/\b(bit\.ly|tinyurl\.com|t\.co|goo\.gl|cutt\.ly|rb\.gy|shorturl\.at|is\.gd)\//i, 'Contains a shortened link'],
  [/no experience (needed|required)[\s\S]{0,200}(weekly pay|per (day|week))|(weekly pay|per (day|week))[\s\S]{0,200}no experience (needed|required)/i, '"No experience" + fixed pay wording (job-scam pattern)'],
];
const MINOR = [
  [/(\burgent\b|\basap\b|immediately|limited slots|today only)[\s\S]*!!|!!![\s\S]*(\burgent\b|\basap\b)/i, 'Pressure / urgency wording'],
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
const mk = (list) => new RegExp('(?<![a-z0-9])(' + list.map(esc).join('|') + ')(?![a-z0-9])', 'gi');
const has = (re, s) => s.search(re) !== -1;
if (CUSTOM_WORDS.length) CATEGORY_WORDS.Other = CUSTOM_WORDS;
const CAT_RE = Object.fromEntries(Object.entries(CATEGORY_WORDS).map(([k, v]) => [k, mk(v)]));
const EXCLUDE_RE = EXCLUDE_WORDS.length ? mk(EXCLUDE_WORDS) : null;
const CUSTOM_RE = CUSTOM_WORDS.length ? mk(CUSTOM_WORDS) : null;
const BUYER_RE = mk(BUYER);
const SELLER_RE = mk(SELLER);
const BUYER_TAG_RE = /\[(hiring|task|commission|paid)\]/i;
const ROLE_RE = /(developer|designer|freelanc|programmer|engineer|agency|expert|specialist|someone (to|who|that)|somebody (to|who)|anyone (who|that|to)|\bdev\b|coder|consultant)/i;
const FX = { '$': 1, usd: 1, '€': 1.08, eur: 1.08, '£': 1.27, gbp: 1.27, cad: 0.73, aud: 0.65, '₹': 0.012, inr: 0.012, pkr: 0.0036 };
const FREE_HOSTS = /(reddit\.com|redd\.it|imgur\.com|giphy\.com|discord\.gg|youtube\.com|youtu\.be|wikipedia\.org)/i;

function decode(s) {
  return s.replace(/&nbsp;|&#32;|&#160;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#x2F;/g, '/').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, '&');
}
function stripHtml(h) {
  if (!h) return '';
  let t = String(h)
    .replace(/<\s*br\s*\/?>/gi, '\n').replace(/<p>/gi, '\n').replace(/<\/(p|div|li|h\d|tr|pre)>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, txt) => {
      const label = txt.replace(/<[^>]+>/g, '').trim();
      return label && !href.includes(label) && label !== href ? `${label} (${href})` : href;
    })
    .replace(/<[^>]+>/g, '');
  t = decode(t);
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

const NOISE_RE = /\b(closers?|setters?|sales (reps?|agents?)|appointment setting|cold call(er|ing)?|data entry|virtual assistant|transcription|survey|moderators?|chat support|customer support|telemarket\w*|affiliate|network marketing|mlm|seo|link building|social media (marketing|management)|lead generation|copywriting|copywriter|content writ\w+|translat\w+|video editing|bookkeeping|accounting)\b/i;
const CONTRACT_RE = /\b(contract|contractor|freelance|freelancer|part[- ]time|project[- ]based|short[- ]term)\b/i;
function classify(title, body, extra) {
  if (NOISE_RE.test(title) && !(CUSTOM_RE && has(CUSTOM_RE, title))) return { category: null, categories: [], tags: [] };
  if (EXCLUDE_RE && has(EXCLUDE_RE, title + ' ' + body.slice(0, 1500))) return { category: null, categories: [], tags: [] };
  const scores = {}; const tags = new Set();
  for (const [cat, re] of Object.entries(CAT_RE)) {
    let s = 0;
    for (const m of title.matchAll(re)) { s += 3; tags.add(m[1].toLowerCase()); }
    for (const m of body.matchAll(re)) { s += 1; tags.add(m[1].toLowerCase()); }
    if (extra) for (const m of extra.matchAll(re)) { s += 1; tags.add(m[1].toLowerCase()); }
    if (s) scores[cat] = s;
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return { category: ranked.length ? ranked[0][0] : null, categories: ranked.map((e) => e[0]), tags: [...tags].slice(0, 8) };
}

const SEEKER_RE = /\b(looking for|searching for|seeking) (work|a job|jobs|clients|gigs|freelance (work|gigs|clients)|opportunit\w+|projects|employment|a position|a role)\b|\b(tips|advice|feedback|critique|thoughts on|rate my|review my|career|salary|rant)\b|\bam i\b|\bhow to find (clients|work)\b/i;
function isSeller(title, body) {
  const t = title.toLowerCase();
  if (BUYER_TAG_RE.test(t)) return false;
  if (has(SELLER_RE, t) || SEEKER_RE.test(t)) return true;
  const head = body.slice(0, 250);
  if (/\bi['’]?m an? [a-z\- ]{0,40}(developer|designer|freelancer|engineer|agency)\b/i.test(head)) return true;
  if (/\bwe are an? (web |design |software |creative )?(agency|studio|company|team)\b/i.test(head)) return true;
  return false;
}
const NEED_RE = /\bneed(ed)? (an? |some |to hire )?(\w+ ){0,2}(developer|designer|programmer|freelancer|website|app|logo)\b|\b(developer|designer|programmer|freelancer) wanted\b/i;
function hasBuyerIntent(title, body) {
  if (BUYER_TAG_RE.test(title)) return true;
  const t = title + ' ' + body.slice(0, 700);
  return has(BUYER_RE, t) || NEED_RE.test(t);
}

function num(n, k) { let v = parseFloat(n); if (k) v *= 1000; return v; }
function extractBudget(text) {
  const t = text.replace(/(\d),(\d{3})/g, '$1$2');
  const found = [];
  const re1 = /(\$|€|£|₹|\b(?:usd|eur|gbp|cad|aud|inr|pkr))\s?(\d+(?:\.\d+)?)\s?(k\b)?(?:\s?(?:-|–|—|to)\s?(?:\$|€|£|₹)?\s?(\d+(?:\.\d+)?)\s?(k\b)?)?(\s?(?:\/|per|an?)\s?(?:hr|hour))?/gi;
  for (const m of t.matchAll(re1)) {
    const lo = num(m[2], m[3]); const hi = m[4] ? num(m[4], m[5] || m[3]) : null;
    if (!(lo >= 1)) continue;
    found.push({ idx: m.index, cur: m[1], lo, hi, hourly: !!m[6], fx: FX[m[1].toLowerCase()] ?? 1 });
  }
  const re2 = /(\d+(?:\.\d+)?)\s?(k\b)?\s?(usd|eur|gbp|cad|aud|inr|pkr|dollars|bucks)\b/gi;
  for (const m of t.matchAll(re2)) {
    const c = m[3].toLowerCase(); const lo = num(m[1], m[2]);
    if (!(lo >= 1)) continue;
    found.push({ idx: m.index, cur: c === 'dollars' || c === 'bucks' ? '$' : m[3].toUpperCase(), lo, hi: null, hourly: false, fx: FX[c] ?? 1 });
  }
  if (!found.length) return null;
  const pick = found.find((f) => /budget|pay|paying|offer|rate/i.test(t.slice(Math.max(0, f.idx - 40), f.idx))) || found[0];
  const sym = ['$', '€', '£', '₹'].includes(pick.cur) ? pick.cur : pick.cur.toUpperCase() + ' ';
  const label = pick.hi ? `${sym}${pick.lo}–${sym}${pick.hi}` : `${sym}${pick.lo}`;
  return { text: label + (pick.hourly ? '/hr' : ''), amount: Math.round((pick.hi || pick.lo) * pick.fx), hourly: pick.hourly };
}

function extractContacts(text) {
  const out = [];
  const emails = [...new Set(text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g) || [])]
    .filter((e) => !/\.(png|jpe?g|gif|webp)$/i.test(e)).slice(0, 3);
  emails.forEach((e) => out.push('email: ' + e));
  const tg = text.match(/(?:t\.me\/|telegram[^\n@:]{0,12}[:@]\s*@?)([A-Za-z0-9_]{4,32})/i);
  if (tg) out.push('telegram: @' + tg[1]);
  const wa = text.match(/whats\s?app[^\n\d+]{0,15}(\+?\d[\d\s().-]{7,16}\d)/i);
  if (wa) out.push('whatsapp: ' + wa[1].trim());
  const dc = text.match(/discord[^\n:]{0,10}:\s*@?([A-Za-z0-9_.]{3,32}(?:#\d{4})?)/i);
  if (dc) out.push('discord: ' + dc[1]);
  const urls = [...new Set((text.match(/https?:\/\/[^\s)<>\]"']+/g) || []).map((u) => u.replace(/[.,;]+$/, '')))]
    .filter((u) => !FREE_HOSTS.test(u)).slice(0, 2);
  urls.forEach((u) => out.push('site: ' + u.replace(/^https?:\/\//, '').slice(0, 80)));
  return out;
}

function assess(c, ctx) {
  const flags = []; let severe = 0, medium = 0, minor = 0;
  const add = (sev, label) => {
    if (flags.includes(label)) return; flags.push(label);
    if (sev === 'severe') severe++; else if (sev === 'medium') medium++; else minor++;
  };
  const text = c.text;
  for (const [re, label] of SEVERE) if (re.test(text)) add('severe', label);
  for (const [re, label] of MEDIUM) if (re.test(text)) add('medium', label);
  for (const [re, label] of MINOR) if (re.test(text)) add('minor', label);

  const emails = c.contacts.filter((x) => x.startsWith('email:')).map((x) => x.slice(7).toLowerCase());
  const hasSite = c.contacts.some((x) => x.startsWith('site:'));
  if (emails.some((e) => DISPOSABLE.includes(e.split('@')[1]))) add('medium', 'Disposable email address');
  if (/(telegram|whatsapp|signal)/i.test(text) && !emails.length && !hasSite) add('minor', 'Asks to continue on Telegram/WhatsApp only');
  if (/(dm me|pm me|message me|inbox me)/i.test(text) && c.body.length < 120 && !c.budget && c.source !== 'Web Form') add('medium', 'No details given, "DM me" only');

  const letters = c.title.replace(/[^A-Za-z]/g, '');
  if (letters.length > 15 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6) add('minor', 'Title is mostly ALL CAPS');
  if (c.source !== 'Web Form' && c.body.length < 80 && !ctx.snippetOnly) add('minor', 'Very little detail in the post');
  if (ctx.snippetOnly) add('minor', 'Only a short preview is available: open the post to confirm details');
  if (/^\/?u?\/?\[deleted\]$/i.test(c.author || '')) add('medium', 'Author account was deleted');

  if (c.budget && c.budget.amount != null) {
    if (!c.budget.hourly) {
      if (c.budget.amount < 15) add('medium', 'Budget is extremely low for this kind of work');
      else if (c.budget.amount > 200000) add('medium', 'Budget looks unrealistically high');
    } else if (c.budget.amount < 5) add('minor', 'Hourly rate is very low');
  }
  if (c.author && ctx.authorCounts && ctx.authorCounts[c.author] >= 3) add('medium', `Same author posted ${ctx.authorCounts[c.author]} leads in one batch (possible spam)`);
  for (const f of ctx.extraFlags || []) add(f.sev, f.label);

  let score = 50;
  if (c.contacts.length) score += 8;
  if (emails.length || hasSite) score += 6;
  if (c.budget) { score += 10; if (c.budget.hourly || (c.budget.amount >= 15 && c.budget.amount <= 100000)) score += 4; }
  if (c.body.length >= 1000) score += 12; else if (c.body.length >= 400) score += 8; else if (c.body.length < 120) score -= 6;
  if (c.category) score += 6;
  if (/\b(deadline|within \d+|\d+\s?(days?|weeks?|months?)|timeline|launch)\b/i.test(text)) score += 4;
  score += ctx.bonus || 0;
  score -= Math.min(severe, 2) * 35 + medium * 14 + minor * 6;
  score = Math.max(5, Math.min(98, Math.round(score)));
  const level = score >= 70 ? 'High' : score >= 45 ? 'Medium' : 'Low';
  return { score, level, suspicious: severe > 0 || medium >= 2 || score < 35, flags };
}

function buildLead(o) {
  const title = (o.title || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const body = (o.body || '').trim();
  const text = title + '\n' + body;
  const cls = classify(title, body, o.classifyExtra);
  const budget = o.budget !== undefined ? o.budget : extractBudget(text);
  const contacts = [...new Set((o.contacts || []).concat(extractContacts(text)))];
  const ctx = o.ctx || {};
  const a = assess({ title, body, text, contacts, budget, category: cls.category, source: o.source, author: o.author }, ctx);
  return {
    title,
    description: (body || title).slice(0, 4000),
    url: o.url,
    budget: budget ? budget.text : 'TBD',
    budget_amount: budget ? budget.amount : null,
    source: o.source,
    source_detail: o.sourceDetail || null,
    type: o.type || 'Outbound',
    status: 'New',
    category: cls.category,
    categories: JSON.stringify(cls.categories),
    tags: JSON.stringify(o.extraTags ? [...new Set([...cls.tags, ...o.extraTags])].slice(0, 8) : cls.tags),
    author: o.author || null,
    author_info: o.authorInfo || null,
    contact: contacts.join(' · ') || null,
    posted_at: o.postedAt || null,
    trust_score: a.score,
    trust_level: a.level,
    is_suspicious: a.suspicious,
    flags: JSON.stringify(a.flags),
  };
}
// ===== end shared =====
