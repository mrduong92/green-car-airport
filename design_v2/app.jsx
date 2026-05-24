// app.jsx — Compose all screens in the design canvas

const MOBILE_W = 390;
const MOBILE_H = 844;

// Wrap a screen in a faux phone shell (rounded edges + status bar).
// We use a simplified frame (not full IOSDevice) to keep things compact and
// match the spec's 390×844 target.
function PhoneShell({ children, dark = false }) {
  return (
    <div style={{
      width: MOBILE_W, height: MOBILE_H,
      borderRadius: 44, overflow: 'hidden', position: 'relative',
      background: dark ? '#000' : '#fff',
      boxShadow: '0 24px 60px rgba(15,31,46,0.12), 0 0 0 10px #0a1422, 0 0 0 11px #1d2937',
      fontFamily: F.family,
    }}>
      {/* Status bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50,
        height: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 28px 0', pointerEvents: 'none',
      }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: dark ? '#fff' : '#0F1F2E' }}>9:41</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: dark ? '#fff' : '#0F1F2E' }}>
          {/* signal */}
          <svg width="17" height="11" viewBox="0 0 17 11"><g fill="currentColor">
            <rect x="0" y="7" width="3" height="4" rx="0.5"/>
            <rect x="4.5" y="5" width="3" height="6" rx="0.5"/>
            <rect x="9" y="2.5" width="3" height="8.5" rx="0.5"/>
            <rect x="13.5" y="0" width="3" height="11" rx="0.5"/>
          </g></svg>
          {/* battery */}
          <svg width="24" height="11" viewBox="0 0 24 11">
            <rect x="0.5" y="0.5" width="21" height="10" rx="2.5" stroke="currentColor" fill="none" opacity="0.4"/>
            <rect x="2" y="2" width="17" height="7" rx="1.5" fill="currentColor"/>
            <rect x="22" y="4" width="1.5" height="3" rx="0.5" fill="currentColor" opacity="0.4"/>
          </svg>
        </div>
      </div>
      {/* Dynamic island */}
      <div style={{
        position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
        width: 116, height: 34, borderRadius: 20, background: '#000', zIndex: 60,
      }} />
      {/* Home indicator */}
      <div style={{
        position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
        width: 134, height: 5, borderRadius: 99, background: 'rgba(0,0,0,0.3)', zIndex: 70,
      }} />
      {/* content */}
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        {children}
      </div>
    </div>
  );
}

const ART_W = MOBILE_W + 24;
const ART_H = MOBILE_H + 24;

// Note: DCSection filters its children by `c.type === DCArtboard`, so the
// <DCArtboard> element MUST be a direct child of <DCSection>. Wrapper
// components (e.g. ArtboardScreen) get silently dropped. We use a helper
// that returns the inner shell only, and inline DCArtboard at the call site.
function PhoneShellSlot({ dark = false, children }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'transparent',
    }}>
      <PhoneShell dark={dark}>{children}</PhoneShell>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main composition
// ─────────────────────────────────────────────────────────────
function App() {
  return (
    <DesignCanvas>
      <DCSection id="brand" title="Hệ màu mới · Skyline Indigo"
        subtitle="Đề xuất thay #006a36 (quá gần Grab). Royal indigo + Premium gold · giữ nguyên Inter, tokens, status semantics.">
        <DCArtboard id="palette" label="Token palette" width={760} height={420}>
          <PaletteSheet />
        </DCArtboard>
      </DCSection>

      <DCSection id="auth" title="Auth · Shared"
        subtitle="S1 Splash, S2 Đăng nhập OTP">
        <DCArtboard id="s1" label="S1 · Splash" width={ART_W} height={ART_H}>
          <PhoneShellSlot dark><SplashScreen /></PhoneShellSlot>
        </DCArtboard>
        <DCArtboard id="s2" label="S2 · Đăng nhập OTP" width={ART_W} height={ART_H}>
          <PhoneShellSlot><LoginScreen /></PhoneShellSlot>
        </DCArtboard>
      </DCSection>

      <DCSection id="customer" title="Role A · Khách hàng"
        subtitle="Tab điều hướng 4 mục: Đặt xe · Lịch sử · Thông báo · Hồ sơ">
        <DCArtboard id="a1" label="A1 · Đặt xe ★ HERO" width={ART_W} height={ART_H}>
          <PhoneShellSlot><CustomerBooking /></PhoneShellSlot>
        </DCArtboard>
        <DCArtboard id="a2" label="A2 · Trạng thái đơn" width={ART_W} height={ART_H}>
          <PhoneShellSlot><CustomerStatus /></PhoneShellSlot>
        </DCArtboard>
        <DCArtboard id="a3" label="A3 · Lịch sử" width={ART_W} height={ART_H}>
          <PhoneShellSlot><CustomerHistory /></PhoneShellSlot>
        </DCArtboard>
        <DCArtboard id="a5" label="A5 · Hồ sơ" width={ART_W} height={ART_H}>
          <PhoneShellSlot><CustomerProfile /></PhoneShellSlot>
        </DCArtboard>
      </DCSection>

      <DCSection id="driver" title="Role B · Tài xế"
        subtitle="Tab 4 mục: Cuốc xe · Ví điểm · Thông báo · Hồ sơ">
        <DCArtboard id="b1" label="B1 · Cuốc xe ★ HERO" width={ART_W} height={ART_H}>
          <PhoneShellSlot><DriverTrips /></PhoneShellSlot>
        </DCArtboard>
        <DCArtboard id="b2" label="B2 · Chi tiết cuốc" width={ART_W} height={ART_H}>
          <PhoneShellSlot><DriverTripDetail /></PhoneShellSlot>
        </DCArtboard>
        <DCArtboard id="b3" label="B3 · Ví điểm (gold)" width={ART_W} height={ART_H}>
          <PhoneShellSlot><DriverWallet /></PhoneShellSlot>
        </DCArtboard>
      </DCSection>

      <DCSection id="admin" title="Role C · Admin (PC)"
        subtitle="Sidebar điều hướng 6 mục · KPI 4 ô · biểu đồ doanh thu · bảng chuyến gần đây">
        <DCArtboard id="c1" label="C1 · Admin Dashboard (PC)" width={1304} height={824}>
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ChromeWindow
              width={1280} height={800}
              url="admin.greencar.vn/dashboard"
              tabs={[{ title: 'Green Car · Admin' }]}
              activeIndex={0}
            >
              <AdminDashboardPC />
            </ChromeWindow>
          </div>
        </DCArtboard>
      </DCSection>

      <DCPostIt x={40} y={80}>
        Spec gốc dùng <b>#006a36</b> (green).
        Đã thay bằng <b>#1E3A8A</b> (royal indigo) +
        <b> #C8A24A</b> (gold) — gợi tính hàng không / cao cấp,
        khác biệt rõ với Grab.
      </DCPostIt>

      <DCPostIt x={40} y={260}>
        Mỗi artboard là <b>iPhone 14 Pro</b> 390×844.
        Có thể kéo thả sắp xếp lại, double-click tiêu đề để đổi tên,
        click ⤢ để xem fullscreen.
      </DCPostIt>
    </DesignCanvas>
  );
}

