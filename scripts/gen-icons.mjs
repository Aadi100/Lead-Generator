// Generates the PWA icons in public/icons from the radar mark (blue tile + white radar glyph).
// Run: node scripts/gen-icons.mjs
import sharp from 'sharp';
import fs from 'node:fs';

const BLUE = '#2563EB';
// glyph is drawn in the 24x24 space of RadarIcon; `scale` sizes it inside the tile.
const svg = (size, { radius, scale }) => {
  const g = (size * scale) / 24;
  const off = (size - 24 * g) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B82F6"/><stop offset="1" stop-color="${BLUE}"/></linearGradient>
  <linearGradient id="sw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0.34"/></linearGradient></defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#s)"/>
  <g transform="translate(${off} ${off}) scale(${g})" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 12 L12 3 A9 9 0 0 1 18.4 5.6 Z" fill="url(#sw)" stroke="none"/>
    <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 19 5"/><circle cx="12" cy="12" r="1" fill="#fff"/>
  </g></svg>`;
};
const out = (name, size, opts) => sharp(Buffer.from(svg(size, opts))).png().toFile(`public/icons/${name}`);
fs.mkdirSync('public/icons', { recursive: true });
await out('icon-192.png', 192, { radius: 44, scale: 0.7 });
await out('icon-512.png', 512, { radius: 118, scale: 0.7 });
await out('icon-maskable-512.png', 512, { radius: 0, scale: 0.5 }); // full-bleed, glyph inside the safe zone
await out('apple-touch-icon.png', 180, { radius: 0, scale: 0.62 }); // iOS rounds the corners itself
await out('badge-96.png', 96, { radius: 48, scale: 0.7 });
fs.writeFileSync('public/icons/icon.svg', svg(512, { radius: 118, scale: 0.7 }));
console.log('icons written');
