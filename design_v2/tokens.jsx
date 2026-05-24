// tokens.jsx — Green Car Airport design tokens + Icon library
// Palette redesigned: Skyline Indigo (replaces #006a36 which clashed with Grab)

const T = {
  // Brand
  primary:       '#1E3A8A',   // royal indigo — CTA, active nav, brand
  primaryDark:   '#162C6B',   // pressed state
  primaryTint:   '#EEF2FD',   // card tints, success-bg replacement
  primaryRing:   'rgba(30,58,138,0.18)',
  gold:          '#C8A24A',   // ví điểm / premium accent
  goldTint:      '#FBF5E4',

  // Neutrals
  navy:          '#0F1F2E',   // ink, H1/H2
  ink:           '#1B2A3A',
  neutral:       '#64748B',   // labels, captions
  neutralDim:    '#94A3B8',
  border:        '#E5E7EB',
  borderSoft:    '#EEF1F4',
  surface:       '#FFFFFF',
  bg:            '#F6F8FB',   // warm-cool white app bg
  bgAlt:         '#F0F3F8',

  // Status
  warning:       '#F59E0B',
  warningTint:   'rgba(245,158,11,0.13)',
  success:       '#10B981',
  successTint:   'rgba(16,185,129,0.13)',
  danger:        '#EF4444',
  dangerTint:    'rgba(239,68,68,0.12)',
  info:          '#0EA5E9',

  // Tokens
  radiusCard:    12,
  radiusInput:   8,
  radiusPill:    9999,
  shadowCard:    '0 2px 8px rgba(15,31,46,0.06), 0 1px 2px rgba(15,31,46,0.04)',
  shadowCardUp:  '0 -2px 12px rgba(15,31,46,0.06)',
  shadowFloat:   '0 8px 24px rgba(15,31,46,0.12), 0 2px 6px rgba(15,31,46,0.06)',
  shadowInset:   'inset 0 0 0 1px rgba(15,31,46,0.05)',
};

const F = {
  family: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  h1:     { fontSize: 24, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.01em', color: T.navy },
  h2:     { fontSize: 18, fontWeight: 600, lineHeight: 1.3,  letterSpacing: '-0.005em', color: T.navy },
  h3:     { fontSize: 15, fontWeight: 600, lineHeight: 1.35, color: T.navy },
  body:   { fontSize: 14, fontWeight: 400, lineHeight: 1.45, color: T.ink },
  bodyB:  { fontSize: 14, fontWeight: 600, lineHeight: 1.45, color: T.navy },
  caption:{ fontSize: 12, fontWeight: 400, lineHeight: 1.4,  color: T.neutral },
  micro:  { fontSize: 11, fontWeight: 500, lineHeight: 1.3,  color: T.neutral, letterSpacing: '0.02em' },
  cta:    { fontSize: 16, fontWeight: 600, lineHeight: 1.2,  color: '#fff' },
  money:  { fontSize: 22, fontWeight: 700, lineHeight: 1.1,  color: T.navy, fontVariantNumeric: 'tabular-nums' },
  moneyXL:{ fontSize: 32, fontWeight: 700, lineHeight: 1.1,  color: T.navy, fontVariantNumeric: 'tabular-nums' },
};

// ─────────────────────────────────────────────────────────────
// Icon — inline SVG library
// ─────────────────────────────────────────────────────────────
function Icon({ name, size = 20, color = 'currentColor', stroke = 2, style }) {
  const s = stroke;
  const paths = {
    car: <><path d="M5 17h14M5 17l-1.5-4.5A2 2 0 0 1 5.4 10h13.2a2 2 0 0 1 1.9 1.4L22 17m-17 0v3m14-3v3M6 10l1.6-4.2A2 2 0 0 1 9.5 4.5h5a2 2 0 0 1 1.9 1.3L18 10"/><circle cx="7.5" cy="14.5" r="1" fill={color} stroke="none"/><circle cx="16.5" cy="14.5" r="1" fill={color} stroke="none"/></>,
    plane: <path d="M3 12l4 1 3 6 2-1-1-5 4-1 3 2 2-1-7-7-1 2 2 3-4 1-5-1-1 2 3 2-4-1 0-2"/>,
    pin: <><path d="M12 22s-7-7.5-7-12a7 7 0 1 1 14 0c0 4.5-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4"/><path d="M12 8v4l3 2"/></>,
    bell: <><path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 19a2 2 0 0 0 4 0"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 8v.01M11 12h1v5h1"/></>,
    back: <path d="M15 6l-6 6 6 6"/>,
    close: <path d="M6 6l12 12M6 18L18 6"/>,
    logout: <><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></>,
    check: <path d="M5 12l5 5L20 7"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    minus: <path d="M5 12h14"/>,
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.8.7a2 2 0 0 1 1.7 2"/>,
    wallet: <><path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3"/><path d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-3"/><path d="M22 11h-5a3 3 0 0 0 0 6h5z"/><circle cx="17" cy="14" r="0.8" fill={color} stroke="none"/></>,
    spark: <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3z"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>,
    swap: <path d="M7 4v16m0 0l-3-3m3 3l3-3M17 20V4m0 0l-3 3m3-3l3 3"/>,
    arrowRight: <path d="M5 12h14m0 0l-6-6m6 6l-6 6"/>,
    arrowDown: <path d="M12 5v14m0 0l-6-6m6 6l6-6"/>,
    star: <path d="M12 3l2.6 5.5 6 .9-4.3 4.3 1 6-5.3-2.9L6.7 19.7l1-6L3.4 9.4l6-.9z"/>,
    dashboard: <><rect x="3" y="3" width="8" height="9" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="14" width="8" height="7" rx="1.5"/></>,
    driver: <><circle cx="12" cy="7" r="3"/><path d="M5 21v-1a7 7 0 0 1 14 0v1"/></>,
    ticket: <><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M9 6v12" strokeDasharray="2 2"/></>,
    chart: <><path d="M3 21h18"/><path d="M6 17V9m5 8V5m5 12v-7m5 7v-11"/></>,
    tag: <><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/></>,
    users: <><circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><path d="M16 4a3.5 3.5 0 0 1 0 7M22 20c0-3-2-5-5-5.5"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    filter: <path d="M3 5h18l-7 9v6l-4-2v-4L3 5z"/>,
    edit: <><path d="M4 20h4l11-11-4-4L4 16v4z"/><path d="M14 5l5 5"/></>,
    qr: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M20 14v3M14 17v4h4M20 20h1"/></>,
    bank: <><path d="M3 10l9-6 9 6"/><path d="M5 10v8m4-8v8m6-8v8m4-8v8"/><path d="M3 20h18"/></>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill={color} stroke="none"/></>,
    online: <circle cx="12" cy="12" r="5" fill={color} stroke="none"/>,
    chevR: <path d="M9 6l6 6-6 6"/>,
    chevD: <path d="M6 9l6 6 6-6"/>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .4 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.4 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .4-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.4-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.4H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.4 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
    block: <><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></>,
    refresh: <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5"/>,
  };
  const p = paths[name];
  if (!p) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={s} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {p}
    </svg>
  );
}

Object.assign(window, { T, F, Icon });
