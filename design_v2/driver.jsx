// driver.jsx — B1 Trip list, B2 Trip detail, B3 Wallet

// ─── B1 · Trip List (HERO) ────────────────────────────────
function DriverTrips() {
  const trips = [
    { id: 42, time: '14:30 · 24/05', new: true, from: 'Quận 7, TP. HCM', to: 'Sân bay Tân Sơn Nhất',
      km: 12, kmToPick: 3.2, price: '380.000', fee: '76.000', seats: 4 },
    { id: 41, time: '16:00 · 24/05', from: '123 Nguyễn Huệ, Q.1', to: 'Sân bay Tân Sơn Nhất',
      km: 8.4, kmToPick: 5.1, price: '288.000', fee: '57.600', seats: 4, accepted: true },
    { id: 40, time: '18:45 · 24/05', from: 'Thủ Đức', to: 'Sân bay Tân Sơn Nhất',
      km: 22, kmToPick: 8.6, price: '520.000', fee: '104.000', seats: 7 },
  ];
  return (
    <ScreenFrame nav={<BottomNav role="driver" active={0} />} bottomPad={90}>
      <AppHeader title="Cuốc xe" right="rules" />
      {/* Online toggle */}
      <div style={{
        margin: '14px 16px 0', padding: '14px 16px',
        background: '#fff', borderRadius: T.radiusCard,
        boxShadow: T.shadowCard, border: `1px solid ${T.borderSoft}`,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: T.successTint,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          <Icon name="online" size={12} color={T.success} />
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 12,
            border: `2px solid ${T.success}`, opacity: 0.2,
            animation: 'pulse 2s infinite',
          }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ ...F.bodyB, color: T.navy }}>Sẵn sàng nhận cuốc</div>
          <div style={{ ...F.caption, marginTop: 1 }}>
            <span style={{ color: T.success, fontWeight: 600 }}>● Online</span>
            {' · '}GPS bật · Q.1, TP. HCM
          </div>
        </div>
        {/* Toggle */}
        <div style={{
          width: 50, height: 30, borderRadius: 99, background: T.success,
          position: 'relative', cursor: 'pointer',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
        }}>
          <div style={{
            position: 'absolute', top: 3, right: 3,
            width: 24, height: 24, borderRadius: '50%', background: '#fff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }} />
        </div>
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 0.2; transform: scale(1); } 50% { opacity: 0; transform: scale(1.4); } }`}</style>

      {/* Today stats */}
      <div style={{ margin: '12px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[
          { val: '3', label: 'Cuốc hôm nay', color: T.primary },
          { val: '912k', label: 'Doanh thu', color: T.success },
          { val: '1.240', label: 'Điểm còn lại', color: T.gold, icon: 'spark' },
        ].map((s, i) => (
          <div key={i} style={{
            background: '#fff', padding: '10px 8px', borderRadius: 10,
            border: `1px solid ${T.borderSoft}`, textAlign: 'center',
          }}>
            <div style={{ ...F.bodyB, fontSize: 16, color: s.color,
              fontVariantNumeric: 'tabular-nums',
              display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              {s.icon && <Icon name={s.icon} size={13} color={s.color} />}
              {s.val}
            </div>
            <div style={{ ...F.caption, marginTop: 1, fontSize: 11 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Sort row */}
      <div style={{ padding: '18px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ ...F.bodyB, color: T.navy }}>3 cuốc gần đây</div>
        <button style={{
          ...F.caption, color: T.primary, fontWeight: 600, background: 'transparent', border: 0,
          display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
        }}>
          <Icon name="filter" size={14} color={T.primary} />
          Gần nhất
          <Icon name="chevD" size={14} color={T.primary} />
        </button>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {trips.map((t) => (
          <TripCard key={t.id} trip={t} />
        ))}
      </div>
    </ScreenFrame>
  );
}

function TripCard({ trip }) {
  return (
    <Card leftAccent>
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="clock" size={14} color={T.neutral} />
            <div style={{ ...F.bodyB, fontSize: 13, color: T.navy }}>{trip.time}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{
              padding: '2px 8px', borderRadius: 99,
              background: T.bgAlt, color: T.neutral,
              fontFamily: F.family, fontSize: 10, fontWeight: 600,
            }}>{trip.seats} chỗ</div>
            {trip.new && <Badge status="new">Mới</Badge>}
            {trip.accepted && <Badge status="accepted">Đã nhận</Badge>}
          </div>
        </div>

        {/* route */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
            <Icon name="pin" size={14} color={T.primary} />
            <div style={{ width: 2, flex: 1, background: T.border, margin: '2px 0' }} />
            <Icon name="plane" size={14} color={T.gold} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ ...F.bodyB, color: T.navy, fontSize: 13 }}>{trip.from}</div>
            <div style={{ ...F.caption, margin: '4px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="swap" size={11} color={T.neutralDim} />
              {trip.km} km · cách bạn {trip.kmToPick} km
            </div>
            <div style={{ ...F.bodyB, color: T.navy, fontSize: 13 }}>{trip.to}</div>
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px', background: T.bg, borderRadius: 10, marginBottom: 10,
        }}>
          <div>
            <div style={{ ...F.caption, fontSize: 11 }}>Khách trả</div>
            <div style={{ ...F.bodyB, fontSize: 15, color: T.navy }}>{trip.price} đ</div>
          </div>
          <Icon name="arrowRight" size={14} color={T.neutralDim} />
          <div>
            <div style={{ ...F.caption, fontSize: 11 }}>Phí app 20%</div>
            <div style={{ ...F.bodyB, fontSize: 13, color: T.danger }}>-{trip.fee}</div>
          </div>
          <div style={{ width: 1, height: 30, background: T.border }} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ ...F.caption, fontSize: 11 }}>Bạn nhận</div>
            <div style={{ ...F.bodyB, fontSize: 15, color: T.success }}>
              {Math.round(parseInt(trip.price.replace(/\./g,'')) * 0.8 / 1000) + '.000'} đ
            </div>
          </div>
        </div>

        {trip.accepted
          ? <Button variant="outline" size="md" full iconRight="arrowRight">Xem chi tiết</Button>
          : <Button variant="primary" size="md" full>Nhận cuốc</Button>}
      </div>
    </Card>
  );
}

// ─── B2 · Trip Detail ─────────────────────────────────────
function DriverTripDetail() {
  return (
    <ScreenFrame bottomPad={0}>
      <AppHeader title="Chi tiết cuốc" mode="detail" right="rules" />

      {/* Map placeholder */}
      <div style={{ position: 'relative', height: 200, margin: 16, borderRadius: T.radiusCard, overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: `
            radial-gradient(circle at 30% 40%, #d4e5f7 0%, transparent 50%),
            radial-gradient(circle at 70% 70%, #ffe9bd 0%, transparent 50%),
            #e8eef5`,
        }} />
        {/* grid */}
        <svg style={{ position: 'absolute', inset: 0, opacity: 0.4 }} width="100%" height="100%">
          <defs>
            <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#94a3b8" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        {/* route line */}
        <svg style={{ position: 'absolute', inset: 0 }} width="100%" height="100%" viewBox="0 0 358 200" preserveAspectRatio="none">
          <path d="M 60 140 Q 130 80, 220 90 T 310 50" stroke={T.primary} strokeWidth="3.5"
            fill="none" strokeDasharray="0" strokeLinecap="round" />
        </svg>
        {/* markers */}
        <div style={{ position: 'absolute', left: 50, top: 125,
          width: 24, height: 24, borderRadius: '50%', background: T.primary, border: '3px solid #fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }} />
        <div style={{ position: 'absolute', right: 35, top: 35,
          width: 28, height: 28, borderRadius: 6, background: T.gold, border: '3px solid #fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plane" size={14} color="#fff" />
        </div>
        {/* Driver pos */}
        <div style={{
          position: 'absolute', left: 130, bottom: 60,
          width: 36, height: 36, borderRadius: '50%', background: T.surface,
          border: `3px solid ${T.primary}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          <Icon name="car" size={18} color={T.primary} />
        </div>
        {/* Phase 2 chip */}
        <div style={{
          position: 'absolute', top: 10, right: 10,
          background: 'rgba(15,31,46,0.7)', backdropFilter: 'blur(8px)',
          color: '#fff', padding: '4px 10px', borderRadius: 99,
          fontFamily: F.family, fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
        }}>PHASE 2 · GOONG MAP</div>
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* trip header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ ...F.caption }}>Mã cuốc</div>
            <div style={{ ...F.h2 }}>#42</div>
          </div>
          <Badge status="accepted">Đã nhận · Đang đến đón</Badge>
        </div>

        {/* Customer card */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: T.goldTint, color: T.gold, fontWeight: 700, fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>K</div>
            <div style={{ flex: 1 }}>
              <div style={{ ...F.bodyB, color: T.navy }}>Khách hàng</div>
              <div style={{ ...F.caption }}>09•• ••• 678</div>
            </div>
            <Button variant="primary" size="md" style={{ width: 44, padding: 0, borderRadius: '50%', height: 44 }}>
              <Icon name="phone" size={18} color="#fff" />
            </Button>
          </div>
        </Card>

        {/* trip details */}
        <Card style={{ marginBottom: 12 }}>
          <div style={{ padding: 14 }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 6 }}>
                <Icon name="pin" size={14} color={T.primary} />
                <div style={{ width: 2, flex: 1, background: T.border, margin: '2px 0' }} />
                <Icon name="plane" size={14} color={T.gold} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...F.caption }}>Điểm đón</div>
                <div style={{ ...F.bodyB }}>Quận 7, TP. HCM</div>
                <div style={{ height: 10 }} />
                <div style={{ ...F.caption }}>Điểm đến</div>
                <div style={{ ...F.bodyB }}>Sân bay Tân Sơn Nhất</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
              padding: '12px 0', borderTop: `1px solid ${T.borderSoft}` }}>
              <div>
                <div style={{ ...F.caption }}>Ngày giờ</div>
                <div style={{ ...F.bodyB }}>14:30 · 24/05</div>
              </div>
              <div>
                <div style={{ ...F.caption }}>Khoảng cách</div>
                <div style={{ ...F.bodyB }}>12 km</div>
              </div>
              <div>
                <div style={{ ...F.caption }}>Khách trả</div>
                <div style={{ ...F.bodyB }}>380.000 đ</div>
              </div>
              <div>
                <div style={{ ...F.caption }}>Phí ứng dụng 20%</div>
                <div style={{ ...F.bodyB, color: T.danger }}>-76.000 đ</div>
              </div>
            </div>
          </div>
        </Card>

        {/* You get */}
        <Card style={{ marginBottom: 12,
          background: `linear-gradient(135deg, ${T.successTint}, rgba(16,185,129,0.05))`,
          borderLeft: `4px solid ${T.success}` }}>
          <div style={{ padding: 14 }}>
            <div style={{ ...F.caption, color: T.success, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.05em' }}>Bạn nhận về</div>
            <div style={{ ...F.moneyXL, color: T.success, marginTop: 4 }}>304.000 đ</div>
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 16 }}>
          <Button variant="primary" size="lg" full iconRight="arrowRight">
            Đang đến đón khách
          </Button>
          <Button variant="ghost" size="md" full>Bỏ qua cuốc này</Button>
        </div>
      </div>
    </ScreenFrame>
  );
}

// ─── B3 · Wallet ──────────────────────────────────────────
function DriverWallet() {
  const txs = [
    { type: 'deduct', label: 'Phí app · Cuốc #41', amount: '-58', date: '24/05 14:20' },
    { type: 'topup',  label: 'Nạp điểm · Vietcombank', amount: '+500', date: '24/05 09:15' },
    { type: 'deduct', label: 'Phí app · Cuốc #38', amount: '-92', date: '23/05 18:42' },
    { type: 'deduct', label: 'Phí app · Cuốc #37', amount: '-72', date: '23/05 11:05' },
    { type: 'topup',  label: 'Nạp điểm · Vietcombank', amount: '+1000', date: '20/05 08:30' },
  ];
  return (
    <ScreenFrame nav={<BottomNav role="driver" active={1} />} bottomPad={90}>
      <AppHeader title="Ví điểm" right="rules" />

      <div style={{ padding: 16 }}>
        {/* Balance card */}
        <div style={{
          padding: 22, borderRadius: 16,
          background: `linear-gradient(135deg, ${T.gold} 0%, #B4882F 100%)`,
          color: '#fff', position: 'relative', overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(200,162,74,0.35)',
        }}>
          {/* deco circle */}
          <div style={{ position: 'absolute', top: -40, right: -40,
            width: 160, height: 160, borderRadius: '50%',
            background: 'rgba(255,255,255,0.12)' }} />
          <div style={{ position: 'absolute', bottom: -30, right: 30,
            width: 80, height: 80, borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)' }} />

          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.9,
              fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              <Icon name="spark" size={14} color="#fff" />
              Số dư điểm
            </div>
            <div style={{ ...F.moneyXL, color: '#fff', fontSize: 40, marginTop: 8, letterSpacing: '-0.01em' }}>
              1.240
            </div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>
              ≈ 1.240.000 đ · 1.000đ = 1 điểm
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <Button variant="neutral" size="md" icon="plus" style={{ background: '#fff', color: T.gold }}>
                Nạp điểm
              </Button>
              <Button variant="ghost" size="md" icon="history"
                style={{ color: '#fff', background: 'rgba(255,255,255,0.15)' }}>
                Lịch sử
              </Button>
            </div>
          </div>
        </div>

        {/* Top up info */}
        <div style={{
          marginTop: 16, padding: 14, borderRadius: T.radiusCard,
          background: T.primaryTint, border: `1px solid rgba(30,58,138,0.15)`,
        }}>
          <div style={{ ...F.bodyB, color: T.primary, marginBottom: 8 }}>
            Hướng dẫn nạp điểm
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { icon: 'bank', text: 'Chuyển khoản đến Green Car Airport Co.' },
              { icon: 'wallet', text: 'STK: 1234 5678 90 · Vietcombank' },
              { icon: 'spark', text: 'Điểm tự động cộng sau khi nhận tiền' },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name={r.icon} size={16} color={T.primary} />
                <div style={{ ...F.body, fontSize: 13, color: T.navy }}>{r.text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Transactions */}
        <div style={{ marginTop: 18, ...F.h3, fontSize: 14,
          textTransform: 'uppercase', letterSpacing: '0.06em', color: T.neutral, fontWeight: 600 }}>
          Lịch sử giao dịch
        </div>
        <Card style={{ marginTop: 8 }}>
          {txs.map((tx, i) => {
            const positive = tx.type === 'topup';
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px',
                borderBottom: i < txs.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: positive ? T.successTint : T.dangerTint,
                  color: positive ? T.success : T.danger,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon name={positive ? 'plus' : 'minus'} size={16} color="currentColor" stroke={2.6} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...F.bodyB, fontSize: 13 }}>{tx.label}</div>
                  <div style={{ ...F.caption, fontSize: 11, marginTop: 1 }}>{tx.date}</div>
                </div>
                <div style={{
                  ...F.bodyB, color: positive ? T.success : T.danger,
                  fontVariantNumeric: 'tabular-nums',
                }}>{tx.amount} đ</div>
              </div>
            );
          })}
        </Card>
      </div>
    </ScreenFrame>
  );
}

Object.assign(window, { DriverTrips, DriverTripDetail, DriverWallet });
