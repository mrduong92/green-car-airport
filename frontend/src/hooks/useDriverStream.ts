import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

export function useDriverStream(enabled: boolean) {
  const queryClient = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const showToast = useUiStore((s) => s.showToast)

  useEffect(() => {
    if (!enabled || !token) return

    let source: EventSource
    let retryTimer: ReturnType<typeof setTimeout>

    const connect = () => {
      const url = `/api/driver/stream?token=${encodeURIComponent(token)}`
      source = new EventSource(url)

      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string)
          if (data.type === 'new_booking') {
            queryClient.invalidateQueries({ queryKey: ['trips'] })
          } else if (data.type === 'trip_taken') {
            // Optimistically remove the taken trip without a network call
            queryClient.setQueriesData<App.Trip[]>(
              { queryKey: ['trips'] },
              (old) => old?.filter((t) => t.id !== data.booking_id) ?? old,
            )
          } else if (data.type === 'booking_cancelled') {
            // Remove from available trips list (for all drivers)
            queryClient.setQueriesData<App.Trip[]>(
              { queryKey: ['trips'] },
              (old) => old?.filter((t) => t.id !== data.booking_id) ?? old,
            )

            if (data.driver_id && data.driver_id === user?.id) {
              // This driver had accepted the booking — mark it cancelled in cache so
              // TripDetailPage shows the cancellation state instead of disappearing
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
          } else if (data.type === 'connected') {
            // Sync on every (re)connect to catch anything missed while offline
            queryClient.invalidateQueries({ queryKey: ['trips'] })
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
  }, [enabled, token, queryClient, user, showToast])
}
