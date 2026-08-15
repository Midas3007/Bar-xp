/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07080d',
          900: '#0b0d14',
          850: '#0f1119',
          800: '#141824',
          750: '#1a1f2e',
          700: '#232838',
          600: '#333a4d',
          500: '#4a5266',
        },
        forge: {
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
        },
        ember: {
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
        },
        vital: {
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
        },
        arcane: {
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgb(255 255 255 / 0.06), 0 8px 32px -8px rgb(0 0 0 / 0.7)',
        'glow-forge': '0 0 24px -4px rgb(56 189 248 / 0.45)',
        'glow-ember': '0 0 24px -4px rgb(251 146 60 / 0.45)',
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
          '0%': { boxShadow: '0 0 0 0 rgb(56 189 248 / 0.5)' },
          '70%': { boxShadow: '0 0 0 12px rgb(56 189 248 / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(56 189 248 / 0)' },
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
