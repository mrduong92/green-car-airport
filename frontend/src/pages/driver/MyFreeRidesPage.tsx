import { useQuery, useQueryClient } from '@tanstack/react-query'
import EmptyState from '@/components/common/EmptyState'
import FreeRideCard from '@/components/driver/FreeRideCard'
import OwnRideActions from '@/components/driver/OwnRideActions'
import { getMyFreeRides, MY_FREE_RIDES_QUERY_KEY } from '@/api/freeRides'

const statusOf = (r: App.FreeRide, now: number) =>
  r.closed_at !== null ? 'Đã có xe' : r.expires_at <= now ? 'Hết hạn' : 'Đang mở'

export default function MyFreeRidesPage() {
  const qc = useQueryClient()
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: MY_FREE_RIDES_QUERY_KEY,
    queryFn: () => getMyFreeRides().then((r) => r.data.data),
    refetchOnMount: 'always',
  })
  const rides = data ?? []
  // Mốc "bây giờ" lấy từ lần tải dữ liệu (react-hooks/purity không cho gọi Date.now() khi render).
  const now = dataUpdatedAt

  if (isLoading) return <p className="text-center text-sm text-neutral-gray py-10">Đang tải…</p>
  if (rides.length === 0) {
    return <EmptyState icon="edit_note" title="Bạn chưa đăng cuốc nào" description="Bấm nút + giữa thanh menu để đăng cuốc." />
  }

  return (
    <div className="flex flex-col px-4 py-3 gap-2.5">
      <p className="text-[12px] text-neutral-gray">Cuốc bạn đăng trong 7 ngày gần nhất.</p>
      {rides.map((ride) => (
        <div key={ride.ride_uid} className="flex flex-col gap-1">
          <span data-testid="my-ride-status" className="text-[11px] font-semibold text-neutral-gray">{statusOf(ride, now)}</span>
          <FreeRideCard ride={ride} onMore={() => {}} onLocked={() => {}}
            ownActions={<OwnRideActions ride={ride} now={now} onRemoved={() => { void qc.invalidateQueries({ queryKey: MY_FREE_RIDES_QUERY_KEY }) }} />} />
        </div>
      ))}
    </div>
  )
}
