import { Outlet, NavLink } from 'react-router-dom'
import ToastContainer from '@/components/common/Toast'
import { useAuthStore } from '@/stores/auth'
import clsx from 'clsx'

const TABS = [
  { to: '/admin/dashboard', icon: 'dashboard',      label: 'Dashboard' },
  { to: '/admin/drivers',   icon: 'people',         label: 'Tài xế' },
  { to: '/admin/vouchers',  icon: 'confirmation_number', label: 'Voucher' },
  { to: '/admin/revenue',   icon: 'bar_chart',      label: 'Doanh thu' },
]

export default function AdminLayout() {
  const clearAuth = useAuthStore((s) => s.clearAuth)
  return (
    <div className="flex flex-col min-h-svh bg-surface max-w-[430px] mx-auto relative">
      <header className="bg-navy px-4 py-3 flex items-center justify-between safe-top">
        <span className="text-white font-bold text-lg">Green Car Admin</span>
        <button onClick={clearAuth} className="text-white/70 text-sm flex items-center gap-1">
          <span className="material-symbols-outlined text-lg">logout</span>
        </button>
      </header>
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
