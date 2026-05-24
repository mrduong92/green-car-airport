import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAvailableTrips, getMyTrips, getTripHistory, getWallet, toggleOnline, acceptTrip, getDriverProfile } from '@/api/trips'
import dayjs from 'dayjs'
import { useUiStore } from '@/stores/ui'
import EmptyState from '@/components/common/EmptyState'
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

  const { data: myTrips = [] } = useQuery({
    queryKey: ['my-trips'],
    queryFn: () => getMyTrips().then((r) => r.data),
    refetchInterval: 10_000,
  })
  const activeTrip = myTrips[0] ?? null

  const { data: history = [] } = useQuery({
    queryKey: ['trip-history'],
    queryFn: () => getTripHistory().then((r) => r.data),
    staleTime: 60_000,
  })
  const todayCount = history.filter((t) => dayjs(t.date).isSame(dayjs(), 'day')).length

  const { data: trips = [] } = useQuery({
    queryKey: ['trips', sort],
    queryFn: () => getAvailableTrips({ sort }).then((r) => r.data),
    refetchInterval: isOnline && !activeTrip ? 15_000 : false,
    enabled: isOnline && !activeTrip,
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
    onSuccess: (_, id) => {
      showToast('Đã nhận cuốc!', 'success')
      qc.invalidateQueries({ queryKey: ['trips'] })
      navigate(`/driver/trips/${id}`)
    },
    onError: () => showToast('Nhận cuốc thất bại', 'error'),
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

      {/* Active trip banner */}
      {activeTrip && (
        <div className="mx-4 mt-3 rounded-card overflow-hidden"
             style={{ background: 'linear-gradient(135deg, #1E3A8A 0%, #162C6B 100%)' }}>
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block w-2 h-2 rounded-full bg-success-green animate-pulse" />
              <span className="text-white/70 text-[11px] font-semibold uppercase tracking-widest flex-1">
                Cuốc đang thực hiện
              </span>
              <span className="bg-white/20 text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-pill">
                {activeTrip.status === 'picking_up'  ? 'Đang đến đón'
                : activeTrip.status === 'in_progress' ? 'Đang chạy'
                :                                        'Đã nhận'}
              </span>
            </div>

            <div className="flex gap-2.5 mb-3">
              <div className="flex flex-col items-center pt-0.5 shrink-0">
                <span className="material-symbols-outlined text-white text-[14px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
                <div className="w-[2px] flex-1 bg-white/20 my-0.5 min-h-[12px]" />
                <span className="material-symbols-outlined text-gold text-[14px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}>flag</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-[13px] font-semibold truncate">{activeTrip.pickup}</p>
                <p className="text-white/50 text-[11px] my-1">{activeTrip.distance_km} km</p>
                <p className="text-white text-[13px] font-semibold truncate">{activeTrip.destination}</p>
              </div>
              <div className="shrink-0 text-right self-center">
                <p className="text-white/60 text-[10px]">Thu nhập</p>
                <p className="text-white font-bold text-[16px] tabular-nums">
                  {activeTrip.net_earning.toLocaleString('vi')} đ
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate(`/driver/trips/${activeTrip.id}`)}
              className="w-full bg-white text-primary rounded-pill py-2.5 text-[14px] font-bold"
            >
              Tiếp tục chuyến →
            </button>
          </div>
        </div>
      )}

      {/* Today stats */}
      <div className="mx-4 mt-3 grid grid-cols-3 gap-2">
        <button
          onClick={() => navigate('/driver/trips/history')}
          className="bg-white rounded-[10px] border border-border-soft text-center px-2 py-2.5 active:bg-light-green transition-colors"
        >
          <p className="font-bold text-[16px] tabular-nums text-primary">{todayCount}</p>
          <p className="text-[11px] text-neutral-gray mt-0.5">Cuốc hôm nay</p>
        </button>
        {[
          { val: '—', label: 'Doanh thu', color: 'text-success-green' },
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
          {isOnline ? `${trips.length} cuốc gần đây` : 'Cuốc xe'}
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
        {isOnline && activeTrip && (
          <EmptyState icon="do_not_disturb_on" title="Bạn đang có cuốc chạy"
            description="Hoàn thành chuyến hiện tại trước khi nhận cuốc mới" />
        )}
        {isOnline && !activeTrip && trips.length === 0 && (
          <EmptyState icon="directions_car" title="Chưa có cuốc xe nào"
            description="Hãy chờ khách đặt!" />
        )}
        {isOnline && !activeTrip && trips.map((trip) => (
          <div key={trip.id} className="bg-white rounded-card shadow-card overflow-hidden border-l-[4px] border-l-primary border border-border-soft">
            <div className="p-3.5 flex flex-col gap-2.5">
              {/* Time + badges */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-navy">
                  <span className="material-symbols-outlined text-neutral-gray text-[14px]">schedule</span>
                  <span>{trip.time} · {trip.date}</span>
                </div>
                <div className="flex items-center gap-1.5">
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
              <div className="flex items-center justify-between bg-warm-white rounded-[10px] px-3 py-2.5">
                <div>
                  <p className="text-[11px] text-neutral-gray">Khách trả</p>
                  <p className="text-[15px] font-semibold text-navy tabular-nums">{trip.price.toLocaleString('vi')} đ</p>
                </div>
                <span className="material-symbols-outlined text-neutral-dim text-[14px]">arrow_forward</span>
                <div>
                  <p className="text-[11px] text-neutral-gray">Phí app 20%</p>
                  <p className="text-[13px] font-semibold text-danger-red tabular-nums">-{trip.app_fee.toLocaleString('vi')}</p>
                </div>
                <div className="w-[1px] h-8 bg-border-gray" />
                <div className="text-right">
                  <p className="text-[11px] text-neutral-gray">Bạn nhận</p>
                  <p className="text-[15px] font-semibold text-success-green tabular-nums">
                    {Math.round(trip.price * 0.8).toLocaleString('vi')} đ
                  </p>
                </div>
              </div>

              <button
                onClick={() => acceptMutation.mutate(trip.id)}
                disabled={acceptMutation.isPending}
                className="w-full bg-primary text-white rounded-pill py-2.5 text-[14px] font-semibold disabled:opacity-50"
              >
                Nhận cuốc
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
