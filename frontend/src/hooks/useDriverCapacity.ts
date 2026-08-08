import { useQuery } from '@tanstack/react-query'
import { getMyTrips } from '@/api/trips'
import { MAX_ACTIVE_TRIPS } from '@/rules'

/**
 * Cuốc đang thực hiện của tài xế + tài xế đã kín việc hay chưa.
 *
 * Gom vào một chỗ vì hai nơi cần dùng: `TripListPage` để khoá nút "Nhận cuốc",
 * và `DriverLayout` để bỏ qua sự kiện cuốc mới khi đã đủ việc. Cùng queryKey nên
 * React Query gộp chung một request, không phát sinh thêm lượt gọi API.
 */
export function useDriverCapacity() {
  const { data: myTrips = [] } = useQuery({
    queryKey: ['my-trips'],
    queryFn: () => getMyTrips().then((r) => r.data),
  })

  return { myTrips, atCapacity: myTrips.length >= MAX_ACTIVE_TRIPS }
}
