import { useMutation } from '@tanstack/react-query'
import { logout } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

export default function CustomerProfilePage() {
  const { user, clearAuth } = useAuthStore()

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: clearAuth,
  })

  const initials = user?.name
    ? user.name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <div className="w-full flex flex-col px-4 py-4 gap-4">
      {/* Gradient profile card */}
      <div className="rounded-card overflow-hidden shadow-card border border-border-soft">
        <div
          className="px-5 py-6 flex items-center gap-4"
          style={{ background: 'linear-gradient(135deg, #1E3A8A 0%, #162C6B 100%)' }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-2xl text-white shrink-0"
            style={{ background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)' }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-[18px] truncate">{user?.name ?? '—'}</p>
            <p className="text-white/80 text-[13px] mt-0.5">{user?.phone ?? '—'}</p>
            <div
              className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-pill text-[11px] font-semibold text-white"
              style={{ background: 'rgba(255,255,255,0.18)' }}
            >
              <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
              Khách hàng
            </div>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { val: '—', label: 'Chuyến' },
          { val: '—', label: 'Hoàn thành' },
          { val: '—', label: 'Đã hủy' },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-card border border-border-soft text-center px-3 py-3"
          >
            <p className="text-navy font-bold text-[18px]">{s.val}</p>
            <p className="text-neutral-gray text-[11px] mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Settings list */}
      <div className="bg-white rounded-card shadow-card border border-border-soft overflow-hidden">
        {[
          { icon: 'person', label: 'Thông tin cá nhân' },
          { icon: 'confirmation_number', label: 'Voucher của tôi' },
          { icon: 'notifications', label: 'Thông báo' },
          { icon: 'help', label: 'Trợ giúp & Liên hệ' },
        ].map((row, i, arr) => (
          <button
            key={row.icon}
            className={`w-full flex items-center gap-3 px-4 py-4 text-left ${i < arr.length - 1 ? 'border-b border-border-soft' : ''}`}
          >
            <div className="w-8 h-8 rounded-logo bg-primary-tint flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-[16px]">{row.icon}</span>
            </div>
            <span className="text-navy text-sm font-medium flex-1">{row.label}</span>
            <span className="material-symbols-outlined text-neutral-dim text-[16px]">chevron_right</span>
          </button>
        ))}
      </div>

      {/* Logout */}
      <button
        onClick={() => logoutMutation.mutate()}
        disabled={logoutMutation.isPending}
        className="w-full h-11 rounded-pill border-[1.5px] border-danger-red text-danger-red text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-[16px]">logout</span>
        Đăng xuất
      </button>
    </div>
  )
}
