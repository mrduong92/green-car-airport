import { useCallback, useState } from 'react'
import EmptyState from '@/components/common/EmptyState'
import FreeRideCard from '@/components/driver/FreeRideCard'
import FreeRideFilters from '@/components/driver/FreeRideFilters'
import FreeRideActionsSheet from '@/components/driver/FreeRideActionsSheet'
import { useFreeRides } from '@/hooks/useFreeRides'

const STORAGE_KEY = 'free-rides-filters'

function loadFilters(): App.FreeRideFilters {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as App.FreeRideFilters
  } catch {
    return {}
  }
}

export default function FreeRidesPage() {
  const [filters, setFilters] = useState<App.FreeRideFilters>(loadFilters)
  const [selected, setSelected] = useState<App.FreeRide | null>(null)
  const { rides, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, removeSender } = useFreeRides(filters)

  const changeFilters = useCallback((next: App.FreeRideFilters) => {
    setFilters(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* trình duyệt chặn lưu → chỉ mất ghi nhớ bộ lọc */ }
  }, [])

  return (
    <div className="w-full flex flex-col">
      <FreeRideFilters value={filters} onChange={changeFilters} />
      <div className="px-4 py-3">
        <p className="text-[12px] text-neutral-gray">
          Cuốc tổng hợp từ các nhóm Zalo. GreenCA chỉ kết nối — bạn trao đổi trực tiếp với người bắn cuốc.
        </p>
      </div>

      {isLoading ? (
        <p className="text-center text-sm text-neutral-gray py-10">Đang tải cuốc…</p>
      ) : rides.length === 0 ? (
        <EmptyState icon="local_taxi" title="Chưa có cuốc Free phù hợp" description="Thử đổi bộ lọc hoặc quay lại sau ít phút." />
      ) : (
        <div className="flex flex-col px-4 gap-2.5 pb-4">
          {rides.map((ride) => <FreeRideCard key={ride.ride_uid} ride={ride} onMore={setSelected} />)}
          {hasNextPage && (
            <button type="button" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}
              className="w-full min-h-touch text-sm text-primary font-medium">
              {isFetchingNextPage ? 'Đang tải…' : 'Xem thêm'}
            </button>
          )}
        </div>
      )}

      {selected && <FreeRideActionsSheet ride={selected} onClose={() => setSelected(null)} onSenderHidden={removeSender} />}
    </div>
  )
}
