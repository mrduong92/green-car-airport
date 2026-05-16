import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAvailableTrips, toggleOnline, acceptTrip } from '@/api/trips'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import EmptyState from '@/components/common/EmptyState'
import clsx from 'clsx'

export default function TripListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const showToast = useUiStore((s) => s.showToast)
  const [isOnline, setIsOnline] = useState(false)
  const [sort, setSort] = useState('newest')

  const { data: trips = [] } = useQuery({
    queryKey: ['trips', sort],
    queryFn: () => getAvailableTrips({ sort }).then((r) => r.data),
    refetchInterval: isOnline ? 15_000 : false,
    enabled: isOnline,
  })

  const toggleMutation = useMutation({
    mutationFn: (online: boolean) => toggleOnline(online),
    onSuccess: (_, online) => setIsOnline(online),
  })

  const acceptMutation = useMutation({
    mutationFn: (id: number) => acceptTrip(id),
    onSuccess: (_, id) => {
      showToast('Đã nhận cuốc!', 'success')
      qc.invalidateQueries({ queryKey: ['trips'] })
      navigate(`/driver/trips/${id}`)
    },
    onError: () => showToast('Nhận cuốc thất bại', 'error'),
  })

  return (
    <div className="flex flex-col safe-top">
      {/* Header */}
      <div className="bg-white px-4 pt-4 pb-3 border-b border-border-gray">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-light-green flex items-center justify-center text-primary font-bold">
              {user?.name?.[0] ?? 'T'}
            </div>
            <div>
              <p className="text-caption text-neutral-gray">Xin chào,</p>
              <p className="text-sm font-semibold text-navy">{user?.name ?? 'Tài xế'} 👋</p>
            </div>
          </div>
          <div className="flex items-center gap-1 bg-light-green rounded-pill px-3 py-1.5">
            <span className="material-symbols-outlined text-gold text-lg">paid</span>
            <span className="text-sm font-bold text-navy">1,240 điểm</span>
          </div>
        </div>

        {/* Online toggle */}
        <div className="flex items-center justify-between bg-surface rounded-card px-4 py-3">
          <span className="text-sm text-navy font-medium">Sẵn sàng nhận cuốc</span>
          <button
            onClick={() => toggleMutation.mutate(!isOnline)}
            className={clsx('relative w-12 h-6 rounded-full transition-colors',
              isOnline ? 'bg-primary' : 'bg-border-gray')}
          >
            <span className={clsx('absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
              isOnline ? 'translate-x-6' : 'translate-x-0.5')} />
          </button>
        </div>
      </div>

      {/* Sort row */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-1 text-sm text-neutral-gray">
          <span className="material-symbols-outlined text-lg">location_on</span>
          <span>Sắp xếp theo:</span>
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)}
          className="text-sm text-navy bg-white border border-border-gray rounded-pill px-3 py-1 outline-none">
          <option value="newest">Mới nhất</option>
          <option value="nearest">Gần nhất</option>
        </select>
      </div>

      {/* Trip list */}
      <div className="flex flex-col px-4 gap-3 pb-4">
        {!isOnline && (
          <EmptyState icon="toggle_off" title="Bạn đang offline"
            description="Bật sẵn sàng nhận cuốc để thấy danh sách chuyến" />
        )}
        {isOnline && trips.length === 0 && (
          <EmptyState icon="directions_car" title="Chưa có cuốc xe nào"
            description="Hãy chờ khách đặt!" />
        )}
        {isOnline && trips.map((trip) => (
          <div key={trip.id} className="bg-white rounded-card shadow-card border-l-4 border-primary overflow-hidden">
            <div className="p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-caption text-neutral-gray">
                  <span className="material-symbols-outlined text-sm">schedule</span>
                  <span>{trip.time} · {trip.date}</span>
                </div>
                {trip.is_new && (
                  <span className="bg-primary text-white text-xs font-bold rounded-pill px-2 py-0.5">MỚI</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-lg">location_on</span>
                <span className="text-sm text-navy flex-1 truncate">{trip.pickup}</span>
                <span className="material-symbols-outlined text-neutral-gray text-sm">arrow_right_alt</span>
                <span className="material-symbols-outlined text-orange-500 text-lg">flight_takeoff</span>
                <span className="text-sm text-navy flex-1 truncate">{trip.destination}</span>
              </div>

              <div className="flex gap-4 text-caption text-neutral-gray">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">straighten</span>
                  {trip.distance_km} km
                </span>
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">timer</span>
                  ~{trip.duration_min} phút
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-primary font-bold">{trip.price.toLocaleString('vi')} đ</span>
                  <span className="text-caption text-neutral-gray ml-2">
                    [Phí: {trip.app_fee.toLocaleString('vi')}đ]
                  </span>
                </div>
              </div>

              <button
                onClick={() => acceptMutation.mutate(trip.id)}
                disabled={acceptMutation.isPending}
                className="w-full bg-primary text-white rounded-card py-3 text-cta font-semibold mt-1 active:bg-primary-dark disabled:bg-border-gray"
              >
                NHẬN CUỐC
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
