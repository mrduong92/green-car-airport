import { useEffect, useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import ToastContainer from '@/components/common/Toast'
import AppHeader from '@/components/common/AppHeader'
import { useNotifications } from '@/hooks/useNotifications'
import { useDriverStream } from '@/hooks/useDriverStream'
import { useDriverCapacity } from '@/hooks/useDriverCapacity'
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

const iconStyle = (active: boolean) => ({
  fontVariationSettings: active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400",
})

export default function DriverLayout() {
  const { unreadCount } = useNotifications()
  const { atCapacity } = useDriverCapacity()
  useDriverStream(true, atCapacity)
  const { pathname } = useLocation()
  // Lưu path lúc mở sheet: điều hướng đi (kể cả nút back) là sheet tự đóng
  const [moreOpenAt, setMoreOpenAt] = useState<string | null>(null)
  const moreOpen = moreOpenAt === pathname
  const setMoreOpen = (open: boolean) => setMoreOpenAt(open ? pathname : null)
  const inMore = MORE_TABS.some((t) => pathname.startsWith(t.to))

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
    <div className="flex flex-col min-h-svh w-full bg-warm-white">
      <AppHeader />
      <main className="flex-1 w-full overflow-y-auto pb-nav flex flex-col">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 w-full bg-white/[0.96] backdrop-blur-[12px] [-webkit-backdrop-filter:blur(12px)] border-t border-border-soft shadow-card-up safe-bottom z-40">
        <div className="flex pt-2 pb-1">
          {PRIMARY_TABS.map((tab) => (
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
            </NavLink>
          ))}
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
      </nav>

      {/* Sheet "Thêm" — nằm dưới bottom nav để nút Thêm vẫn bấm được để đóng */}
      {moreOpen && (
        <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute bottom-0 left-0 w-full bg-white rounded-t-2xl pt-4 px-4 pb-nav"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[12px] font-semibold text-neutral-gray uppercase tracking-wide mb-3 px-1">Thêm</p>
            <div className="grid grid-cols-3 gap-2 pb-4">
              {MORE_TABS.map((tab) => (
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
