import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#006a36',
        'primary-dark': '#005229',
        'primary-container': '#138648',
        'light-green': '#E8F5EE',
        'warm-white': '#F8FAF9',
        navy: '#0F1F2E',
        'neutral-gray': '#6B7280',
        'border-gray': '#E5E7EB',
        'alert-orange': '#F59E0B',
        'success-green': '#10B981',
        'danger-red': '#EF4444',
        gold: '#D4AF37',
        surface: '#f9f9ff',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      fontSize: {
        h1: ['24px', { lineHeight: '32px', fontWeight: '700' }],
        h2: ['18px', { lineHeight: '24px', fontWeight: '600' }],
        body: ['14px', { lineHeight: '20px', fontWeight: '400' }],
        caption: ['12px', { lineHeight: '16px', fontWeight: '400' }],
        cta: ['16px', { lineHeight: '24px', fontWeight: '600' }],
      },
      borderRadius: {
        card: '12px',
        input: '8px',
        pill: '9999px',
      },
      boxShadow: {
        card: '0 2px 8px rgba(0,0,0,0.08)',
        'card-up': '0 -2px 12px rgba(0,0,0,0.08)',
      },
      minHeight: {
        touch: '48px',
      },
      minWidth: {
        touch: '48px',
      },
    },
  },
  plugins: [],
} satisfies Config
