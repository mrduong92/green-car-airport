// ui.jsx — Green Car Airport — shared UI primitives
// AppHeader, BottomNav, Button, Badge, Card, Input, etc.

// ─── AppHeader ────────────────────────────────────────────
function AppHeader({ mode = 'root', title = 'Green Car', right = 'rules', role = 'customer', onBack }) {
  const leftIcon = mode === 'root'
    ? <div style={{ width: 36, height: 36, borderRadius: 10, background: T.primaryTint,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="car" size={20} color={T.primary} stroke={2.2} />
      </div>
    : <button onClick={onBack} style={{ width: 36, height: 36, border: 0, background: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T.navy }}>
        <Icon name="back" size={22} stroke={2.2} />
      </button>;

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 30, background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      borderBottom: `1px solid ${T.borderSoft}`,
      paddingTop: 50, // safe-top (status bar)
    }}>
      <div style={{
        height: 52, padding: '0 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        {leftIcon}
        <div style={{ ...F.h3, flex: 1, textAlign: 'center', fontWeight: 600,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </div>
        {right === 'rules' && (
          <button style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px',
            border: 0, background: 'transparent', color: T.primary, cursor: 'pointer',
            ...F.caption, fontWeight: 600, color: T.primary,
          }}>
            <Icon name="info" size={16} color={T.primary} />
            Quy định
          </button>
        )}
        {right === 'logout' && (
          <button style={{ width: 36, height: 36, border: 0, background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T.neutral }}>
            <Icon name="logout" size={20} />
          </button>
        )}
        {right === null && <div style={{ width: 36 }} />}
      </div>
    </div>
  );
}

// ─── BottomNav ────────────────────────────────────────────
function BottomNav({ role = 'customer', active = 0 }) {
  const tabs = {
    customer: [
      { icon: 'car', label: 'Đặt xe' },
      { icon: 'history', label: 'Lịch sử' },
      { icon: 'bell', label: 'Thông báo' },
      { icon: 'user', label: 'Hồ sơ' },
    ],
    driver: [
      { icon: 'ticket', label: 'Cuốc xe' },
      { icon: 'wallet', label: 'Ví điểm' },
      { icon: 'bell', label: 'Thông báo' },
      { icon: 'user', label: 'Hồ sơ' },
    ],
    admin: [
      { icon: 'dashboard', label: 'Dashboard' },
      { icon: 'driver', label: 'Tài xế' },
      { icon: 'ticket', label: 'Voucher' },
      { icon: 'chart', label: 'Doanh thu' },
      { icon: 'tag', label: 'Bảng giá' },
      { icon: 'users', label: 'Khách' },
    ],
  }[role];
  const small = role === 'admin';
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30,
      background: 'rgba(255,255,255,0.96)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      borderTop: `1px solid ${T.borderSoft}`,
      boxShadow: T.shadowCardUp,
      paddingBottom: 22, // home indicator
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '8px 4px 4px' }}>
        {tabs.map((t, i) => {
          const isActive = i === active;
          return (
            <div key={i} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 2, padding: '6px 2px', cursor: 'pointer',
              color: isActive ? T.primary : T.neutralDim,
            }}>
              <Icon name={t.icon} size={small ? 20 : 22} stroke={isActive ? 2.4 : 1.8} />
              <div style={{
                fontFamily: F.family, fontSize: small ? 10 : 11,
                fontWeight: isActive ? 600 : 500, letterSpacing: 0.1,
              }}>{t.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Button ──────────────────────────────────────────────
function Button({ children, variant = 'primary', size = 'md', icon, iconRight, full, style, onClick }) {
  const sizes = {
    sm: { padding: '6px 14px', fontSize: 13, height: 32, iconSz: 14 },
    md: { padding: '10px 18px', fontSize: 14, height: 44, iconSz: 16 },
    lg: { padding: '14px 22px', fontSize: 16, height: 52, iconSz: 18 },
  }[size];
  const variants = {
    primary: { background: T.primary, color: '#fff', border: '0' },
    primaryGold: { background: T.gold, color: '#fff', border: '0' },
    outline: { background: 'transparent', color: T.primary, border: `1.5px solid ${T.primary}` },
    ghost: { background: 'transparent', color: T.primary, border: '0' },
    danger: { background: T.danger, color: '#fff', border: '0' },
    dangerOutline: { background: 'transparent', color: T.danger, border: `1.5px solid ${T.danger}` },
    soft: { background: T.primaryTint, color: T.primary, border: '0' },
    neutral: { background: '#fff', color: T.navy, border: `1px solid ${T.border}` },
  }[variant];
  return (
    <button onClick={onClick} style={{
      ...variants, ...sizes,
      height: sizes.height, padding: sizes.padding,
      borderRadius: T.radiusPill,
      fontFamily: F.family, fontSize: sizes.fontSize, fontWeight: 600,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      cursor: 'pointer', width: full ? '100%' : 'auto',
      letterSpacing: '0.01em', whiteSpace: 'nowrap',
      ...style,
    }}>
      {icon && <Icon name={icon} size={sizes.iconSz} color="currentColor" stroke={2.2} />}
      {children}
      {iconRight && <Icon name={iconRight} size={sizes.iconSz} color="currentColor" stroke={2.2} />}
    </button>
  );
}

// ─── Badge / Status pill ─────────────────────────────────
function Badge({ children, status = 'pending', icon, soft = true }) {
  const map = {
    pending:      { bg: T.warningTint, fg: T.warning,  solid: T.warning },
    finding:      { bg: T.warningTint, fg: T.warning,  solid: T.warning },
    accepted:     { bg: T.primaryTint, fg: T.primary,  solid: T.primary },
    picking:      { bg: T.primaryTint, fg: T.primary,  solid: T.primary },
    progress:     { bg: T.primaryTint, fg: T.primary,  solid: T.primary },
    completed:    { bg: T.successTint, fg: T.success,  solid: T.success },
    cancelled:    { bg: T.danger,      fg: '#fff',     solid: T.danger },
    blocked:      { bg: T.danger,      fg: '#fff',     solid: T.danger },
    active:       { bg: T.primaryTint, fg: T.primary,  solid: T.primary },
    waiting:      { bg: T.warningTint, fg: T.warning,  solid: T.warning },
    new:          { bg: T.gold,        fg: '#fff',     solid: T.gold },
  };
  const c = map[status] || map.pending;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', borderRadius: T.radiusPill,
      background: soft ? c.bg : c.solid, color: soft ? c.fg : '#fff',
      fontFamily: F.family, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
      textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>
      {icon && <Icon name={icon} size={11} color="currentColor" />}
      {children}
    </span>
  );
}

// ─── Card ────────────────────────────────────────────────
function Card({ children, style, leftAccent }) {
  return (
    <div style={{
      background: T.surface, borderRadius: T.radiusCard,
      boxShadow: T.shadowCard,
      border: `1px solid ${T.borderSoft}`,
      borderLeft: leftAccent ? `4px solid ${T.primary}` : undefined,
      overflow: 'hidden',
      ...style,
    }}>{children}</div>
  );
}

// ─── Input ───────────────────────────────────────────────
function Input({ icon, placeholder, value, suffix, error, dense, onChange }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: dense ? '8px 12px' : '12px 14px',
      background: '#fff', border: `1px solid ${error ? T.danger : T.border}`,
      borderRadius: T.radiusInput,
    }}>
      {icon && <Icon name={icon} size={18} color={T.neutral} />}
      <div style={{
        flex: 1, ...F.body, color: value ? T.navy : T.neutralDim,
        fontWeight: value ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{value || placeholder}</div>
      {suffix}
    </div>
  );
}

// ─── Chip (for date/time/seat selection) ──────────────────
function Chip({ children, active, onClick, size = 'md' }) {
  const sizes = {
    sm: { padding: '5px 10px', fontSize: 12, height: 28 },
    md: { padding: '8px 14px', fontSize: 13, height: 36 },
  }[size];
  return (
    <button onClick={onClick} style={{
      ...sizes, height: sizes.height,
      border: `1.5px solid ${active ? T.primary : T.border}`,
      background: active ? T.primary : '#fff',
      color: active ? '#fff' : T.navy,
      borderRadius: T.radiusPill,
      fontFamily: F.family, fontWeight: active ? 600 : 500,
      cursor: 'pointer', whiteSpace: 'nowrap',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>{children}</button>
  );
}

// ─── Stepper item (vertical) ──────────────────────────────
function StepItem({ state, label, sub, isLast }) {
  const colors = {
    done: { ring: T.primary, fg: T.primary, bg: T.primary, ic: '#fff' },
    current: { ring: T.primary, fg: T.navy, bg: T.primary, ic: '#fff' },
    pending: { ring: T.border, fg: T.neutralDim, bg: '#fff', ic: T.neutralDim },
  }[state];
  return (
    <div style={{ display: 'flex', gap: 12, position: 'relative', minHeight: 48 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: colors.bg,
          border: state === 'pending' ? `2px solid ${colors.ring}` : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: state === 'current' ? `0 0 0 6px ${T.primaryRing}` : 'none',
          flexShrink: 0,
        }}>
          {state === 'done' && <Icon name="check" size={14} color="#fff" stroke={3} />}
          {state === 'current' && (
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
          )}
        </div>
        {!isLast && <div style={{
          width: 2, flex: 1, marginTop: 2,
          background: state === 'done' ? T.primary : T.border,
        }} />}
      </div>
      <div style={{ paddingBottom: 18, flex: 1 }}>
        <div style={{
          ...F.bodyB, color: state === 'pending' ? T.neutralDim : T.navy,
          fontWeight: state === 'current' ? 700 : 600,
        }}>{label}</div>
        {sub && <div style={{ ...F.caption, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── ScreenFrame (wraps content with bg + scroll) ─────────
function ScreenFrame({ children, bg = T.bg, footer, nav, bottomPad = 0 }) {
  return (
    <div style={{
      width: '100%', height: '100%', background: bg, position: 'relative',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: F.family, color: T.ink,
    }}>
      <div style={{
        flex: 1, overflow: 'auto',
        paddingBottom: bottomPad,
      }}>
        {children}
      </div>
      {footer}
      {nav}
    </div>
  );
}

// ─── Empty / Image placeholder ───────────────────────────
function ImageStub({ label = 'photo', height = 120, style }) {
  return (
    <div style={{
      height, borderRadius: T.radiusCard,
      background: `repeating-linear-gradient(135deg, ${T.bgAlt} 0 8px, ${T.borderSoft} 8px 16px)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: T.neutralDim, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase',
      ...style,
    }}>{label}</div>
  );
}

Object.assign(window, {
  AppHeader, BottomNav, Button, Badge, Card, Input, Chip, StepItem, ScreenFrame, ImageStub,
});
