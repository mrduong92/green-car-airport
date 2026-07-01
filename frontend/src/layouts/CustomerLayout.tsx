import { useEffect } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import ToastContainer from '@/components/common/Toast'
import AppHeader from '@/components/common/AppHeader'
import { useNotifications } from '@/hooks/useNotifications'
import { useCustomerStream } from '@/hooks/useCustomerStream'
import { useAuthStore } from '@/stores/auth'
import { getMe } from '@/api/auth'
import clsx from 'clsx'

const TABS = [
  { to: '/customer/booking',       icon: 'directions_car', label: 'Đặt xe' },
  { to: '/customer/history',       icon: 'receipt_long',   label: 'Lịch sử' },
  { to: '/customer/stats',         icon: 'bar_chart',      label: 'Thống kê' },
  { to: '/customer/notifications', icon: 'notifications',  label: 'Thông báo' },
  { to: '/customer/profile',       icon: 'person',         label: 'Hồ sơ' },
]

export default function CustomerLayout() {
  const { unreadCount } = useNotifications()
  const token = useAuthStore((s) => s.token)
  const setAuth = useAuthStore((s) => s.setAuth)

  useCustomerStream(!!token)

  useEffect(() => {
    if (!token) return
    getMe().then((r) => setAuth(r.data, token)).catch(() => {})
  }, [])

  return (
    <div className="flex flex-col min-h-svh w-full bg-warm-white">
      <AppHeader />
      <main className="flex-1 w-full overflow-y-auto pb-nav flex flex-col">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 w-full bg-white/[0.96] backdrop-blur-[12px] [-webkit-backdrop-filter:blur(12px)] border-t border-border-soft shadow-card-up safe-bottom z-40">
        <div className="flex pt-2 pb-1">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                clsx('flex-1 flex flex-col items-center py-1.5 gap-[3px] transition-colors',
                  isActive ? 'text-primary' : 'text-neutral-dim')
              }
            >
              {({ isActive }) => (
                <>
                  <span className="relative">
                    <span className="material-symbols-outlined text-[20px]"
                      style={{ fontVariationSettings: isActive ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400" }}>
                      {tab.icon}
                    </span>
                    {tab.icon === 'notifications' && unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-danger-red text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-[3px]">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </span>
                  <span className={clsx('text-[10px]', isActive ? 'font-semibold' : 'font-medium')}>{tab.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
      <ToastContainer />
    </div>
  )
}
