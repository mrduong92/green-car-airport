import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand — Skyline Indigo
        primary:           '#1E3A8A',
        'primary-dark':    '#162C6B',
        'primary-tint':    '#EEF2FD',
        'light-green':     '#EEF2FD', // alias for primary-tint — keeps old class names working
        'primary-ring':    'rgba(30,58,138,0.18)',
        gold:              '#C8A24A',
        'gold-tint':       '#FBF5E4',
        // Neutrals
        navy:              '#0F1F2E',
        ink:               '#1B2A3A',
        'neutral-gray':    '#64748B',
        'neutral-dim':     '#94A3B8',
        'border-gray':     '#E5E7EB',
        'border-soft':     '#EEF1F4',
        'warm-white':      '#F6F8FB',
        'bg-alt':          '#F0F3F8',
        surface:           '#FFFFFF',
        // Status
        'alert-orange':    '#F59E0B',
        'success-green':   '#10B981',
        'danger-red':      '#EF4444',
        info:              '#0EA5E9',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        h1:      ['24px', { lineHeight: '30px', fontWeight: '700' }],
        h2:      ['18px', { lineHeight: '24px', fontWeight: '600' }],
        body:    ['14px', { lineHeight: '20px', fontWeight: '400' }],
        caption: ['12px', { lineHeight: '16px', fontWeight: '400' }],
        micro:   ['11px', { lineHeight: '14px', fontWeight: '500' }],
        cta:     ['16px', { lineHeight: '20px', fontWeight: '600' }],
      },
      borderRadius: {
        card:  '12px',
        input: '8px',
        pill:  '9999px',
        logo:  '10px',
      },
      boxShadow: {
        card:    '0 2px 8px rgba(15,31,46,0.06), 0 1px 2px rgba(15,31,46,0.04)',
        'card-up': '0 -2px 12px rgba(15,31,46,0.06)',
        float:   '0 8px 24px rgba(15,31,46,0.12), 0 2px 6px rgba(15,31,46,0.06)',
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
