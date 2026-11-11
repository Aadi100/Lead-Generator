// Game dictionary used to find which game a trade post is about.
const GAMES = [
  ['Fortnite', ['fortnite', 'v-bucks', 'vbucks', 'og fortnite']],
  ['Valorant', ['valorant', 'valorant points']],
  ['League of Legends', ['league of legends', 'lol account', 'lol accounts', 'lol smurf', 'lol smurfs', 'lol boosting', 'riot points']],
  ['CS2', ['cs2', 'csgo', 'cs:go', 'cs go', 'counter-strike', 'counter strike', 'global offensive']],
  ['Genshin Impact', ['genshin impact', 'genshin', 'genesis crystals', 'primogems']],
  ['Honkai Star Rail', ['honkai star rail', 'honkai: star rail', 'honkai', 'hsr']],
  ['Zenless Zone Zero', ['zenless zone zero', 'zzz account']],
  ['Wuthering Waves', ['wuthering waves']],
  ['Marvel Rivals', ['marvel rivals']],
  ['Roblox', ['roblox', 'robux', 'adopt me', 'blox fruits', 'murder mystery 2', 'mm2', 'pet simulator']],
  ['Minecraft', ['minecraft']],
  ['GTA', ['gta v', 'gta 5', 'gta5', 'gtav', 'gta online', 'gta']],
  ['Rocket League', ['rocket league']],
  ['Apex Legends', ['apex legends', 'apex']],
  ['Call of Duty', ['call of duty', 'warzone', 'cod mobile', 'modern warfare', 'black ops', 'cod']],
  ['EA FC', ['ea fc', 'fifa', 'fc 24', 'fc 25', 'fc 26', 'ultimate team', 'fut']],
  ['Clash of Clans', ['clash of clans', 'coc']],
  ['Clash Royale', ['clash royale']],
  ['Brawl Stars', ['brawl stars']],
  ['Mobile Legends', ['mobile legends', 'mlbb']],
  ['PUBG', ['pubg mobile', 'pubg', 'bgmi']],
  ['Free Fire', ['free fire']],
  ['Diablo', ['diablo immortal', 'diablo 4', 'diablo iv', 'diablo 3', 'diablo iii', 'diablo 2', 'diablo ii', 'diablo']],
  ['World of Warcraft', ['world of warcraft', 'wow classic', 'wow account', 'wow gold', 'wow boost']],
  ['RuneScape', ['old school runescape', 'runescape', 'osrs', 'rs3']],
  ['Rainbow Six Siege', ['rainbow six siege', 'rainbow six', 'r6 siege', 'r6s']],
  ['Overwatch', ['overwatch']],
  ['Destiny 2', ['destiny 2', 'destiny2']],
  ['Pokemon Go', ['pokemon go', 'pokémon go', 'pogo']],
  ['Albion Online', ['albion online', 'albion']],
  ['Lost Ark', ['lost ark']],
  ['Path of Exile', ['path of exile', 'poe2']],
  ['Escape from Tarkov', ['escape from tarkov', 'tarkov']],
  ['Dota 2', ['dota 2', 'dota2', 'dota']],
  ['Monopoly GO', ['monopoly go']],
  ['Raid Shadow Legends', ['raid shadow legends', 'raid: shadow legends']],
  ['Steam', ['steam account', 'steam accounts', 'steam gift', 'steam key', 'steam keys']],
  ['Epic Games', ['epic games account']],
  ['PlayStation', ['playstation', 'psn', 'ps5', 'ps4']],
  ['Xbox', ['xbox']],
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
const compile = (aliases) => new RegExp('(?<![a-z0-9])(' + [...aliases].sort((a, b) => b.length - a.length).map(esc).join('|') + ')(?![a-z0-9])', 'gi');
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// extraGames: names the user added (Settings > Trading) or used in their sell/want entries.
export function buildGameIndex(extraGames = []) {
  const index = GAMES.map(([name, aliases]) => ({ name, aliases: aliases.map((a) => a.toLowerCase()) }));
  for (const raw of extraGames) {
    const name = String(raw || '').trim();
    if (name.length < 2) continue;
    const hit = index.find((g) => g.name.toLowerCase() === name.toLowerCase() || g.aliases.includes(name.toLowerCase()));
    if (hit) continue;
    index.push({ name, aliases: [name.toLowerCase()] });
  }
  for (const g of index) g.re = compile(g.aliases);
  return index;
}

export function findGame(title, body, index) {
  let best = null;
  for (const g of index) {
    const t = (String(title || '').match(g.re) || []).length;
    const b = (String(body || '').match(g.re) || []).length;
    const score = t * 3 + Math.min(b, 3);
    if (score > 0 && (!best || score > best.score)) best = { name: g.name, score };
  }
  return best ? best.name : null;
}

export function resolveGame(name, index) {
  const n = norm(name);
  if (!n) return '';
  const hit = index.find((g) => norm(g.name) === n || g.aliases.some((a) => norm(a) === n));
  return hit ? hit.name : String(name).trim();
}

// Posts in a game's own trading subreddit often do not repeat the game name.
const SUB_GAME = {
  rocketleagueexchange: 'Rocket League', rocketleaguetrading: 'Rocket League', globaloffensivetrade: 'CS2', csgomarketforum: 'CS2',
  fortnitetrading: 'Fortnite', robloxtrading: 'Roblox', valoranttrading: 'Valorant', diablo4trading: 'Diablo',
  mobilelegendstrading: 'Mobile Legends', genshinimpacttrading: 'Genshin Impact',
};
export const gameForSubreddit = (sub) => SUB_GAME[String(sub || '').replace(/^r\//i, '').toLowerCase()] || null;

export const GAME_NAMES = GAMES.map(([n]) => n);
export const sameGame = (a, b, index) => !!a && !!b && norm(resolveGame(a, index)) === norm(resolveGame(b, index));
