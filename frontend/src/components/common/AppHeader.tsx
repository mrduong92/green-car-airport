import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { logout as logoutApi } from '@/api/auth'
import { unregisterPushSubscription } from '@/push'
import { useMutation } from '@tanstack/react-query'

const ROOT_TABS = new Set([
  '/customer/booking', '/customer/history', '/customer/notifications', '/customer/profile',
  '/driver/trips', '/driver/trips/history', '/driver/wallet', '/driver/notifications', '/driver/profile',
  '/admin/dashboard', '/admin/drivers', '/admin/vouchers',
  '/admin/revenue', '/admin/prices', '/admin/customers',
])

// Trailing-slash entries must come before same-prefix exact entries
const ROUTE_TITLES: [string, string, boolean][] = [
  ['/customer/booking/',        'Trạng thái đơn', false],
  ['/customer/booking',         'Đặt xe',          true],
  ['/customer/history',         'Lịch sử',         true],
  ['/customer/notifications',   'Thông báo',       true],
  ['/customer/profile',         'Hồ sơ',           true],
  ['/driver/trips/history',     'Lịch sử cuốc xe', true],
  ['/driver/trips/',            'Chi tiết cuốc',   false],
  ['/driver/trips',             'Cuốc xe',          true],
  ['/driver/wallet/topup',      'Nạp điểm',        false],
  ['/driver/wallet',            'Ví điểm',         true],
  ['/driver/notifications',     'Thông báo',       true],
  ['/driver/profile',           'Hồ sơ',           true],
  ['/admin/dashboard',          'Dashboard',       true],
  ['/admin/drivers',            'Tài xế',          true],
  ['/admin/vouchers',           'Voucher',          true],
  ['/admin/revenue',            'Doanh thu',       true],
  ['/admin/prices',             'Bảng giá',        true],
  ['/admin/customers',          'Khách hàng',      true],
]

function getRouteInfo(pathname: string): { title: string; isRoot: boolean } {
  for (const [prefix, title, isRoot] of ROUTE_TITLES) {
    const matches = prefix.endsWith('/')
      ? pathname.startsWith(prefix)
      : pathname === prefix
    if (matches) return { title, isRoot }
  }
  return { title: 'Green Car', isRoot: true }
}

const CUSTOMER_QUY_DINH = [
  { icon: 'schedule',      text: 'Đặt xe trước ít nhất 30 phút giờ khởi hành.' },
  { icon: 'cancel',        text: 'Hủy miễn phí trong vòng 1 giờ sau khi đặt.' },
  { icon: 'payments',      text: 'Hủy sau 1 giờ bị phạt 50.000đ, áp dụng cho chuyến tiếp theo.' },
  { icon: 'timer_off',     text: 'Chuyến tự động hủy sau 24 giờ nếu không có tài xế nhận.' },
  { icon: 'local_parking', text: 'Giá đã bao gồm phí cầu đường và bãi đỗ sân bay.' },
  { icon: 'phone',         text: 'Tài xế sẽ chủ động liên hệ trước giờ đón để xác nhận.' },
  { icon: 'edit_off',      text: 'Không thể thay đổi điểm đón/đến sau khi đã đặt chuyến.' },
]

const DRIVER_QUY_DINH = [
  { icon: 'account_balance_wallet', text: 'Phí ứng dụng 20% được trừ từ ví điểm sau mỗi chuyến hoàn thành.' },
  { icon: 'paid',                   text: 'Cần nạp điểm vào ví trước khi nhận cuốc (1.000đ = 1 điểm).' },
  { icon: 'checklist',              text: 'Tối đa 3 cuốc đang thực hiện cùng lúc.' },
  { icon: 'schedule',               text: 'Cập nhật trạng thái cuốc kịp thời — không để khách chờ.' },
  { icon: 'phone',                  text: 'Chủ động liên hệ khách trước giờ đón để xác nhận.' },
  { icon: 'gpp_bad',                text: 'Tài khoản vi phạm nhiều lần có thể bị khoá bởi admin.' },
]

export default function AppHeader() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, clearAuth } = useAuthStore()
  const [showQuyDinh, setShowQuyDinh] = useState(false)

  const logoutMutation = useMutation({
    mutationFn: logoutApi,
    onSettled: () => {
      unregisterPushSubscription()
      clearAuth()
    },
  })

  const { title, isRoot } = getRouteInfo(pathname)
  const inRootSet = ROOT_TABS.has(pathname)

  const regulations = user?.role === 'driver' ? DRIVER_QUY_DINH : CUSTOMER_QUY_DINH
  const regulationsTitle = user?.role === 'driver' ? 'Quy định tài xế' : 'Quy định đặt xe'

  return (
    <>
      <header className="sticky top-0 z-30 safe-top bg-white/[0.92] backdrop-blur-[10px] [-webkit-backdrop-filter:blur(10px)] border-b border-border-soft px-3 flex items-center justify-between min-h-[52px]">
        {/* Left — brand logo square or back button */}
        <div className="w-9 flex items-center shrink-0">
          {inRootSet ? (
            <div className="w-9 h-9 rounded-logo bg-primary-tint flex items-center justify-center">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 20 }}>directions_car</span>
            </div>
          ) : (
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 flex items-center justify-center text-navy"
              aria-label="Quay lại"
            >
              <span className="material-symbols-outlined text-[22px]">arrow_back</span>
            </button>
          )}
        </div>

        {/* Center — page title */}
        <div className="flex-1 text-center px-2 min-w-0">
          {inRootSet ? (
            <span className="text-navy font-semibold text-[15px] tracking-tight">Green Car</span>
          ) : (
            <span className="text-navy font-semibold text-[15px] truncate block">{title}</span>
          )}
        </div>

        {/* Right — Quy định (customer/driver) hoặc Logout (admin) */}
        <div className="w-24 flex items-center justify-end shrink-0">
          {user?.role === 'admin' ? (
            <button
              onClick={() => logoutMutation.mutate()}
              className="w-9 h-9 flex items-center justify-center text-neutral-gray"
              aria-label="Đăng xuất"
            >
              <span className="material-symbols-outlined text-[20px]">logout</span>
            </button>
          ) : (
            <button
              onClick={() => setShowQuyDinh(true)}
              className="flex items-center gap-1 text-primary text-[13px] font-semibold"
            >
              <span className="material-symbols-outlined text-[16px] leading-none">info</span>
              <span>Quy định</span>
            </button>
          )}
        </div>
      </header>

      {/* Quy định bottom sheet */}
      {showQuyDinh && (
        <div
          className="fixed inset-0 z-50 bg-black/40"
          onClick={() => setShowQuyDinh(false)}
        >
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-border-soft">
              <p className="text-[15px] font-semibold text-navy">{regulationsTitle}</p>
              <button onClick={() => setShowQuyDinh(false)} className="text-neutral-gray">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="px-4 py-4 flex flex-col gap-4 overflow-y-auto">
              {regulations.map(({ icon, text }) => (
                <div key={text} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-logo bg-primary-tint flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-primary text-[18px]">{icon}</span>
                  </div>
                  <p className="text-sm text-navy leading-relaxed pt-1">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
