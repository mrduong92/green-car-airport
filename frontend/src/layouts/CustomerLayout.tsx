import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import ToastContainer from '@/components/common/Toast'
import clsx from 'clsx'

const TABS = [
  { to: '/customer/booking', icon: 'directions_car', label: 'Đặt xe' },
  { to: '/customer/history', icon: 'receipt_long', label: 'Lịch sử' },
]

export default function CustomerLayout() {
  return (
    <div className="flex flex-col min-h-svh bg-warm-white max-w-[430px] mx-auto relative">
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-border-gray safe-bottom z-40">
        <div className="flex">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                clsx('flex-1 flex flex-col items-center py-2 gap-1 text-xs transition-colors',
                  isActive ? 'text-primary' : 'text-neutral-gray')
              }
            >
              {({ isActive }) => (
                <>
                  <span className="material-symbols-outlined text-2xl"
                    style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                    {tab.icon}
                  </span>
                  <span className="font-medium">{tab.label}</span>
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
