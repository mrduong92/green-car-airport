// admin.jsx — C1 Admin Dashboard (PC), Admin mobile dashboard

// ─── C1 PC · Dashboard with sidebar ───────────────────────
function AdminDashboardPC() {
  return (
    <div style={{
      display: 'flex', height: '100%', background: T.bg,
      fontFamily: F.family, color: T.ink,
    }}>
      {/* Sidebar */}
      <div style={{
        width: 240, flexShrink: 0, background: T.navy, color: '#fff',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: T.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="car" size={18} color="#fff" stroke={2.4} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Green Car</div>
              <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: '0.04em' }}>ADMIN PORTAL</div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, padding: '14px 12px' }}>
          {[
            { icon: 'dashboard', label: 'Dashboard', active: true },
            { icon: 'driver', label: 'Tài xế', count: '58' },
            { icon: 'ticket', label: 'Voucher', count: '12' },
            { icon: 'chart', label: 'Doanh thu' },
            { icon: 'tag', label: 'Bảng giá' },
            { icon: 'users', label: 'Khách hàng', count: '342' },
          ].map((m, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8, marginBottom: 2,
              background: m.active ? 'rgba(255,255,255,0.08)' : 'transparent',
              borderLeft: m.active ? `3px solid ${T.primary}` : '3px solid transparent',
              color: m.active ? '#fff' : 'rgba(255,255,255,0.7)',
              cursor: 'pointer', position: 'relative',
            }}>
              <Icon name={m.icon} size={18} color="currentColor" stroke={m.active ? 2.2 : 1.8} />
              <div style={{ fontSize: 14, fontWeight: m.active ? 600 : 500, flex: 1 }}>{m.label}</div>
              {m.count && <div style={{
                background: m.active ? T.primary : 'rgba(255,255,255,0.08)',
                color: '#fff', fontSize: 10, fontWeight: 700,
                padding: '2px 7px', borderRadius: 99,
              }}>{m.count}</div>}
            </div>
          ))}
        </div>
        <div style={{ padding: '16px 14px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: T.gold,
              fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>A</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Admin</div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>admin@greencar.vn</div>
            </div>
            <Icon name="logout" size={16} color="rgba(255,255,255,0.6)" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Top bar */}
        <div style={{
          padding: '18px 28px', background: '#fff',
          borderBottom: `1px solid ${T.borderSoft}`,
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div>
            <div style={{ ...F.h1, fontSize: 22 }}>Dashboard</div>
            <div style={{ ...F.caption, marginTop: 2 }}>Tổng quan hoạt động · Hôm nay 24/05/2026</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative' }}>
            <Input icon="search" placeholder="Tìm chuyến, tài xế..." dense />
          </div>
          <Button variant="primary" size="md" icon="plus">Tạo voucher</Button>
        </div>

        <div style={{ padding: 28 }}>
          {/* KPI grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            <KPI icon="car" iconBg={T.primary} value="47" delta="+12%" label="Cuốc hôm nay" sub="↑ so với hôm qua" deltaColor={T.success} />
            <KPI icon="chart" iconBg={T.success} value="18.2M đ" delta="+8.4%" label="Doanh thu" sub="Mục tiêu 22M" deltaColor={T.success} />
            <KPI icon="driver" iconBg={T.gold} value="23/58" delta="40%" label="Tài xế online" sub="3 chờ duyệt" deltaColor={T.warning} />
            <KPI icon="wallet" iconBg={T.navy} value="3.6M đ" delta="+9%" label="Phí app thu được" sub="20% mỗi chuyến" deltaColor={T.success} />
          </div>

          {/* Two-col: chart + actions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: 14, marginTop: 14 }}>
            {/* Revenue chart */}
            <Card>
              <div style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div>
                    <div style={{ ...F.h3, fontSize: 15 }}>Doanh thu 7 ngày qua</div>
                    <div style={{ ...F.caption, marginTop: 2 }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: T.primary, marginRight: 4 }} />
                      Khách trả
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: T.gold, marginLeft: 12, marginRight: 4 }} />
                      Phí app
                    </div>
                  </div>
                  <Chip size="sm" active>7 ngày</Chip>
                </div>
                <RevenueChart />
              </div>
            </Card>

            {/* Quick actions */}
            <Card>
              <div style={{ padding: 18 }}>
                <div style={{ ...F.h3, fontSize: 15, marginBottom: 12 }}>Cần xử lý</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { icon: 'driver', label: 'Duyệt tài xế mới', count: 3, color: T.warning },
                    { icon: 'ticket', label: 'Voucher sắp hết hạn', count: 2, color: T.danger },
                    { icon: 'block', label: 'Yêu cầu mở khoá', count: 1, color: T.primary },
                  ].map((a, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      borderRadius: 10, background: T.bg, cursor: 'pointer',
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: `${a.color}1f`, color: a.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon name={a.icon} size={16} color="currentColor" />
                      </div>
                      <div style={{ ...F.bodyB, flex: 1, fontSize: 13 }}>{a.label}</div>
                      <div style={{
                        background: a.color, color: '#fff',
                        padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                      }}>{a.count}</div>
                      <Icon name="chevR" size={14} color={T.neutralDim} />
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Recent trips table */}
          <Card style={{ marginTop: 14 }}>
            <div style={{ padding: '16px 18px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: `1px solid ${T.borderSoft}` }}>
              <div>
                <div style={{ ...F.h3, fontSize: 15 }}>Chuyến gần đây</div>
                <div style={{ ...F.caption, marginTop: 2 }}>Cập nhật mỗi 30 giây</div>
              </div>
              <Button variant="ghost" size="sm" iconRight="arrowRight">Xem tất cả</Button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: F.family }}>
              <thead>
                <tr style={{ background: T.bg }}>
                  {['#ID', 'Khách', 'Tài xế', 'Tuyến', 'Giá', 'Trạng thái', 'Giờ'].map((h, i) => (
                    <th key={i} style={{
                      textAlign: 'left', padding: '10px 14px',
                      fontSize: 11, fontWeight: 600, color: T.neutral,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { id: 'GC-2826', cust: 'Trần Minh Anh', driver: 'N.V. Hùng', route: 'Q.1 → TSN', price: '288k', status: 'accepted', label: 'Đã nhận', time: '14:32' },
                  { id: 'GC-2825', cust: 'Lê Hoài Thu', driver: 'L.M. Đức', route: 'NB → Hoàn Kiếm', price: '420k', status: 'progress', label: 'Đang chạy', time: '14:18' },
                  { id: 'GC-2824', cust: 'Phạm Đức Khang', driver: '—', route: 'Q.7 → TSN', price: '380k', status: 'pending', label: 'Tìm tài xế', time: '14:10' },
                  { id: 'GC-2823', cust: 'Nguyễn Thị Hà', driver: 'T.A. Bình', route: 'Đà Nẵng → Sân bay', price: '180k', status: 'completed', label: 'Hoàn thành', time: '13:58' },
                  { id: 'GC-2822', cust: 'Vũ Tuấn Anh', driver: 'H.T. Sơn', route: 'Q.3 → TSN', price: '265k', status: 'completed', label: 'Hoàn thành', time: '13:30' },
                  { id: 'GC-2821', cust: 'Đỗ Mai Linh', driver: '—', route: 'TSN → Q.7', price: '305k', status: 'cancelled', label: 'Đã huỷ', time: '13:12' },
                ].map((r, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                    <td style={tdCell}><span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 600, fontSize: 12 }}>{r.id}</span></td>
                    <td style={tdCell}>{r.cust}</td>
                    <td style={{ ...tdCell, color: r.driver === '—' ? T.neutralDim : T.ink }}>{r.driver}</td>
                    <td style={tdCell}>{r.route}</td>
                    <td style={{ ...tdCell, fontWeight: 600, fontFamily: 'ui-monospace, Menlo, monospace' }}>{r.price}</td>
                    <td style={tdCell}><Badge status={r.status}>{r.label}</Badge></td>
                    <td style={{ ...tdCell, color: T.neutral, fontVariantNumeric: 'tabular-nums' }}>{r.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  );
}

const tdCell = {
  padding: '12px 14px',
  fontSize: 13,
  color: T.ink,
};

function KPI({ icon, iconBg, value, delta, label, sub, deltaColor }) {
  return (
    <Card>
      <div style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: iconBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name={icon} size={20} color="#fff" stroke={2.2} />
          </div>
          <div style={{
            ...F.caption, color: deltaColor, fontWeight: 700, fontSize: 12,
            background: `${deltaColor}1a`, padding: '2px 8px', borderRadius: 99,
          }}>{delta}</div>
        </div>
        <div style={{ ...F.moneyXL, fontSize: 26, marginTop: 14 }}>{value}</div>
        <div style={{ ...F.body, fontWeight: 600, color: T.navy, fontSize: 13, marginTop: 2 }}>{label}</div>
        <div style={{ ...F.caption, marginTop: 2 }}>{sub}</div>
      </div>
    </Card>
  );
}

function RevenueChart() {
  // simple bar chart, no library
  const data = [
    { d: 'T2', a: 60, b: 12 },
    { d: 'T3', a: 75, b: 15 },
    { d: 'T4', a: 55, b: 11 },
    { d: 'T5', a: 88, b: 18 },
    { d: 'T6', a: 95, b: 19 },
    { d: 'T7', a: 70, b: 14 },
    { d: 'CN', a: 82, b: 16 },
  ];
  const max = 110;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 180,
      padding: '0 8px', borderBottom: `1px dashed ${T.border}` }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ ...F.caption, fontSize: 11, color: T.navy, fontWeight: 600 }}>
            {d.a / 10}M
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 140 }}>
            <div style={{
              width: 16, height: `${d.a/max*100}%`,
              background: `linear-gradient(180deg, ${T.primary}, ${T.primaryDark})`,
              borderRadius: '4px 4px 0 0',
            }} />
            <div style={{
              width: 10, height: `${d.b/max*100*4}%`,
              background: T.gold, opacity: 0.85,
              borderRadius: '4px 4px 0 0',
            }} />
          </div>
          <div style={{ ...F.caption, fontSize: 11 }}>{d.d}</div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { AdminDashboardPC });
