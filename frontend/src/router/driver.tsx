import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { RequireDriverActive, RequireDriverPending } from '@/router/guards'
import DriverLayout from '@/layouts/DriverLayout'
import LoginPage from '@/pages/driver/LoginPage'
import DriverRegisterPage from '@/pages/DriverRegisterPage'
import TripListPage from '@/pages/driver/TripListPage'
import TripDetailPage from '@/pages/driver/TripDetailPage'
import TripHistoryPage from '@/pages/driver/TripHistoryPage'
import WalletPage from '@/pages/driver/WalletPage'
import TopUpPage from '@/pages/driver/TopUpPage'
import DriverProfilePage from '@/pages/driver/ProfilePage'
import DriverNotificationsPage from '@/pages/driver/NotificationsPage'
import DriverStatsPage from '@/pages/driver/StatsPage'
import DriverPendingPage from '@/pages/driver/DriverPendingPage'
import InstallPage from '@/pages/InstallPage'

function GuestOnly() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Outlet />
  if (user.role === 'driver') {
    if (user.approval_status === 'pending' || user.approval_status === 'blocked')
      return <Navigate to="/driver/pending" replace />
    return <Navigate to="/driver/trips" replace />
  }
  return <Outlet /> // role không thuộc app này — hiện trang guest
}

export const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      { path: '/', element: <Navigate to="/login" replace /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/register/driver', element: <DriverRegisterPage /> },
    ],
  },
  {
    element: <RequireDriverPending />,
    children: [
      { path: '/driver/pending', element: <DriverPendingPage /> },
    ],
  },
  {
    element: <RequireDriverActive />,
    children: [
      {
        element: <DriverLayout />,
        children: [
          { path: '/driver/trips', element: <TripListPage /> },
          { path: '/driver/trips/history', element: <TripHistoryPage /> },
          { path: '/driver/trips/:id', element: <TripDetailPage /> },
          { path: '/driver/wallet', element: <WalletPage /> },
          { path: '/driver/wallet/topup', element: <TopUpPage /> },
          { path: '/driver/stats', element: <DriverStatsPage /> },
          { path: '/driver/notifications', element: <DriverNotificationsPage /> },
          { path: '/driver/profile', element: <DriverProfilePage /> },
        ],
      },
    ],
  },
  { path: '/install', element: <InstallPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
])
