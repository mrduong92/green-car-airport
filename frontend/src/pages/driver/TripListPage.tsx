import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAvailableTrips, getTripHistory, getWallet, toggleOnline, acceptTrip, getDriverProfile } from '@/api/trips'
import dayjs from 'dayjs'
import { fmtDateTime } from '@/utils/date'
import { apiMessage } from '@/utils/apiError'
import { useUiStore } from '@/stores/ui'
import EmptyState from '@/components/common/EmptyState'
import VipBadge from '@/components/common/VipBadge'
import { useDriverCapacity } from '@/hooks/useDriverCapacity'
import { MAX_ACTIVE_TRIPS } from '@/rules'
import clsx from 'clsx'

export default function TripListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const showToast = useUiStore((s) => s.showToast)
  const [sort, setSort] = useState('newest')
  const [hasLocation, setHasLocation] = useState(false)

  const { data: profile } = useQuery({
    queryKey: ['driver-profile'],
    queryFn: () => getDriverProfile().then((r) => r.data),
  })

  const isOnline = profile?.is_online ?? true

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => getWallet().then((r) => r.data),
  })

  // Dùng chung với DriverLayout (nơi quyết định có bỏ qua sự kiện cuốc mới hay
  // không) để ngưỡng "đủ việc" chỉ định nghĩa ở MỘT chỗ.
  const { myTrips, atCapacity } = useDriverCapacity()

  const { data: history = [] } = useQuery({
    queryKey: ['trip-history'],
    queryFn: () => getTripHistory().then((r) => r.data),
    staleTime: 60_000,
  })
  const todayTrips = history.filter((t) => dayjs(t.date).isSame(dayjs(), 'day'))
  const todayCount = todayTrips.length
  const todayRevenue = todayTrips.reduce((sum, t) => sum + (t.net_earning ?? 0), 0)

  const { data: trips = [] } = useQuery({
    queryKey: ['trips', sort],
    queryFn: () => getAvailableTrips({ sort }).then((r) => r.data),
    enabled: isOnline,
    refetchOnWindowFocus: true,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ online, latitude, longitude }: { online: boolean; latitude?: number; longitude?: number }) =>
      toggleOnline(online, latitude, longitude),
    onMutate: async ({ online }) => {
      await qc.cancelQueries({ queryKey: ['driver-profile'] })
      const prev = qc.getQueryData<App.DriverProfile>(['driver-profile'])
      qc.setQueryData<App.DriverProfile>(['driver-profile'], (old) =>
        old ? { ...old, is_online: online } : old,
      )
      return { prev }
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev) qc.setQueryData(['driver-profile'], ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['driver-profile'] })
    },
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
    onSuccess: (res, id) => {
      showToast('Đã nhận cuốc!', 'success')
      // Write the accepted trip into cache immediately so TripDetailPage
      // has data the instant it mounts — no spinner, no reload needed.
      qc.setQueryData<App.Trip[]>(['my-trips'], (prev = []) => [res.data, ...prev])
      qc.invalidateQueries({ queryKey: ['my-trips'] })
      qc.invalidateQueries({ queryKey: ['trips'] })
      navigate(`/driver/trips/${id}`)
    },
    // Hiện đúng lý do backend trả về. Nguyên nhân hay gặp nhất là hết điểm ví,
    // và tài xế chỉ biết đường nạp thêm nếu đọc được câu đó.
    onError: (err) => showToast(apiMessage(err, 'Nhận cuốc thất bại'), 'error'),
  })

  return (
    <div className="w-full flex flex-col">
      {/* Online toggle card */}
      <div className="mx-4 mt-3.5 bg-white rounded-card shadow-card border border-border-soft flex items-center gap-3 px-4 py-3.5">
        <div
          className="relative w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
          style={{ background: isOnline ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.12)' }}
        >
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: isOnline ? '#10B981' : '#94A3B8' }}
          />
          {isOnline && (
            <span
              className="absolute inset-0 rounded-[12px] border-2 border-success-green animate-ping"
              style={{ opacity: 0.25 }}
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-navy font-semibold text-[14px]">Sẵn sàng nhận cuốc</p>
          <p className="text-[12px] mt-0.5">
            {isOnline
              ? <><span className="text-success-green font-medium">● Online</span>{hasLocation ? ' · GPS bật' : ''}</>
              : <span className="text-neutral-dim">● Offline</span>
            }
          </p>
        </div>
        <button
          onClick={handleToggleOnline}
          disabled={toggleMutation.isPending}
          role="switch"
          aria-checked={isOnline}
          className={clsx(
            'relative w-[52px] h-[30px] rounded-full transition-colors duration-200 shrink-0 focus:outline-none disabled:opacity-50',
            isOnline ? 'bg-success-green' : 'bg-neutral-dim',
          )}
        >
          <span
            className={clsx(
              'absolute top-[3px] w-6 h-6 bg-white rounded-full shadow-md transition-all duration-200',
              isOnline ? 'left-[23px]' : 'left-[3px]',
            )}
          />
        </button>
      </div>

      {/* Active trips section */}
      {myTrips.length > 0 && (
        <div className="mx-4 mt-3">
          <div className="flex items-center justify-between mb-2 px-0.5">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-success-green animate-pulse" />
              <span className="text-[13px] font-semibold text-navy">Cuốc đang thực hiện</span>
            </div>
            <span className="text-[12px] font-bold text-primary bg-primary-tint px-2.5 py-0.5 rounded-pill">
              {myTrips.length}/{MAX_ACTIVE_TRIPS} cuốc
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {myTrips.map((trip) => (
              <button
                key={trip.id}
                type="button"
                onClick={() => navigate(`/driver/trips/${trip.id}`)}
                className="rounded-card overflow-hidden text-left w-full active:opacity-90 transition-opacity"
                style={{ background: 'linear-gradient(135deg, #006a36 0%, #004d27 100%)' }}
              >
                <div className="p-3.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="inline-block text-[10px] font-semibold bg-white/20 text-white px-2 py-0.5 rounded-pill mb-1.5">
                      {trip.status === 'in_progress' ? 'Đang di chuyển' : 'Đang đón'}
                    </span>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="material-symbols-outlined text-white text-[12px]"
                            style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
                      <p className="text-white text-[13px] font-semibold truncate">{trip.pickup}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-gold text-[12px]"
                            style={{ fontVariationSettings: "'FILL' 1" }}>flag</span>
                      <p className="text-white/80 text-[13px] truncate">{trip.destination}</p>
                    </div>
                    <p className="text-white/50 text-[11px] mt-1">{trip.distance_km} km · {fmtDateTime(trip.date, trip.time)}</p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <p className="text-white font-bold text-[15px] tabular-nums">
                      {trip.final_price.toLocaleString('vi')} đ
                    </p>
                    <span className="bg-white text-primary rounded-pill px-3 py-1.5 text-[12px] font-bold whitespace-nowrap">
                      Chi tiết →
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Today stats */}
      <div className="mx-4 mt-3 grid grid-cols-3 gap-2">
        <button
          onClick={() => navigate('/driver/trips/history?tab=today')}
          className="bg-white rounded-[10px] border border-border-soft text-center px-2 py-2.5 active:bg-light-green transition-colors"
        >
          <p className="font-bold text-[16px] tabular-nums text-primary">{todayCount}</p>
          <p className="text-[11px] text-neutral-gray mt-0.5">Cuốc hôm nay</p>
        </button>
        {[
          { val: todayRevenue > 0 ? `${todayRevenue.toLocaleString('vi')}đ` : '—', label: 'Doanh thu', color: 'text-success-green' },
          { val: wallet ? wallet.points.toLocaleString('vi') : '—', label: 'Điểm còn lại', color: 'text-gold' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-[10px] border border-border-soft text-center px-2 py-2.5">
            <p className={clsx('font-bold text-[16px] tabular-nums', s.color)}>{s.val}</p>
            <p className="text-[11px] text-neutral-gray mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Sort row */}
      <div className="px-4 py-4 flex items-center justify-between">
        <p className="text-[14px] font-semibold text-navy">
          {isOnline ? `${trips.length} cuốc đang chờ` : 'Cuốc xe'}
        </p>
        <button className="flex items-center gap-1 text-[12px] text-primary font-semibold">
          <span className="material-symbols-outlined text-[14px]">filter_list</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-transparent border-0 outline-none text-primary font-semibold text-[12px] cursor-pointer"
          >
            <option value="newest">Mới nhất</option>
            <option value="nearest">Gần nhất</option>
          </select>
        </button>
      </div>

      {/* Trip list */}
      <div className="flex flex-col px-4 gap-2.5 pb-4">
        {!isOnline && (
          <EmptyState icon="toggle_off" title="Bạn đang offline"
            description="Bật sẵn sàng nhận cuốc để thấy danh sách chuyến" />
        )}
        {isOnline && trips.length === 0 && (
          <EmptyState icon="directions_car" title="Chưa có cuốc xe nào"
            description="Hãy chờ khách đặt!" />
        )}
        {isOnline && trips.map((trip) => (
          <div key={trip.id} className="bg-white rounded-card shadow-card overflow-hidden border-l-[4px] border-l-primary border border-border-soft">
            <div className="p-3.5 flex flex-col gap-2.5">
              {/* Time + badges */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-navy">
                  <span className="material-symbols-outlined text-neutral-gray text-[14px]">schedule</span>
                  <span>{fmtDateTime(trip.date, trip.time)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {trip.is_vip && <VipBadge />}
                  {trip.distance_to_driver != null && (
                    <span className="text-[10px] font-semibold bg-primary-tint text-primary px-2 py-0.5 rounded-pill">
                      ~{trip.distance_to_driver} km
                    </span>
                  )}
                  {trip.is_new && (
                    <span className="text-[10px] font-bold bg-[#C8A24A] text-white px-2 py-0.5 rounded-pill">MỚI</span>
                  )}
                </div>
              </div>

              {/* Route */}
              <div className="flex gap-2.5">
                <div className="flex flex-col items-center pt-1 shrink-0">
                  <span className="material-symbols-outlined text-primary text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
                  <div className="w-[2px] flex-1 bg-border-gray my-0.5" />
                  <span className="material-symbols-outlined text-[#C8A24A] text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>flight</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-navy truncate">{trip.pickup}</p>
                  <p className="text-[11px] text-neutral-gray my-1">
                    {trip.distance_km} km · cách bạn {trip.distance_to_driver ?? '?'} km
                  </p>
                  <p className="text-[13px] font-semibold text-navy truncate">{trip.destination}</p>
                </div>
              </div>

              {/* Price breakdown */}
              <div className="flex flex-col gap-1.5 bg-warm-white rounded-[10px] px-3 py-2.5">
                <div className="flex justify-between text-[12px]">
                  <span className="text-neutral-gray">Giá cuốc</span>
                  <span className="text-navy font-medium tabular-nums">{trip.price.toLocaleString('vi')} đ</span>
                </div>
                {(trip.collection_fee ?? 0) > 0 && (
                  <div className="flex justify-between text-[12px]">
                    <span className="text-neutral-gray">Thu hộ</span>
                    <span className="text-navy font-medium tabular-nums">+{(trip.collection_fee ?? 0).toLocaleString('vi')} đ</span>
                  </div>
                )}
                <div className="h-px bg-border-gray" />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-neutral-gray">Khách trả</p>
                    <p className="text-[15px] font-semibold text-navy tabular-nums">{trip.final_price.toLocaleString('vi')} đ</p>
                  </div>
                  <span className="material-symbols-outlined text-neutral-dim text-[14px]">arrow_forward</span>
                  <div className="text-right">
                    <p className="text-[11px] text-neutral-gray">Phí app 20%</p>
                    <p className="text-[13px] font-semibold text-danger-red tabular-nums">-{trip.app_fee.toLocaleString('vi')}</p>
                  </div>
                </div>
              </div>

              {trip.customer_note && (
                <div className="flex items-start gap-2 bg-alert-orange/10 rounded-[10px] px-3 py-2">
                  <span className="material-symbols-outlined text-alert-orange text-[14px] mt-0.5 shrink-0"
                    style={{ fontVariationSettings: "'FILL' 1" }}>sticky_note_2</span>
                  <p className="text-[12px] text-navy line-clamp-2">{trip.customer_note}</p>
                </div>
              )}

              <button
                onClick={() => !atCapacity && acceptMutation.mutate(trip.id)}
                disabled={acceptMutation.isPending || atCapacity}
                className={clsx(
                  'w-full rounded-pill py-2.5 text-[14px] font-semibold transition-colors',
                  atCapacity
                    ? 'bg-border-gray text-neutral-gray cursor-not-allowed'
                    : 'bg-primary text-white disabled:opacity-50',
                )}
              >
                {atCapacity ? `Đã đủ ${MAX_ACTIVE_TRIPS} cuốc` : 'Nhận cuốc'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