// ─── Palette / token sheet ───────────────────────────────
function PaletteSheet() {
  const Swatch = ({ name, hex, fg = '#fff', big }) => (
    <div style={{
      flex: big ? '1.6 1 0' : '1 1 0',
      background: hex, color: fg,
      borderRadius: 12, padding: 14,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      minHeight: big ? 130 : 100, minWidth: 0,
      boxShadow: T.shadowCard,
    }}>
      <div style={{ fontFamily: F.family, fontWeight: 700, fontSize: 14 }}>{name}</div>
      <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, opacity: 0.9,
        textTransform: 'uppercase' }}>{hex}</div>
    </div>
  );
  return (
    <div style={{ padding: 24, fontFamily: F.family, background: '#fff', height: '100%', overflow: 'auto' }}>
      <div style={{ ...F.h1, marginBottom: 4 }}>Skyline Indigo</div>
      <div style={{ ...F.body, color: T.neutral, marginBottom: 18 }}>
        Bộ màu mới đề xuất cho Green Car Airport — thay cho #006a36 (vốn quá gần với Grab).
        Cảm giác premium hàng không, vẫn dễ đọc trên cả nền sáng/tối.
      </div>

      {/* Brand row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <Swatch name="Primary · Royal Indigo" hex="#1E3A8A" big />
        <Swatch name="Gold · Premium Accent" hex="#C8A24A" big />
        <Swatch name="Navy · Ink" hex="#0F1F2E" big />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <Swatch name="Primary Tint" hex="#EEF2FD" fg={T.primary} />
        <Swatch name="Gold Tint" hex="#FBF5E4" fg={T.gold} />
        <Swatch name="Warm BG" hex="#F6F8FB" fg={T.navy} />
        <Swatch name="Border" hex="#E5E7EB" fg={T.navy} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <Swatch name="Success" hex="#10B981" />
        <Swatch name="Warning" hex="#F59E0B" />
        <Swatch name="Danger" hex="#EF4444" />
        <Swatch name="Info" hex="#0EA5E9" />
        <Swatch name="Neutral" hex="#64748B" />
      </div>

      {/* Typography sample */}
      <div style={{
        background: T.bg, borderRadius: 12, padding: 18, border: `1px solid ${T.borderSoft}`,
      }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <div>
            <div style={{ ...F.h1 }}>Đặt xe sân bay</div>
            <div style={{ ...F.caption, marginTop: 2 }}>H1 · 24/700 · Navy</div>
          </div>
          <div>
            <div style={{ ...F.h2 }}>Trạng thái đơn</div>
            <div style={{ ...F.caption, marginTop: 2 }}>H2 · 18/600 · Navy</div>
          </div>
          <div>
            <div style={{ ...F.body }}>Thanh toán khi hoàn thành</div>
            <div style={{ ...F.caption, marginTop: 2 }}>Body · 14/400</div>
          </div>
          <div>
            <div style={{ ...F.caption }}>Khoảng cách 12 km</div>
            <div style={{ ...F.caption, marginTop: 2 }}>Caption · 12/400 · Neutral</div>
          </div>
          <div>
            <div style={{ ...F.money }}>288.000 đ</div>
            <div style={{ ...F.caption, marginTop: 2 }}>Money · 22/700 · tabular</div>
          </div>
        </div>
      </div>

      {/* Badges + buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <Badge status="pending">Tìm tài xế</Badge>
        <Badge status="accepted">Đã nhận</Badge>
        <Badge status="progress">Đang chạy</Badge>
        <Badge status="completed">Hoàn thành</Badge>
        <Badge status="cancelled">Đã huỷ</Badge>
        <Badge status="new">Mới</Badge>
        <Badge status="blocked">Bị khoá</Badge>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="primary" size="md" iconRight="arrowRight">Đặt xe</Button>
        <Button variant="outline" size="md">Huỷ chuyến</Button>
        <Button variant="primaryGold" size="md" icon="spark">Nạp điểm</Button>
        <Button variant="ghost" size="md" icon="phone">Gọi tài xế</Button>
        <Button variant="dangerOutline" size="sm" icon="block">Khoá tài khoản</Button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
