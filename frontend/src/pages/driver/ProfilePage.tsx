import { useQuery, useMutation } from '@tanstack/react-query'
import { getDriverProfile } from '@/api/trips'
import { logout } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import StatusBadge from '@/components/common/StatusBadge'

export default function DriverProfilePage() {
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const { data: profile } = useQuery({
    queryKey: ['driver-profile'],
    queryFn: () => getDriverProfile().then((r) => r.data),
  })
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: clearAuth,
  })

  const SETTINGS = [
    { icon: 'lock', label: 'Đổi mật khẩu' },
    { icon: 'notifications', label: 'Thông báo' },
  ]

  return (
    <div className="flex flex-col safe-top">
      {/* Profile header */}
      <div className="bg-white px-4 py-6 flex flex-col items-center border-b border-border-gray">
        <div className="relative mb-3">
          <div className="w-20 h-20 rounded-full bg-light-green flex items-center justify-center text-primary text-3xl font-bold">
            {profile?.name?.[0] ?? 'T'}
          </div>
          <button className="absolute bottom-0 right-0 w-7 h-7 bg-primary rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-sm">photo_camera</span>
          </button>
        </div>
        <p className="text-lg font-bold text-navy">{profile?.name ?? '—'}</p>
        <p className="text-caption text-neutral-gray mb-2">{profile?.phone ?? '—'}</p>
        <StatusBadge status={profile?.is_verified ? 'active' : 'waiting_approval'} />
      </div>

      {/* Stats */}
      <div className="bg-white mx-4 mt-4 rounded-card shadow-card p-4 grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Chuyến xong', value: profile?.trips_count ?? 0 },
          { label: 'Đánh giá', value: profile?.rating?.toFixed(1) ?? '—' },
          { label: 'Tháng', value: profile?.months_active ?? 0 },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="text-xl font-bold text-primary">{value}</p>
            <p className="text-caption text-neutral-gray">{label}</p>
          </div>
        ))}
      </div>

      {/* Vehicle info */}
      {profile && (
        <div className="bg-white mx-4 mt-3 rounded-card shadow-card p-4">
          <p className="text-sm font-semibold text-navy mb-3">Thông tin xe</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-neutral-gray">Hãng: </span>{profile.vehicle_make} {profile.vehicle_model}</div>
            <div><span className="text-neutral-gray">Biển số: </span><strong>{profile.vehicle_plate}</strong></div>
            <div><span className="text-neutral-gray">Năm: </span>{profile.vehicle_year}</div>
            <div><span className="text-neutral-gray">Màu: </span>{profile.vehicle_color}</div>
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="bg-white mx-4 mt-3 rounded-card shadow-card divide-y divide-border-gray">
        {SETTINGS.map(({ icon, label }) => (
          <button key={label} className="w-full flex items-center gap-3 px-4 py-4">
            <span className="material-symbols-outlined text-neutral-gray">{icon}</span>
            <span className="text-sm text-navy flex-1 text-left">{label}</span>
            <span className="material-symbols-outlined text-border-gray">chevron_right</span>
          </button>
        ))}
        <button onClick={() => logoutMutation.mutate()}
          className="w-full flex items-center gap-3 px-4 py-4 text-danger-red">
          <span className="material-symbols-outlined">logout</span>
          <span className="text-sm font-medium">Đăng xuất</span>
        </button>
      </div>
    </div>
  )
}
