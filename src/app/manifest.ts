import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  const icon = { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' };
  return {
    id: '/',
    name: 'Lead Radar',
    short_name: 'Lead Radar',
    description: 'Find, win and manage leads for web, app, design and game-trading work',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0B1220',
    theme_color: '#2563EB',
    categories: ['business', 'productivity'],
    icons: [
      { ...icon, purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Leads', url: '/leads', icons: [icon] },
      { name: 'Outbox', url: '/outbox', icons: [icon] },
      { name: 'Tasks', url: '/tasks', icons: [icon] },
    ],
  };
}
