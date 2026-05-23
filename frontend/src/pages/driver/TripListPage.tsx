import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAvailableTrips, getWallet, toggleOnline, acceptTrip } from '@/api/trips'
import { useUiStore } from '@/stores/ui'
import EmptyState from '@/components/common/EmptyState'
import clsx from 'clsx'

export default function TripListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const [isOnline, setIsOnline] = useState(false)
  const [sort, setSort] = useState('newest')
  const [hasLocation, setHasLocation] = useState(false)

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => getWallet().then((r) => r.data),
  })

  const { data: trips = [] } = useQuery({
    queryKey: ['trips', sort],
    queryFn: () => getAvailableTrips({ sort }).then((r) => r.data),
    refetchInterval: isOnline ? 15_000 : false,
    enabled: isOnline,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ online, latitude, longitude }: { online: boolean; latitude?: number; longitude?: number }) =>
      toggleOnline(online, latitude, longitude),
    onSuccess: (_, { online }) => setIsOnline(online),
  })

  const handleToggleOnline = () => {
    const goOnline = !isOnline
    if (goOnline) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          setHasLocation(true)
          toggleMutation.mutate({ online: true, latitude: coords.latitude, longitude: coords.longitude })
        },
        () => {
          setHasLocation(false)
          toggleMutation.mutate({ online: true })
        },
        { timeout: 5000 },
      )
    } else {
      setHasLocation(false)
      toggleMutation.mutate({ online: false })
    }
  }

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
    <div className="flex flex-col">
      {/* Online toggle strip */}
      <div className="bg-white px-4 py-3 border-b border-border-gray">
        <div className="flex items-center justify-between bg-warm-white rounded-card px-4 py-3">
          <div>
            <span className="text-sm text-navy font-medium">Sẵn sàng nhận cuốc</span>
            {isOnline && !hasLocation && (
              <p className="text-xs text-neutral-gray mt-0.5">Không có vị trí — sort "Gần nhất" không khả dụng</p>
            )}
          </div>
          <button
            onClick={handleToggleOnline}
            disabled={toggleMutation.isPending}
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

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-neutral-gray">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">straighten</span>
                  {trip.distance_km} km
                </span>
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">timer</span>
                  ~{trip.duration_min} phút
                </span>
                {trip.distance_to_driver != null && (
                  <span className="flex items-center gap-1 text-primary font-medium">
                    <span className="material-symbols-outlined text-sm">near_me</span>
                    ~{trip.distance_to_driver} km tới điểm đón
                  </span>
                )}
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
