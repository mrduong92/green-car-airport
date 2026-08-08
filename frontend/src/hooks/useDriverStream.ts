import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { getEcho } from '@/echo'

type TripsEvent = {
  type: 'new_booking' | 'trip_taken' | 'booking_cancelled'
  booking_id: number
  driver_id?: number
}

/**
 * Cập nhật realtime danh sách cuốc cho tài xế, qua WebSocket (Reverb).
 *
 * Trước đây dùng SSE: mỗi tài xế đang mở app chiếm TRỌN 1 process PHP-FPM tới
 * 300s, nên trần chỉ ~90 người đồng thời và khi cạn worker thì mọi API khác
 * cũng xếp hàng theo. Reverb giữ kết nối trong event loop riêng.
 *
 * ⚠️ WebSocket chết khi khoá màn hình / app chạy nền — giống hệt SSE và polling.
 * Kênh duy nhất tới được tài xế lúc đó là web push (SendNewBookingBroadcastJob).
 */
export function useDriverStream(enabled: boolean) {
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const showToast = useUiStore((s) => s.showToast)

  useEffect(() => {
    if (!enabled || !token) return

    const echo = getEcho(token)
    const channel = echo.private('driver.trips')

    // Đồng bộ lại ngay khi kết nối: khoảng thời gian mất kết nối (khoá màn hình,
    // mất mạng) là khoảng mù, không có sự kiện nào được gửi lại.
    const resync = () => queryClient.invalidateQueries({ queryKey: ['trips'] })
    resync()
    echo.connector.pusher.connection.bind('connected', resync)

    channel.listen('.trips.updated', (data: TripsEvent) => {
      if (data.type === 'new_booking') {
        queryClient.invalidateQueries({ queryKey: ['trips'] })
      } else if (data.type === 'trip_taken') {
        // Gỡ cuốc đã bị nhận khỏi danh sách mà không cần gọi mạng
        queryClient.setQueriesData<App.Trip[]>(
          { queryKey: ['trips'] },
          (old) => old?.filter((t) => t.id !== data.booking_id) ?? old,
        )
      } else if (data.type === 'booking_cancelled') {
        queryClient.setQueriesData<App.Trip[]>(
          { queryKey: ['trips'] },
          (old) => old?.filter((t) => t.id !== data.booking_id) ?? old,
        )

        if (data.driver_id && data.driver_id === user?.id) {
          // Chính tài xế này đang giữ cuốc — đánh dấu đã huỷ trong cache để
          // TripDetailPage hiện trạng thái huỷ thay vì cuốc biến mất không dấu vết
          queryClient.setQueriesData<App.Trip[]>(
            { queryKey: ['my-trips'] },
            (old) => old?.map((t) =>
              t.id === data.booking_id ? { ...t, status: 'cancelled' as App.TripStatus } : t
            ) ?? old,
          )
          showToast('Khách đã hủy cuốc xe', 'info')
        } else {
          queryClient.invalidateQueries({ queryKey: ['my-trips'] })
        }
      }
    })

    return () => {
      echo.connector.pusher.connection.unbind('connected', resync)
      echo.leave('driver.trips')
    }
  }, [enabled, token, queryClient, user, showToast])
}
