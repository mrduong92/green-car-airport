// customer.jsx — Splash, Login, A1 Booking, A2 Status, A3 History, A5 Profile

// ─── S1 · Splash ──────────────────────────────────────────
function SplashScreen() {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 28,
      background: `linear-gradient(160deg, ${T.primary} 0%, ${T.primaryDark} 100%)`,
      fontFamily: F.family, color: '#fff', padding: '0 32px',
    }}>
      {/* Logo mark */}
      <div style={{ position: 'relative' }}>
        <div style={{
          width: 110, height: 110, borderRadius: 28,
          background: 'rgba(255,255,255,0.12)',
          backdropFilter: 'blur(20px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 12px 40px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
        }}>
          <Icon name="car" size={56} color="#fff" stroke={2} />
        </div>
        <div style={{
          position: 'absolute', top: -8, right: -8,
          width: 32, height: 32, borderRadius: '50%', background: T.gold,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(200,162,74,0.5)',
        }}>
          <Icon name="plane" size={18} color="#fff" stroke={2.4} />
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          Green Car
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, opacity: 0.75, marginTop: 6, letterSpacing: '0.05em' }}>
          AIRPORT TRANSFER · VIETNAM
        </div>
      </div>
      <div style={{
        position: 'absolute', bottom: 56, left: 32, right: 32,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.2)',
          borderTopColor: '#fff',
          animation: 'spin 1s linear infinite',
        }} />
        <div style={{ fontSize: 12, opacity: 0.7, letterSpacing: '0.05em' }}>
          Đang chuẩn bị chuyến đi của bạn...
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── S2 · Login OTP ──────────────────────────────────────
function LoginScreen() {
  return (
    <ScreenFrame bg="#fff">
      <div style={{ paddingTop: 60, padding: '60px 24px 24px' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18, background: T.primaryTint,
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28,
        }}>
          <Icon name="car" size={32} color={T.primary} stroke={2.2} />
        </div>
        <div style={{ ...F.h1, fontSize: 28, marginBottom: 8 }}>Chào mừng trở lại</div>
        <div style={{ ...F.body, color: T.neutral, marginBottom: 36 }}>
          Đăng nhập bằng số điện thoại để bắt đầu đặt xe sân bay
        </div>

        <div style={{ ...F.caption, color: T.neutral, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Số điện thoại
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
          border: `1.5px solid ${T.primary}`, borderRadius: T.radiusInput,
          boxShadow: `0 0 0 4px ${T.primaryRing}`,
          height: 52, marginBottom: 18,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, paddingRight: 10,
            borderRight: `1px solid ${T.border}`, color: T.navy, fontWeight: 600,
          }}>
            🇻🇳 +84
          </div>
          <div style={{ ...F.body, color: T.navy, fontWeight: 600, fontSize: 17, letterSpacing: '0.05em' }}>
            912 345 678
            <span style={{ display: 'inline-block', width: 2, height: 18, background: T.primary,
              marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }} />
          </div>
        </div>

        <Button variant="primary" size="lg" full iconRight="arrowRight">
          Gửi mã OTP
        </Button>

        <div style={{
          marginTop: 22, padding: 14, borderRadius: T.radiusCard,
          background: T.primaryTint, display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <Icon name="info" size={18} color={T.primary} />
          <div style={{ ...F.caption, color: T.primary, lineHeight: 1.4 }}>
            Lần đầu sử dụng? Tài khoản sẽ được tạo tự động sau khi xác thực OTP.
          </div>
        </div>
      </div>
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </ScreenFrame>
  );
}

// ─── A1 · Booking (HERO) ─────────────────────────────────
function CustomerBooking() {
  const dates = ['Hôm nay', 'T2 26/5', 'T3 27/5', 'T4 28/5', 'T5 29/5', 'T6 30/5'];
  const times = ['06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00'];
  return (
    <ScreenFrame nav={<BottomNav role="customer" active={0} />} bottomPad={140}>
      <AppHeader title="Đặt xe" />

      <div style={{ padding: '16px 16px 0' }}>
        {/* Trip endpoints */}
        <Card>
          <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', background: T.primaryTint,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Icon name="pin" size={16} color={T.primary} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ ...F.caption, marginBottom: 1 }}>Điểm đón</div>
              <div style={{ ...F.bodyB, color: T.navy }}>
                123 Nguyễn Huệ, Quận 1, TP. HCM
              </div>
            </div>
            <Icon name="swap" size={18} color={T.neutralDim} />
          </div>
          <div style={{ height: 1, background: T.borderSoft, marginLeft: 56 }} />
          <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', background: T.goldTint,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Icon name="plane" size={16} color={T.gold} stroke={2.4} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ ...F.caption, marginBottom: 1 }}>Điểm đến</div>
              <div style={{ ...F.bodyB, color: T.navy }}>
                Sân bay Tân Sơn Nhất · Ga Quốc tế
              </div>
            </div>
          </div>
        </Card>

        {/* Vehicle type */}
        <SectionLabel>Loại xe</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { seats: 4, name: 'Sedan', icon: 'car', active: true },
            { seats: 5, name: 'SUV',   icon: 'car' },
            { seats: 7, name: 'Van',   icon: 'car' },
          ].map((v, i) => (
            <div key={i} style={{
              padding: '12px 8px', borderRadius: T.radiusCard,
              background: v.active ? T.primaryTint : '#fff',
              border: `1.5px solid ${v.active ? T.primary : T.border}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              boxShadow: v.active ? `0 0 0 3px ${T.primaryRing}` : 'none',
            }}>
              <Icon name={v.icon} size={26} color={v.active ? T.primary : T.neutral} stroke={1.8} />
              <div style={{ ...F.bodyB, color: v.active ? T.primary : T.navy, fontSize: 13 }}>
                {v.seats} chỗ
              </div>
              <div style={{ ...F.caption, fontSize: 11 }}>{v.name}</div>
            </div>
          ))}
        </div>

        {/* Date scroller */}
        <SectionLabel>Ngày khởi hành</SectionLabel>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
          {dates.map((d, i) => (
            <Chip key={i} active={i === 0}>{d}</Chip>
          ))}
        </div>

        {/* Time grid */}
        <SectionLabel>Giờ đón</SectionLabel>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '0 -16px', padding: '0 16px 4px' }}>
          {times.map((t, i) => (
            <Chip key={i} size="sm" active={i === 4}>{t}</Chip>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '8px -16px 0', padding: '0 16px' }}>
          {['14:00', '14:30', '15:00', '15:30', '16:00', '16:30'].map((t, i) => (
            <Chip key={i} size="sm">{t}</Chip>
          ))}
        </div>

        {/* Distance + price ref */}
        <SectionLabel>Bảng giá tham khảo</SectionLabel>
        <Card>
          <div style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <div style={{ ...F.caption }}>Khoảng cách</div>
              <div style={{ ...F.bodyB, color: T.navy, fontSize: 16 }}>8.4 km</div>
            </div>
            <div style={{ width: 1, height: 32, background: T.borderSoft }} />
            <div style={{ flex: 1 }}>
              <div style={{ ...F.caption }}>Mức giá tham khảo</div>
              <div style={{ ...F.bodyB, color: T.navy, fontSize: 16 }}>
                280.000 – 350.000 đ
              </div>
            </div>
          </div>
        </Card>

        {/* Custom price */}
        <SectionLabel>Giá bạn muốn trả</SectionLabel>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
          border: `1.5px solid ${T.primary}`, borderRadius: T.radiusInput,
          background: '#fff', height: 56,
        }}>
          <div style={{ ...F.money, color: T.primary, flex: 1 }}>320.000</div>
          <div style={{ ...F.bodyB, color: T.neutral, fontWeight: 500 }}>đ</div>
        </div>

        {/* Voucher */}
        <SectionLabel>Voucher</SectionLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Input icon="ticket" placeholder="Nhập mã voucher..." value="SUMMER10" />
          </div>
          <Button variant="soft" size="md">Áp dụng</Button>
        </div>

        <div style={{ height: 16 }} />
      </div>

      {/* Sticky footer */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 76,
        background: '#fff', borderTop: `1px solid ${T.borderSoft}`,
        padding: '14px 16px', boxShadow: T.shadowCardUp,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...F.caption }}>Tổng thanh toán</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={F.money}>288.000 đ</div>
            <div style={{ ...F.caption, color: T.success, fontWeight: 600 }}>-32.000đ</div>
          </div>
        </div>
        <Button variant="primary" size="lg" iconRight="arrowRight">
          Đặt xe
        </Button>
      </div>
    </ScreenFrame>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ ...F.caption, fontWeight: 600, color: T.neutral,
      textTransform: 'uppercase', letterSpacing: '0.06em',
      margin: '20px 0 10px', fontSize: 11 }}>{children}</div>
  );
}

// ─── A2 · Order Status ────────────────────────────────────
function CustomerStatus() {
  return (
    <ScreenFrame nav={<BottomNav role="customer" active={1} />} bottomPad={90}>
      <AppHeader title="Trạng thái đơn" mode="detail" right="rules" />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ ...F.caption }}>Mã đơn</div>
            <div style={{ ...F.h2 }}>#GC-2826</div>
          </div>
          <Badge status="accepted">Tài xế đã nhận</Badge>
        </div>

        {/* Stepper */}
        <Card style={{ marginBottom: 14 }}>
          <div style={{ padding: '18px 18px 6px' }}>
            <StepItem state="done" label="Đã đặt xe" sub="14:32 · 24/05" />
            <StepItem state="done" label="Đang tìm tài xế" sub="3 phút" />
            <StepItem state="current" label="Tài xế đã nhận" sub="Anh Hùng đang đến đón..." />
            <StepItem state="pending" label="Đang trên đường" />
            <StepItem state="pending" label="Hoàn thành" isLast />
          </div>
        </Card>

        {/* Driver card */}
        <Card style={{ marginBottom: 14 }} leftAccent>
          <div style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: `linear-gradient(135deg, ${T.primary}, ${T.primaryDark})`,
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: F.family, fontWeight: 700, fontSize: 20, flexShrink: 0,
            }}>NH</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ ...F.bodyB, color: T.navy }}>Nguyễn Văn Hùng</div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: T.gold,
                  fontFamily: F.family, fontWeight: 700, fontSize: 13 }}>
                  <Icon name="star" size={12} color={T.gold} /> 4.8
                </span>
              </div>
              <div style={{ ...F.caption, marginTop: 2 }}>Toyota Vios · Trắng</div>
              <div style={{ display: 'inline-block', marginTop: 4, padding: '2px 8px',
                background: T.navy, color: '#fff', borderRadius: 4,
                fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.08em' }}>
                51G-128.45
              </div>
            </div>
            <Button variant="primary" size="md" style={{ width: 44, padding: 0, borderRadius: '50%', height: 44 }}>
              <Icon name="phone" size={18} color="#fff" />
            </Button>
          </div>
        </Card>

        {/* Trip summary */}
        <Card style={{ marginBottom: 14 }}>
          <div style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: T.primary }} />
                <div style={{ width: 2, flex: 1, background: T.border, margin: '2px 0' }} />
                <div style={{ width: 10, height: 10, borderRadius: 2, background: T.gold }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...F.caption }}>Điểm đón</div>
                <div style={{ ...F.bodyB }}>123 Nguyễn Huệ, Q.1</div>
                <div style={{ height: 14 }} />
                <div style={{ ...F.caption }}>Điểm đến</div>
                <div style={{ ...F.bodyB }}>Sân bay Tân Sơn Nhất · T2</div>
              </div>
            </div>
            <div style={{ height: 1, background: T.borderSoft, margin: '14px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ ...F.caption }}>Khởi hành</div>
                <div style={{ ...F.bodyB }}>16:00 · 24/05</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...F.caption }}>Giá</div>
                <div style={{ ...F.bodyB, color: T.primary, fontSize: 16 }}>288.000 đ</div>
              </div>
            </div>
          </div>
        </Card>

        <Button variant="dangerOutline" size="md" full>
          <Icon name="close" size={16} color={T.danger} />
          Huỷ chuyến (còn 47 phút miễn phí)
        </Button>
      </div>
    </ScreenFrame>
  );
}

// ─── A3 · History ─────────────────────────────────────────
function CustomerHistory() {
  const trips = [
    { id: 'GC-2826', from: '123 Nguyễn Huệ, Q.1', to: 'Sân bay Tân Sơn Nhất', date: '24/05 · 16:00', price: '288.000', status: 'accepted', label: 'Đang thực hiện' },
    { id: 'GC-2701', from: 'Sân bay Nội Bài', to: '88 Lý Thường Kiệt, Hà Nội', date: '18/05 · 09:30', price: '420.000', status: 'completed', label: 'Hoàn thành' },
    { id: 'GC-2654', from: '256 Lê Lợi, Q.1', to: 'Sân bay Tân Sơn Nhất', date: '12/05 · 06:15', price: '265.000', status: 'completed', label: 'Hoàn thành' },
    { id: 'GC-2522', from: 'Sân bay Đà Nẵng', to: '15 Bạch Đằng, Đà Nẵng', date: '03/05 · 19:45', price: '180.000', status: 'cancelled', label: 'Đã huỷ' },
  ];
  return (
    <ScreenFrame nav={<BottomNav role="customer" active={1} />} bottomPad={90}>
      <AppHeader title="Lịch sử chuyến" right="rules" />
      <div style={{ padding: '16px 16px 12px', display: 'flex', gap: 8 }}>
        <Chip active size="sm">Tất cả · 12</Chip>
        <Chip size="sm">Hoàn thành · 9</Chip>
        <Chip size="sm">Đã huỷ · 2</Chip>
      </div>
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {trips.map((t, i) => (
          <Card key={i}>
            <div style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ ...F.caption, fontWeight: 600, color: T.neutral, letterSpacing: '0.05em' }}>
                  #{t.id} · {t.date}
                </div>
                <Badge status={t.status}>{t.label}</Badge>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <Icon name="pin" size={14} color={T.primary} />
                <div style={{ ...F.body, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.from}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Icon name="plane" size={14} color={T.gold} />
                <div style={{ ...F.body, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.to}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                paddingTop: 10, borderTop: `1px dashed ${T.borderSoft}` }}>
                <div style={{ ...F.caption }}>Tổng tiền</div>
                <div style={{ ...F.bodyB, color: T.navy, fontSize: 15 }}>{t.price} đ</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </ScreenFrame>
  );
}

// ─── A5 · Profile ─────────────────────────────────────────
function CustomerProfile() {
  return (
    <ScreenFrame nav={<BottomNav role="customer" active={3} />} bottomPad={90}>
      <AppHeader title="Hồ sơ" right="rules" />
      <div style={{ padding: '16px' }}>
        {/* Profile card */}
        <Card style={{ marginBottom: 14 }}>
          <div style={{
            padding: '24px 18px 20px',
            background: `linear-gradient(135deg, ${T.primary} 0%, ${T.primaryDark} 100%)`,
            color: '#fff', display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 24, color: '#fff',
              border: '2px solid rgba(255,255,255,0.3)',
            }}>TM</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: F.family, fontWeight: 700, fontSize: 18 }}>
                Trần Minh Anh
              </div>
              <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>+84 912 345 678</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6,
                background: 'rgba(255,255,255,0.18)', padding: '2px 8px', borderRadius: 99,
                fontSize: 11, fontWeight: 600 }}>
                <Icon name="star" size={11} color="#fff" /> Khách hàng VIP · 12 chuyến
              </div>
            </div>
          </div>
        </Card>

        {/* Quick stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
          {[
            { val: '12', label: 'Chuyến' },
            { val: '9', label: 'Hoàn thành' },
            { val: '3.2M', label: 'Tổng chi' },
          ].map((s, i) => (
            <div key={i} style={{
              background: '#fff', padding: 12, borderRadius: T.radiusCard,
              border: `1px solid ${T.borderSoft}`, textAlign: 'center',
            }}>
              <div style={{ ...F.bodyB, fontSize: 18, color: T.navy }}>{s.val}</div>
              <div style={{ ...F.caption, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Settings list */}
        <Card>
          {[
            { icon: 'user', label: 'Thông tin cá nhân' },
            { icon: 'phone', label: 'Số điện thoại', value: '+84 912 345 678' },
            { icon: 'ticket', label: 'Voucher của tôi', value: '3 mã' },
            { icon: 'bell', label: 'Thông báo' },
            { icon: 'info', label: 'Trợ giúp & Liên hệ' },
          ].map((r, i, arr) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
              borderBottom: i < arr.length - 1 ? `1px solid ${T.borderSoft}` : 'none',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: T.primaryTint,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name={r.icon} size={16} color={T.primary} />
              </div>
              <div style={{ ...F.body, flex: 1, color: T.navy, fontWeight: 500 }}>{r.label}</div>
              {r.value && <div style={{ ...F.caption, color: T.neutral }}>{r.value}</div>}
              <Icon name="chevR" size={16} color={T.neutralDim} />
            </div>
          ))}
        </Card>

        <Button variant="dangerOutline" size="md" full style={{ marginTop: 18 }}>
          <Icon name="logout" size={16} color={T.danger} />
          Đăng xuất
        </Button>
      </div>
    </ScreenFrame>
  );
}

Object.assign(window, {
  SplashScreen, LoginScreen, CustomerBooking, CustomerStatus, CustomerHistory, CustomerProfile,
});
