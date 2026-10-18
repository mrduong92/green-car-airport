import { useEffect, useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import ToastContainer from '@/components/common/Toast'
import AppHeader from '@/components/common/AppHeader'
import { useNotifications } from '@/hooks/useNotifications'
import { useAppPresence } from '@/hooks/useAppPresence'
import { useDriverStream } from '@/hooks/useDriverStream'
import { useDriverCapacity } from '@/hooks/useDriverCapacity'
import { useAuthStore } from '@/stores/auth'
import clsx from 'clsx'

// `primary` = hiện trên bottom nav; còn lại gom vào sheet "Thêm".
const TABS = [
  { to: '/driver/trips',         icon: 'list_alt',               label: 'Cuốc xe',  primary: true },
  { to: '/driver/free',          icon: 'local_taxi',             label: 'Free',     primary: true },
  { to: '/driver/trips/history', icon: 'receipt_long',           label: 'Lịch sử' },
  { to: '/driver/stats',         icon: 'bar_chart',              label: 'Thống kê' },
  { to: '/driver/wallet',        icon: 'account_balance_wallet', label: 'Ví điểm',  primary: true },
  { to: '/driver/notifications', icon: 'notifications',          label: 'Thông báo', primary: true },
  { to: '/driver/profile',       icon: 'person',                 label: 'Hồ sơ' },
]

const PRIMARY_TABS = TABS.filter((t) => t.primary)
const MORE_TABS = TABS.filter((t) => !t.primary)

// Có tab Free: nút (+) đăng cuốc to nhất, nằm chính giữa thanh menu — 2 ô mỗi bên, Ví điểm vào "Thêm".
const POST_RIDE_PATH = '/driver/free/create'
const FREE_NAV = ['/driver/trips', '/driver/free', '/driver/notifications']
const FREE_PRIMARY_TABS = TABS.filter((t) => FREE_NAV.includes(t.to))
const FREE_MORE_TABS = TABS.filter((t) => !FREE_NAV.includes(t.to))

const iconStyle = (active: boolean) => ({
  fontVariationSettings: active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400",
})

export default function DriverLayout() {
  const { unreadCount } = useNotifications()
  const { atCapacity } = useDriverCapacity()
  useDriverStream(true, atCapacity)
  useAppPresence()
  const { pathname } = useLocation()
  const freeRidesEnabled = useAuthStore((s) => s.user?.free_rides_enabled !== false)
  const primaryTabs = freeRidesEnabled ? FREE_PRIMARY_TABS : PRIMARY_TABS.filter((t) => t.to !== '/driver/free')
  const moreTabs = freeRidesEnabled ? FREE_MORE_TABS : MORE_TABS
  // Màn đăng cuốc chỉ để gõ và đăng một cuốc: ẩn thanh menu cho tài xế tập trung vào ô nhập tin.
  const hideNav = pathname === POST_RIDE_PATH
  // Lưu path lúc mở sheet: điều hướng đi (kể cả nút back) là sheet tự đóng
  const [moreOpenAt, setMoreOpenAt] = useState<string | null>(null)
  const moreOpen = moreOpenAt === pathname
  const setMoreOpen = (open: boolean) => setMoreOpenAt(open ? pathname : null)
  const inMore = moreTabs.some((t) => pathname.startsWith(t.to))

  useEffect(() => {
    if (!moreOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moreOpen])

  return (
    // App-shell: khung cao đúng màn hình, chỉ <main> cuộn, bottom nav là phần tử thường (không fixed).
    // Safari iOS hay vẽ lệch thanh fixed/sticky có backdrop-filter khi cả trang cuộn (thanh địa chỉ co
    // giãn, danh sách đổi chiều cao lúc đang cuộn) → menu "kẹt" giữa màn hình ở tab Free.
    <div className="flex flex-col h-app w-full bg-warm-white overflow-hidden">
      <AppHeader />
      <main className="flex-1 min-h-0 w-full overflow-y-auto flex flex-col">
        <Outlet />
      </main>
      {!hideNav && <nav className="relative shrink-0 w-full bg-white/[0.96] backdrop-blur-[12px] [-webkit-backdrop-filter:blur(12px)] border-t border-border-soft shadow-card-up safe-bottom z-40">
        <div className="flex pt-2 pb-1">
          {primaryTabs.flatMap((tab, i) => [
            freeRidesEnabled && i === 2 && (
              <div key="post-ride" className="flex-1 min-w-0 flex justify-center">
                <NavLink
                  to={POST_RIDE_PATH}
                  data-testid="nav-post-ride"
                  className="group -mt-7 flex flex-col items-center gap-[3px] text-neutral-dim hover:text-primary focus-visible:text-primary outline-none transition-colors"
                >
                  {/* Hover/focus: nút nhấc lên, bóng xanh đậm hơn, dấu + phóng to; tắt khi máy bật giảm chuyển động. */}
                  <span className="w-[60px] h-[60px] rounded-full bg-primary text-white flex items-center justify-center shadow-card-up ring-[5px] ring-white transition-all duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_10px_24px_-6px_rgba(0,106,54,0.55)] group-focus-visible:-translate-y-1 group-focus-visible:ring-light-green group-active:translate-y-0 group-active:scale-95 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
                    <span className="material-symbols-outlined text-[34px] transition-transform duration-200 ease-out group-hover:scale-110 group-focus-visible:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100" style={{ fontVariationSettings: "'wght' 600" }}>add</span>
                  </span>
                  <span className="text-[9px] font-medium whitespace-nowrap">Đăng cuốc</span>
                </NavLink>
              </div>
            ),
            <NavLink
              key={tab.to}
              to={tab.to}
              end
              className={({ isActive }) =>
                clsx('flex-1 min-w-0 min-h-touch flex flex-col items-center justify-center py-1.5 gap-[3px] transition-colors',
                  isActive ? 'text-primary' : 'text-neutral-dim')
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative">
                    <span className="material-symbols-outlined text-[18px]" style={iconStyle(isActive)}>
                      {tab.icon}
                    </span>
                    {tab.icon === 'notifications' && unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-danger-red text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-[3px]">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </span>
                  <span className={clsx('text-[9px] max-w-full whitespace-nowrap truncate px-px', isActive ? 'font-semibold' : 'font-medium')}>{tab.label}</span>
                </>
              )}
            </NavLink>,
          ])}
          <button
            type="button"
            onClick={() => setMoreOpen(!moreOpen)}
            aria-expanded={moreOpen}
            className={clsx('flex-1 min-w-0 min-h-touch flex flex-col items-center justify-center py-1.5 gap-[3px] transition-colors',
              inMore || moreOpen ? 'text-primary' : 'text-neutral-dim')}
          >
            <span className="material-symbols-outlined text-[18px]" style={iconStyle(inMore || moreOpen)}>
              {moreOpen ? 'close' : 'more_horiz'}
            </span>
            <span className={clsx('text-[9px] whitespace-nowrap px-px', inMore || moreOpen ? 'font-semibold' : 'font-medium')}>Thêm</span>
          </button>
        </div>
      </nav>}

      {/* Sheet "Thêm" — nằm dưới bottom nav để nút Thêm vẫn bấm được để đóng */}
      {moreOpen && (
        <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute bottom-0 left-0 w-full bg-white rounded-t-2xl pt-4 px-4 pb-nav"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[12px] font-semibold text-neutral-gray uppercase tracking-wide mb-3 px-1">Thêm</p>
            <div className="grid grid-cols-3 gap-2 pb-4">
              {moreTabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    clsx('flex flex-col items-center justify-center gap-1.5 rounded-card py-4 px-2 min-h-touch transition-colors',
                      isActive ? 'bg-light-green text-primary' : 'bg-warm-white text-navy active:bg-light-green')
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className="material-symbols-outlined text-[26px]" style={iconStyle(isActive)}>{tab.icon}</span>
                      <span className={clsx('text-[13px] text-center leading-tight whitespace-nowrap', isActive ? 'font-semibold' : 'font-medium')}>{tab.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  )
}
