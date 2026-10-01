import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getTripHistory } from '@/api/trips'
import EmptyState from '@/components/common/EmptyState'
import clsx from 'clsx'
import dayjs from 'dayjs'

const FILTERS = [
  { key: 'today',  label: 'Hôm nay' },
  { key: 'week',   label: '7 ngày'  },
  { key: 'month',  label: 'Tháng này' },
  { key: 'all',    label: 'Tất cả'  },
] as const

type Filter = typeof FILTERS[number]['key']

function filterTrips(trips: App.Trip[], filter: Filter): App.Trip[] {
  const now = dayjs()
  return trips.filter((t) => {
    const d = dayjs(t.date)
    if (filter === 'today') return d.isSame(now, 'day')
    if (filter === 'week')  return d.isAfter(now.subtract(7, 'day').startOf('day'))
    if (filter === 'month') return d.isSame(now, 'month')
    return true
  })
}

const CANCELLED_BY_LABEL: Record<string, string> = {
  customer: 'Khách huỷ',
  driver: 'Bạn đã huỷ',
  system: 'Hệ thống huỷ',
}

function dateLabel(dateStr: string): string {
  const d = dayjs(dateStr)
  const now = dayjs()
  if (d.isSame(now, 'day'))                  return 'Hôm nay'
  if (d.isSame(now.subtract(1, 'day'), 'day')) return 'Hôm qua'
  return d.format('DD/MM/YYYY')
}

function groupByDate(trips: App.Trip[]): { date: string; label: string; trips: App.Trip[] }[] {
  const map = new Map<string, App.Trip[]>()
  for (const t of trips) {
    const key = t.date
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(t)
  }
  return Array.from(map.entries()).map(([date, trips]) => ({
    date,
    label: dateLabel(date),
    trips,
  }))
}

export default function TripHistoryPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') as Filter | null
  const [filter, setFilter] = useState<Filter>(
    tabParam && FILTERS.some((f) => f.key === tabParam) ? tabParam : 'all',
  )

  const handleSetFilter = (f: Filter) => {
    setFilter(f)
    setSearchParams(f === 'all' ? {} : { tab: f }, { replace: true })
  }

  const { data: allTrips = [], isLoading } = useQuery({
    queryKey: ['trip-history'],
    queryFn: () => getTripHistory().then((r) => r.data),
    staleTime: 60_000,
  })

  const trips = filterTrips(allTrips, filter)
  const totalEarning = trips.reduce((sum, t) => sum + t.net_earning, 0)
  const groups = groupByDate(trips)

  return (
    <div className="w-full flex flex-col">
      {/* Filter pills */}
      <div className="bg-white px-4 pt-3 pb-0 border-b border-border-gray">
        <div className="flex gap-2 overflow-x-auto pb-3">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => handleSetFilter(f.key)}
              className={clsx(
                'rounded-pill px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                filter === f.key ? 'bg-primary text-white' : 'bg-light-green text-primary',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary bar */}
      {trips.length > 0 && (
        <div className="mx-4 mt-4 bg-primary-tint rounded-card px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[18px]">receipt_long</span>
            <span className="text-sm font-semibold text-navy">{trips.length} chuyến</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] text-neutral-gray">Thu nhập</span>
            <span className="text-[15px] font-bold text-primary tabular-nums">
              {totalEarning.toLocaleString('vi')} đ
            </span>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex flex-col px-4 py-4 gap-4 pb-6">
        {isLoading && (
          <div className="flex justify-center py-10">
            <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
          </div>
        )}

        {!isLoading && trips.length === 0 && (
          <EmptyState
            icon="receipt_long"
            title="Chưa có chuyến nào"
            description="Các chuyến đã hoàn thành hoặc bị huỷ sẽ xuất hiện ở đây"
          />
        )}

        {groups.map(({ date, label, trips: dayTrips }) => (
          <div key={date} className="flex flex-col gap-2">
            {/* Date header */}
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-neutral-gray uppercase tracking-wide">{label}</span>
              <div className="flex-1 h-px bg-border-gray" />
              <span className="text-[11px] text-neutral-gray">
                {dayTrips.reduce((s, t) => s + t.net_earning, 0).toLocaleString('vi')} đ
              </span>
            </div>

            {/* Trip cards */}
            {dayTrips.map((trip) => (
              <button
                key={trip.id}
                onClick={() => navigate(`/driver/trips/${trip.id}`)}
                className="w-full bg-white rounded-card shadow-card overflow-hidden text-left"
              >
                <div className="flex items-center gap-3 px-4 py-3.5">
                  {/* Time */}
                  <div className="shrink-0 w-11 text-center">
                    <p className="text-[15px] font-bold text-navy leading-tight">{trip.time.slice(0, 5)}</p>
                    <p className="text-[10px] text-neutral-gray mt-0.5">{trip.distance_km} km</p>
                  </div>

                  {/* Divider */}
                  <div className="w-px self-stretch bg-border-gray" />

                  {/* Route */}
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-primary text-[13px] shrink-0"
                            style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
                      <p className="text-[13px] font-medium text-navy truncate">{trip.pickup}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-gold text-[13px] shrink-0"
                            style={{ fontVariationSettings: "'FILL' 1" }}>flag</span>
                      <p className="text-[13px] font-medium text-navy truncate">{trip.destination}</p>
                    </div>
                    {trip.status === 'cancelled' && (
                      <p className="text-[11px] text-danger-red font-medium mt-0.5">
                        {CANCELLED_BY_LABEL[trip.cancelled_by ?? ''] ?? 'Đã huỷ'}
                        {trip.cancel_reason ? ` · ${trip.cancel_reason}` : ''}
                      </p>
                    )}
                  </div>

                  {/* Earning */}
                  <div className="shrink-0 text-right">
                    {trip.status === 'cancelled' ? (
                      <span className="text-[11px] font-bold text-danger-red bg-danger-red/10 rounded-pill px-2 py-1">
                        Đã huỷ
                      </span>
                    ) : (
                      <>
                        <p className="text-[14px] font-bold text-success-green tabular-nums">
                          +{trip.net_earning.toLocaleString('vi')}
                        </p>
                        <p className="text-[10px] text-neutral-gray mt-0.5">đ</p>
                      </>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
