/**
 * Colour lives in `src/index.css` as CSS custom properties; this file only
 * names them. Channels come through as `rgb(var(--x) / <alpha-value>)` so the
 * `/nn` alpha modifier still works on every semantic utility.
 */
const rgb = (v) => `rgb(var(${v}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          base: rgb('--surface-base'),
          sunken: rgb('--surface-sunken'),
          raised: rgb('--surface-raised'),
          overlay: rgb('--surface-overlay'),
          inset: rgb('--surface-inset'),
          strong: rgb('--surface-strong'),
          // These three carry their own alpha — use them without a modifier.
          hover: 'var(--surface-hover)',
          active: 'var(--surface-active)',
          scrim: 'var(--surface-scrim)',
        },
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
        },
        content: {
          DEFAULT: rgb('--content'),
          strong: rgb('--content-strong'),
          muted: rgb('--content-muted'),
          subtle: rgb('--content-subtle'),
          faint: rgb('--content-faint'),
        },
        'on-accent': rgb('--on-accent'),
        focus: rgb('--ring-focus'),

        forge: { DEFAULT: rgb('--forge'), vivid: rgb('--forge-vivid') },
        ember: { DEFAULT: rgb('--ember'), vivid: rgb('--ember-vivid') },
        vital: { DEFAULT: rgb('--vital'), vivid: rgb('--vital-vivid') },
        arcane: { DEFAULT: rgb('--arcane'), vivid: rgb('--arcane-vivid') },
        tide: { DEFAULT: rgb('--tide'), vivid: rgb('--tide-vivid') },
        danger: { DEFAULT: rgb('--danger'), vivid: rgb('--danger-vivid') },
        warn: { DEFAULT: rgb('--warn'), vivid: rgb('--warn-vivid') },

        // Tier names rendered as text — one theme-aware tone per rank.
        rank: {
          stone: rgb('--rank-stone'),
          bronze: rgb('--rank-bronze'),
          silver: rgb('--rank-silver'),
          gold: rgb('--rank-gold'),
          platinum: rgb('--rank-platinum'),
          diamond: rgb('--rank-diamond'),
          mythic: rgb('--rank-mythic'),
          legend: rgb('--rank-legend'),
          ascendant: rgb('--rank-ascendant'),
          immortal: rgb('--rank-immortal'),
          apex: rgb('--rank-apex'),
        },

        // Fixed decorative metals and gems for filled tier badges and cosmetic
        // name gradients. Intentionally theme-independent: these are always a
        // saturated fill with near-black text on top, which reads on either
        // background.
        prestige: {
          ink: '#0a0c12',
          stone: '#94a3b8',
          'stone-deep': '#64748b',
          bronze: '#d97706',
          'bronze-deep': '#92400e',
          silver: '#e2e8f0',
          'silver-deep': '#94a3b8',
          gold: '#facc15',
          'gold-deep': '#ca8a04',
          platinum: '#5eead4',
          'platinum-deep': '#0891b2',
          diamond: '#818cf8',
          'diamond-deep': '#0284c7',
          mythic: '#c084fc',
          'mythic-deep': '#c026d3',
          legend: '#fb7185',
          'legend-deep': '#f97316',
          aqua: '#a5f3fc',
          'aqua-deep': '#5eead4',
          violet: '#e879f9',
          'violet-deep': '#8b5cf6',
          amber: '#fcd34d',
          'amber-deep': '#f59e0b',
          rose: '#f43f5e',
          'rose-deep': '#e11d48',
          white: '#ffffff',
        },
      },
      spacing: {
        // Height of the mobile bottom bar, including the notch inset. Derived
        // in one place so the sticky session summary cannot drift out of sync
        // with the nav the way a hardcoded `bottom-[57px]` did.
        nav: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))',
        'nav-offset': 'calc(5.5rem + env(safe-area-inset-bottom, 0px))',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px var(--line), 0 8px 32px -8px rgb(0 0 0 / 0.35)',
        'glow-forge': '0 0 24px -6px rgb(var(--forge-vivid) / 0.45)',
        'glow-ember': '0 0 24px -6px rgb(var(--ember-vivid) / 0.45)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--forge) / 0.5)' },
          '70%': { boxShadow: '0 0 0 12px rgb(var(--forge) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--forge) / 0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
        'scale-in': 'scale-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 2.5s linear infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
