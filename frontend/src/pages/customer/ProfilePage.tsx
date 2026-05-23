import { useMutation } from '@tanstack/react-query'
import { logout } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

export default function CustomerProfilePage() {
  const { user, clearAuth } = useAuthStore()

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: clearAuth,
  })

  return (
    <div className="flex flex-col">
      {/* Avatar section */}
      <div className="bg-white px-4 py-8 flex flex-col items-center border-b border-border-gray">
        <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-white text-3xl font-bold mb-3">
          {user?.name?.[0]?.toUpperCase() ?? '?'}
        </div>
        <p className="text-lg font-bold text-navy">{user?.name ?? '—'}</p>
        <p className="text-caption text-neutral-gray mt-1">{user?.phone ?? '—'}</p>
      </div>

      {/* Settings list */}
      <div className="bg-white mx-4 mt-4 rounded-card shadow-card divide-y divide-border-gray">
        <button className="w-full flex items-center gap-3 px-4 py-4">
          <span className="material-symbols-outlined text-neutral-gray">notifications</span>
          <span className="text-sm text-navy flex-1 text-left">Thông báo</span>
          <span className="material-symbols-outlined text-border-gray">chevron_right</span>
        </button>
        <button className="w-full flex items-center gap-3 px-4 py-4">
          <span className="material-symbols-outlined text-neutral-gray">help</span>
          <span className="text-sm text-navy flex-1 text-left">Hỗ trợ</span>
          <span className="material-symbols-outlined text-border-gray">chevron_right</span>
        </button>
        <button
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          className="w-full flex items-center gap-3 px-4 py-4 text-danger-red"
        >
          <span className="material-symbols-outlined">logout</span>
          <span className="text-sm font-medium">Đăng xuất</span>
        </button>
      </div>
    </div>
  )
}
