import { Outlet, NavLink } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import ToastContainer from '@/components/common/Toast'
import AppHeader from '@/components/common/AppHeader'
import { useAuthStore } from '@/stores/auth'
import { logout as logoutApi } from '@/api/auth'
import clsx from 'clsx'

const TABS = [
  { to: '/admin/dashboard', icon: 'dashboard',           label: 'Dashboard' },
  { to: '/admin/drivers',   icon: 'people',              label: 'Tài xế' },
  { to: '/admin/vouchers',  icon: 'confirmation_number', label: 'Voucher' },
  { to: '/admin/revenue',   icon: 'bar_chart',           label: 'Doanh thu' },
  { to: '/admin/prices',    icon: 'sell',                label: 'Bảng giá' },
  { to: '/admin/customers', icon: 'manage_accounts',     label: 'Khách hàng' },
]

export default function AdminLayout() {
  const { clearAuth } = useAuthStore()
  const logoutMutation = useMutation({ mutationFn: logoutApi, onSettled: clearAuth })

  return (
    <div className="min-h-svh bg-warm-white">
      {/* PC sidebar — visible only lg+ */}
      <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 flex-col bg-navy z-50">
        <div className="px-5 py-6 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-2xl">directions_car</span>
            <span className="text-white font-bold text-lg">Green Car</span>
          </div>
          <p className="text-white/50 text-xs mt-1">Admin Portal</p>
        </div>
        <nav className="flex-1 py-2">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                clsx('flex items-center gap-3 px-5 py-3 text-sm transition-colors border-l-[3px]',
                  isActive
                    ? 'bg-white/10 text-white font-semibold border-primary'
                    : 'text-white/70 hover:bg-white/5 hover:text-white border-transparent')
              }
            >
              <span className="material-symbols-outlined text-xl">{tab.icon}</span>
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <button
            onClick={() => logoutMutation.mutate()}
            className="flex items-center gap-3 text-white/70 hover:text-white text-sm w-full px-1 py-2 transition-colors"
          >
            <span className="material-symbols-outlined text-xl">logout</span>
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Content area */}
      <div className="flex flex-col min-h-svh max-w-[430px] mx-auto lg:ml-64 lg:max-w-none lg:mx-0">
        {/* Mobile header */}
        <div className="lg:hidden">
          <AppHeader />
        </div>
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-border-gray safe-bottom z-40">
        <div className="flex">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                clsx('flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors',
                  isActive ? 'text-primary' : 'text-neutral-gray')
              }
            >
              {({ isActive }) => (
                <>
                  <span className="material-symbols-outlined text-xl"
                    style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                    {tab.icon}
                  </span>
                  <span className="font-medium text-[10px] leading-tight text-center">{tab.label}</span>
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
