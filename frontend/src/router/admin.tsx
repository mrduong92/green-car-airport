import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { RequireRole } from '@/router/guards'
import AdminLayout from '@/layouts/AdminLayout'
import AdminLoginPage from '@/pages/admin/LoginPage'
import AdminDashboardPage from '@/pages/admin/DashboardPage'
import DriversPage from '@/pages/admin/DriversPage'
import VouchersPage from '@/pages/admin/VouchersPage'
import RevenuePage from '@/pages/admin/RevenuePage'
import PriceConfigPage from '@/pages/admin/PriceConfigPage'
import AdminCustomersPage from '@/pages/admin/CustomersPage'
import StaticPagesPage from '@/pages/admin/StaticPagesPage'
import AdminsPage from '@/pages/admin/AdminsPage'
import InstallPage from '@/pages/InstallPage'

function GuestOnly() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Outlet />
  if (user.role === 'admin') return <Navigate to="/dashboard" replace />
  return <Outlet /> // role không thuộc app này — hiện trang guest
}

export const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      { path: '/', element: <Navigate to="/login" replace /> },
      { path: '/login', element: <AdminLoginPage /> },
    ],
  },
  {
    element: <RequireRole role="admin" />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: '/dashboard', element: <AdminDashboardPage /> },
          { path: '/drivers', element: <DriversPage /> },
          { path: '/vouchers', element: <VouchersPage /> },
          { path: '/revenue', element: <RevenuePage /> },
          { path: '/prices', element: <PriceConfigPage /> },
          { path: '/customers', element: <AdminCustomersPage /> },
          { path: '/pages', element: <StaticPagesPage /> },
          { path: '/admins', element: <AdminsPage /> },
        ],
      },
    ],
  },
  { path: '/install', element: <InstallPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
])
