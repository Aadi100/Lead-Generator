import type { Metadata, Viewport } from 'next';
import { Fira_Code, Fira_Sans } from 'next/font/google';
import './globals.css';
import { AuroraBackground } from '@/components/ui/Aurora';
import ThemeProvider, { THEME_INIT_SCRIPT } from '@/components/theme/ThemeProvider';

const sans = Fira_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans', display: 'swap' });
const mono = Fira_Code({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Lead Radar',
  description: 'Find, win and manage leads for web, app, design and game-trading work',
  applicationName: 'Lead Radar',
  icons: { icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }] },
  appleWebApp: { capable: true, title: 'Lead Radar', statusBarStyle: 'black-translucent' },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F8FAFC' },
    { media: '(prefers-color-scheme: dark)', color: '#0B1220' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="relative min-h-screen bg-transparent font-sans text-fg antialiased">
        <ThemeProvider>
          <AuroraBackground />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
