import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

export function useCustomerStream(enabled: boolean) {
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const showToast = useUiStore((s) => s.showToast)

  useEffect(() => {
    if (!enabled || !token) return

    let source: EventSource
    let retryTimer: ReturnType<typeof setTimeout>

    const connect = () => {
      const url = `/api/customer/stream?token=${encodeURIComponent(token)}`
      source = new EventSource(url)

      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string)
          const bid = String(data.booking_id)

          if (data.type === 'connected') {
            queryClient.invalidateQueries({ queryKey: ['active-booking'] })
          } else if (data.type === 'booking_accepted') {
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
        } catch {
          // ignore malformed JSON
        }
      }

      source.onerror = () => {
        source.close()
        retryTimer = setTimeout(connect, 3_000)
      }
    }

    connect()

    return () => {
      clearTimeout(retryTimer)
      source?.close()
    }
  }, [enabled, token, queryClient, showToast])
}
