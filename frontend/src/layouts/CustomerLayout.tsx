import { Outlet, NavLink } from 'react-router-dom'
import ToastContainer from '@/components/common/Toast'
import AppHeader from '@/components/common/AppHeader'
import clsx from 'clsx'

const TABS = [
  { to: '/customer/booking',       icon: 'directions_car', label: 'Đặt xe' },
  { to: '/customer/history',       icon: 'receipt_long',   label: 'Lịch sử' },
  { to: '/customer/notifications', icon: 'notifications',  label: 'Thông báo' },
  { to: '/customer/profile',       icon: 'person',         label: 'Hồ sơ' },
]

export default function CustomerLayout() {
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
                  <span className="material-symbols-outlined text-[22px]"
                    style={{ fontVariationSettings: isActive ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400" }}>
                    {tab.icon}
                  </span>
                  <span className={clsx('text-[11px]', isActive ? 'font-semibold' : 'font-medium')}>{tab.label}</span>
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
