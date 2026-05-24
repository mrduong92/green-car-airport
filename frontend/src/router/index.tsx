import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import CustomerLayout from '@/layouts/CustomerLayout'
import DriverLayout from '@/layouts/DriverLayout'
import AdminLayout from '@/layouts/AdminLayout'
import SplashPage from '@/pages/SplashPage'
import LoginPage from '@/pages/LoginPage'
import BookingFormPage from '@/pages/customer/BookingFormPage'
import BookingStatusPage from '@/pages/customer/BookingStatusPage'
import BookingHistoryPage from '@/pages/customer/BookingHistoryPage'
import CustomerProfilePage from '@/pages/customer/ProfilePage'
import CustomerNotificationsPage from '@/pages/customer/NotificationsPage'
import TripListPage from '@/pages/driver/TripListPage'
import TripDetailPage from '@/pages/driver/TripDetailPage'
import TripHistoryPage from '@/pages/driver/TripHistoryPage'
import WalletPage from '@/pages/driver/WalletPage'
import DriverProfilePage from '@/pages/driver/ProfilePage'
import AdminDashboardPage from '@/pages/admin/DashboardPage'
import DriversPage from '@/pages/admin/DriversPage'
import VouchersPage from '@/pages/admin/VouchersPage'
import RevenuePage from '@/pages/admin/RevenuePage'
import PriceConfigPage from '@/pages/admin/PriceConfigPage'
import AdminCustomersPage from '@/pages/admin/CustomersPage'
import DriverNotificationsPage from '@/pages/driver/NotificationsPage'

function RequireRole({ role }: { role: App.Role }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to="/" replace />
  return <Outlet />
}

function GuestOnly() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Outlet />
  if (user.role === 'customer') return <Navigate to="/customer/booking" replace />
  if (user.role === 'driver') return <Navigate to="/driver/trips" replace />
  return <Navigate to="/admin/dashboard" replace />
}

export const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      { path: '/', element: <SplashPage /> },
      { path: '/login', element: <LoginPage /> },
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
          { path: '/customer/notifications', element: <CustomerNotificationsPage /> },
          { path: '/customer/profile', element: <CustomerProfilePage /> },
        ],
      },
    ],
  },
  {
    element: <RequireRole role="driver" />,
    children: [
      {
        element: <DriverLayout />,
        children: [
          { path: '/driver/trips', element: <TripListPage /> },
          { path: '/driver/trips/history', element: <TripHistoryPage /> },
          { path: '/driver/trips/:id', element: <TripDetailPage /> },
          { path: '/driver/wallet', element: <WalletPage /> },
          { path: '/driver/notifications', element: <DriverNotificationsPage /> },
          { path: '/driver/profile', element: <DriverProfilePage /> },
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
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
