import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

// Semantic tokens live in src/app/globals.css as space-separated RGB triplets so alpha modifiers work (bg-primary/20).
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/pages/**/*.{js,ts,jsx,tsx,mdx}', './src/components/**/*.{js,ts,jsx,tsx,mdx}', './src/app/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: ['selector', "[data-theme='dark']"],
  theme: {
    extend: {
      colors: {
        canvas: v('bg'),
        surface: { DEFAULT: v('surface'), 2: v('surface-2') },
        border: { DEFAULT: v('border'), strong: v('border-strong') },
        fg: { DEFAULT: v('fg'), muted: v('fg-muted'), subtle: v('fg-subtle') },
        primary: { DEFAULT: v('primary'), hi: v('primary-hi'), hover: v('primary-hover'), text: v('primary-text'), soft: v('primary-soft'), border: v('primary-border'), on: v('on-primary') },
        accent: { DEFAULT: v('accent'), hover: v('accent-hover'), text: v('accent-text'), soft: v('accent-soft'), on: v('on-accent') },
        success: { DEFAULT: v('success'), soft: v('success-soft'), border: v('success-border'), solid: v('success-solid') },
        warning: { DEFAULT: v('warning'), soft: v('warning-soft'), border: v('warning-border'), solid: v('warning-solid') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft'), border: v('danger-border'), solid: v('danger-solid') },
        info: { DEFAULT: v('info'), soft: v('info-soft'), border: v('info-border'), solid: v('info-solid') },
        ring: v('ring'),
        cat: {
          website: { DEFAULT: v('cat-website'), soft: v('cat-website-soft') },
          app: { DEFAULT: v('cat-app'), soft: v('cat-app-soft') },
          design: { DEFAULT: v('cat-design'), soft: v('cat-design-soft') },
          automation: { DEFAULT: v('cat-automation'), soft: v('cat-automation-soft') },
          gaming: { DEFAULT: v('cat-gaming'), soft: v('cat-gaming-soft') },
          other: { DEFAULT: v('cat-other'), soft: v('cat-other-soft') },
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Fira Sans', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['var(--font-mono)', 'Fira Code', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: { ctl: '6px', card: '12px' },
      boxShadow: {
        sm: '0 1px 0 rgb(0 0 0 / 0.04)',
        DEFAULT: '0 1px 0 rgb(0 0 0 / 0.04)',
        md: '0 1px 2px rgb(0 0 0 / 0.08)',
        lg: 'var(--shadow-float)',
        xl: 'var(--shadow-float)',
        float: 'var(--shadow-float)',
        glow: '0 0 0 1px rgb(var(--primary) / 0.35), 0 4px 22px rgb(var(--primary) / 0.3)',
      },
      transitionDuration: { fast: '120ms', base: '180ms', slow: '260ms' },
      transitionTimingFunction: { soft: 'cubic-bezier(0.2, 0.8, 0.2, 1)', spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        fadeOut: { from: { opacity: '1' }, to: { opacity: '0' } },
        slideInRight: { from: { opacity: '0', transform: 'translateX(28px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        slideOutRight: { from: { opacity: '1', transform: 'translateX(0)' }, to: { opacity: '0', transform: 'translateX(28px)' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(20px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideDown: { from: { opacity: '1', transform: 'translateY(0)' }, to: { opacity: '0', transform: 'translateY(20px)' } },
        pop: { from: { opacity: '0', transform: 'scale(0.97) translateY(4px)', filter: 'blur(3px)' } },
        popOut: { to: { opacity: '0', transform: 'scale(0.98)' } },
      },
      animation: {
        'fade-in': 'fadeIn var(--dur) var(--ease-out) both',
        'fade-out': 'fadeOut 120ms var(--ease-in) both',
        'slide-in-right': 'slideInRight var(--dur-slow) var(--ease-out) both',
        'slide-out-right': 'slideOutRight 170ms var(--ease-in) both',
        'slide-up': 'slideUp var(--dur-slow) var(--ease-out) both',
        'slide-down': 'slideDown 170ms var(--ease-in) both',
        pop: 'pop var(--dur) var(--ease-out) backwards',
        'pop-out': 'popOut 120ms var(--ease-in) both',
        'page-in': 'page-in 220ms var(--ease-out) backwards',
        'rise-in': 'rise-in var(--dur-slow) var(--ease-out) both',
      },
    },
  },
  plugins: [plugin(({ addVariant }) => addVariant('coarse', '@media (pointer: coarse)'))],
};

export default config;
