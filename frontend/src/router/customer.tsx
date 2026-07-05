import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { RequireRole } from '@/router/guards'
import CustomerLayout from '@/layouts/CustomerLayout'
import AdminLayout from '@/layouts/AdminLayout'
import SplashPage from '@/pages/SplashPage'
import LoginPage from '@/pages/customer/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import BookingFormPage from '@/pages/customer/BookingFormPage'
import BookingStatusPage from '@/pages/customer/BookingStatusPage'
import BookingHistoryPage from '@/pages/customer/BookingHistoryPage'
import CustomerProfilePage from '@/pages/customer/ProfilePage'
import CustomerNotificationsPage from '@/pages/customer/NotificationsPage'
import CustomerStatsPage from '@/pages/customer/StatsPage'
import CollaboratorWalletPage from '@/pages/customer/CollaboratorWalletPage'
import AdminDashboardPage from '@/pages/admin/DashboardPage'
import AdminLoginPage from '@/pages/admin/LoginPage'
import DriversPage from '@/pages/admin/DriversPage'
import VouchersPage from '@/pages/admin/VouchersPage'
import RevenuePage from '@/pages/admin/RevenuePage'
import PriceConfigPage from '@/pages/admin/PriceConfigPage'
import AdminCustomersPage from '@/pages/admin/CustomersPage'
import StaticPagesPage from '@/pages/admin/StaticPagesPage'
import InstallPage from '@/pages/InstallPage'

function GuestOnly() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Outlet />
  if (user.role === 'customer') return <Navigate to="/customer/booking" replace />
  if (user.role === 'admin') return <Navigate to="/admin/dashboard" replace />
  return <Outlet /> // role không thuộc app này (vd token driver cũ) — hiện trang guest
}

export const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      { path: '/', element: <SplashPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/admin/login', element: <AdminLoginPage /> },
    ],
  },
  {
    element: <RequireRole role="customer" />,
    children: [
      {
        element: <CustomerLayout />,
        children: [
          { path: '/customer/booking', element: <BookingFormPage /> },
          { path: '/customer/booking/:id', element: <BookingStatusPage /> },
          { path: '/customer/history', element: <BookingHistoryPage /> },
          { path: '/customer/stats', element: <CustomerStatsPage /> },
          { path: '/customer/notifications', element: <CustomerNotificationsPage /> },
          { path: '/customer/profile', element: <CustomerProfilePage /> },
          { path: '/customer/collaborator/wallet', element: <CollaboratorWalletPage /> },
        ],
      },
    ],
  },
  {
    element: <RequireRole role="admin" />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: '/admin/dashboard', element: <AdminDashboardPage /> },
          { path: '/admin/drivers', element: <DriversPage /> },
          { path: '/admin/vouchers', element: <VouchersPage /> },
          { path: '/admin/revenue', element: <RevenuePage /> },
          { path: '/admin/prices', element: <PriceConfigPage /> },
          { path: '/admin/customers', element: <AdminCustomersPage /> },
          { path: '/admin/pages', element: <StaticPagesPage /> },
        ],
      },
    ],
  },
  { path: '/install', element: <InstallPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
])
