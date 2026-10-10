import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import TermsGate from '@/components/common/TermsGate'

export function RequireRole({ role }: { role: App.Role }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to="/" replace />
  return <TermsGate><Outlet /></TermsGate>
}

// Chỉ cho driver đã active vào
export function RequireDriverActive() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'driver') return <Navigate to="/" replace />
  if (user.approval_status === 'pending' || user.approval_status === 'blocked')
    return <Navigate to="/driver/pending" replace />
  return <TermsGate><Outlet /></TermsGate>
}

// Chỉ cho driver pending/blocked vào /driver/pending
export function RequireDriverPending() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'driver') return <Navigate to="/" replace />
  if (user.approval_status === 'active') return <Navigate to="/driver/trips" replace />
  return <TermsGate><Outlet /></TermsGate>
}
