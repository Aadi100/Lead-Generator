import { fetchJson } from './http-fetch.mjs';

export const TYPE_TAGS = {
  restaurant: ['amenity', 'restaurant'],
  cafe: ['amenity', 'cafe'],
  bakery: ['shop', 'bakery'],
  hairdresser: ['shop', 'hairdresser'],
  beauty: ['shop', 'beauty'],
  dentist: ['amenity', 'dentist'],
  gym: ['leisure', 'fitness_centre'],
  clothes: ['shop', 'clothes'],
  florist: ['shop', 'florist'],
  car_repair: ['shop', 'car_repair'],
};

export function tagFor(type) {
  const t = String(type || '').trim();
  if (TYPE_TAGS[t]) return TYPE_TAGS[t];
  const m = /^([a-z_:]+)=([a-z_]+)$/i.exec(t);
  return m ? [m[1], m[2]] : null;
}

export const typeLabel = (type) => String(type).includes('=') ? String(type).split('=')[1].replace(/_/g, ' ') : String(type).replace(/_/g, ' ');

export async function geocodeCity(city) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
  const r = await fetchJson(url, { gapMs: 1100 });
  const hit = Array.isArray(r.json) ? r.json[0] : null;
  if (!hit || !hit.boundingbox) throw new Error(`Could not find "${city}" on OpenStreetMap${r.error ? ' (' + r.error + ')' : ''}`);
  const [south, north, west, east] = hit.boundingbox.map(Number);
  return { bbox: [south, west, north, east], display: hit.display_name };
}

export async function fetchBusinessesWithoutWebsite(bbox, type, max = 150) {
  const pair = tagFor(type);
  if (!pair) return [];
  const [s, w, n, e] = bbox;
  const q = `[out:json][timeout:45];nwr["${pair[0]}"="${pair[1]}"]["name"][!"website"][!"contact:website"][!"url"](${s},${w},${n},${e});out center tags ${max};`;
  const r = await fetchJson('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(q),
    timeoutMs: 60000,
    gapMs: 2000,
  });
  if (!r.ok || !r.json) throw new Error(`Overpass ${r.status || r.error || 'error'}`);
  return (r.json.elements || []).filter((el) => el.tags && el.tags.name).map((el) => ({ osmType: el.type, osmId: el.id, tags: el.tags, type }));
}

const tag = (t, ...keys) => {
  for (const k of keys) if (t[k]) return String(t[k]).trim();
  return '';
};

export function buildProspectRow(el, city) {
  const t = el.tags;
  const name = t.name;
  const label = typeLabel(el.type);
  const phone = tag(t, 'phone', 'contact:phone', 'mobile', 'contact:mobile');
  const email = tag(t, 'email', 'contact:email').toLowerCase();
  const hours = tag(t, 'opening_hours');
  const address = [[t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '), t['addr:suburb'], t['addr:city'], t['addr:postcode']].filter(Boolean).join(', ');
  const url = `https://www.openstreetmap.org/${el.osmType}/${el.osmId}`;
  const trust = Math.min(80, 55 + (phone ? 8 : 0) + (email ? 8 : 0) + (hours ? 4 : 0));
  const socials = {};
  const fb = tag(t, 'contact:facebook', 'facebook');
  const ig = tag(t, 'contact:instagram', 'instagram');
  if (/^https?:\/\//i.test(fb)) socials.facebook = fb;
  if (/^https?:\/\//i.test(ig)) socials.instagram = ig;
  const lines = [`Type: ${label}`, address && `Address: ${address}`, phone && `Phone: ${phone}`, email && `Email: ${email}`, hours && `Opening hours: ${hours}`, 'OpenStreetMap lists no website for this business.'].filter(Boolean);
  return {
    title: `${name} in ${t['addr:city'] || city} has no website`,
    description: lines.join('\n'),
    url,
    budget: 'TBD',
    source: 'OpenStreetMap',
    source_detail: city,
    type: 'Outbound',
    status: 'New',
    category: 'Website',
    categories: ['Website'],
    tags: [label],
    author: name,
    author_info: address || null,
    contact: [phone && `phone: ${phone}`, email && `email: ${email}`].filter(Boolean).join(' · ') || null,
    trust_score: trust,
    trust_level: trust >= 70 ? 'High' : 'Medium',
    is_suspicious: false,
    flags: ['OpenStreetMap data can be out of date: confirm the business is open'],
    lead_kind: 'prospect',
    alerted_at: new Date().toISOString(),
    enrich_status: 'pending',
    socials,
    _rank: (phone ? 1 : 0) + (email ? 2 : 0) + (hours ? 0.5 : 0),
  };
}
