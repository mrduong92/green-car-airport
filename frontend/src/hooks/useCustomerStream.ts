import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { getEcho } from '@/echo'

type BookingEvent = {
  type: 'booking_accepted' | 'trip_started' | 'trip_completed' | 'booking_cancelled_by_driver'
  booking_id: number
}

/**
 * Cập nhật realtime trạng thái chuyến cho khách, qua WebSocket (Reverb).
 * Xem ghi chú về lý do bỏ SSE ở {@link useDriverStream}.
 */
export function useCustomerStream(enabled: boolean) {
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const userId = useAuthStore((s) => s.user?.id)
  const showToast = useUiStore((s) => s.showToast)

  useEffect(() => {
    if (!enabled || !token || !userId) return

    const echo = getEcho(token)
    const channelName = `customer.${userId}`
    const channel = echo.private(channelName)

    const resync = () => queryClient.invalidateQueries({ queryKey: ['active-booking'] })
    resync()
    echo.connector.pusher.connection.bind('connected', resync)

    channel.listen('.booking.updated', (data: BookingEvent) => {
      const bid = String(data.booking_id)

      if (data.type === 'booking_accepted') {
        queryClient.invalidateQueries({ queryKey: ['booking', bid] })
        queryClient.invalidateQueries({ queryKey: ['active-booking'] })
        showToast('Tài xế đã nhận cuốc của bạn!', 'success')
      } else if (data.type === 'trip_started') {
        queryClient.invalidateQueries({ queryKey: ['booking', bid] })
        queryClient.invalidateQueries({ queryKey: ['active-booking'] })
      } else if (data.type === 'trip_completed') {
        queryClient.invalidateQueries({ queryKey: ['booking', bid] })
        queryClient.invalidateQueries({ queryKey: ['active-booking'] })
        queryClient.invalidateQueries({ queryKey: ['bookings'] })
      } else if (data.type === 'booking_cancelled_by_driver') {
        queryClient.invalidateQueries({ queryKey: ['booking', bid] })
        queryClient.invalidateQueries({ queryKey: ['active-booking'] })
        showToast('Tài xế đã huỷ, đang tìm tài xế mới...', 'info')
      }
    })

    return () => {
      echo.connector.pusher.connection.unbind('connected', resync)
      echo.leave(channelName)
    }
  }, [enabled, token, userId, queryClient, showToast])
}
