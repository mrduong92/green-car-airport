import { useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import ToastContainer from '@/components/common/Toast'
import AppHeader from '@/components/common/AppHeader'
import { useAuthStore } from '@/stores/auth'
import { logout as logoutApi } from '@/api/auth'
import BrandGlyph from '@/components/common/BrandGlyph'
import { BRAND } from '@/brand'
import clsx from 'clsx'

// `primary` = hiện trên bottom nav mobile; còn lại gom vào sheet "Thêm".
// Thứ tự mảng là thứ tự sidebar PC.
const TABS = [
  { to: '/dashboard', icon: 'dashboard',           label: 'Dashboard', primary: true },
  { to: '/drivers',   icon: 'people',              label: 'Tài xế', primary: true },
  { to: '/vouchers',  icon: 'confirmation_number', label: 'Voucher' },
  { to: '/campaigns', icon: 'campaign',            label: 'Chiến dịch' },
  { to: '/revenue',   icon: 'bar_chart',           label: 'Doanh thu', primary: true },
  { to: '/prices',    icon: 'sell',                label: 'Bảng giá' },
  { to: '/customers', icon: 'manage_accounts',     label: 'Khách hàng', primary: true },
  { to: '/pages',     icon: 'article',             label: 'Trang tĩnh' },
  { to: '/admins',    icon: 'admin_panel_settings', label: 'Admin' },
  { to: '/settings',  icon: 'settings',            label: 'Cài đặt' },
]

const PRIMARY_ORDER = ['/dashboard', '/drivers', '/customers', '/revenue']
const PRIMARY_TABS = PRIMARY_ORDER.map((to) => TABS.find((t) => t.to === to)!)
const MORE_TABS = TABS.filter((t) => !t.primary)

const iconStyle = (active: boolean) => ({
  fontVariationSettings: active ? "'FILL' 1, 'wght' 500" : "'FILL' 0, 'wght' 400",
})

export default function AdminLayout() {
  const { clearAuth } = useAuthStore()
  const logoutMutation = useMutation({ mutationFn: logoutApi, onSettled: clearAuth })
  const { pathname } = useLocation()
  // Lưu path lúc mở sheet: điều hướng đi (kể cả nút back) là sheet tự đóng
  const [moreOpenAt, setMoreOpenAt] = useState<string | null>(null)
  const moreOpen = moreOpenAt === pathname
  const setMoreOpen = (open: boolean) => setMoreOpenAt(open ? pathname : null)
  const inMore = MORE_TABS.some((t) => pathname.startsWith(t.to))

  return (
    <div className="min-h-svh bg-warm-white">
      {/* PC sidebar — visible only lg+ */}
      <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 flex-col bg-navy z-50">
        <div className="px-5 py-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-logo bg-white/10 flex items-center justify-center shrink-0">
              <BrandGlyph size={20} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-[16px] leading-tight">{BRAND.name}</p>
              <p className="text-white/50 text-[11px]">Admin Portal</p>
            </div>
          </div>
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
        <main className="flex-1 w-full overflow-y-auto pb-nav lg:pb-8 flex flex-col">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav — 4 tab chính + "Thêm" */}
      <nav className="lg:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white/[0.96] backdrop-blur-[12px] [-webkit-backdrop-filter:blur(12px)] border-t border-border-soft shadow-card-up safe-bottom z-40">
        <div className="flex pt-1.5 pb-1">
          {PRIMARY_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                clsx('flex-1 min-h-touch flex flex-col items-center justify-center py-1.5 gap-0.5 transition-colors',
                  isActive ? 'text-primary' : 'text-neutral-dim')
              }
            >
              {({ isActive }) => (
                <>
                  <span className="material-symbols-outlined text-[24px]" style={iconStyle(isActive)}>{tab.icon}</span>
                  <span className={clsx('text-[11px] leading-tight text-center', isActive ? 'font-semibold' : 'font-medium')}>{tab.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(!moreOpen)}
            aria-expanded={moreOpen}
            className={clsx('flex-1 min-h-touch flex flex-col items-center justify-center py-1.5 gap-0.5 transition-colors',
              inMore || moreOpen ? 'text-primary' : 'text-neutral-dim')}
          >
            <span className="material-symbols-outlined text-[24px]" style={iconStyle(inMore || moreOpen)}>
              {moreOpen ? 'close' : 'menu'}
            </span>
            <span className={clsx('text-[11px] leading-tight', inMore || moreOpen ? 'font-semibold' : 'font-medium')}>Thêm</span>
          </button>
        </div>
      </nav>

      {/* Sheet "Thêm" — nằm dưới bottom nav để nút Thêm vẫn bấm được để đóng */}
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-2xl pt-4 px-4 pb-nav"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[12px] font-semibold text-neutral-gray uppercase tracking-wide mb-3 px-1">Quản lý khác</p>
            <div className="grid grid-cols-3 gap-2 pb-4">
              {MORE_TABS.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    clsx('flex flex-col items-center justify-center gap-1.5 rounded-card py-4 px-2 transition-colors',
                      isActive ? 'bg-light-green text-primary' : 'bg-warm-white text-navy active:bg-light-green')
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className="material-symbols-outlined text-[26px]" style={iconStyle(isActive)}>{tab.icon}</span>
                      <span className={clsx('text-[13px] text-center leading-tight', isActive ? 'font-semibold' : 'font-medium')}>{tab.label}</span>
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
